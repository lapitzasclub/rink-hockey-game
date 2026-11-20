import * as Phaser from 'phaser'
import { AI_CHARGE_PRESSURE_PX, GAME_HEIGHT, GOALIE_SELECT_RANGE, HUMAN_SIM, SIM_STEP_MS, TOUCH_SPRINT_STICK, aiProfileFor } from '../../game/constants'
import { pollGamepad } from '../../game/input/gamepad'
import { aiStateOf, dribbleScore, evaluatePasses, isAvailable, nearestRivalDist, passPick, shotScore } from '../../game/systems/aiDecision'
import { findPlayerById, getControlledPlayer } from '../../game/systems/playerHelpers'
import type { Player } from '../../game/types'
import { getGoalLineX } from '../../game/utils'

/**
 * Persona simulada en el humo (B-02, `human=touch|pad`). Mueve al controlado del azul por la
 * misma entrada que una persona: en táctil escribe en `joystickInput` como nipplejs y los botones
 * (vector ≤ 0,5, sprint con el stick a fondo, CAMBIO = PASE sin bola); con mando, un Gamepad falso
 * que lee `pollGamepad`. Qué quiere hacer lo decide con las puntuaciones de la IA, pero lo ejecuta
 * como una persona: con retardo, error de pulgar, sin anticipar pases y cargas variables. El
 * resultado (ayudas de tiro y pase, cambio de jugador, presión) lo calcula el juego.
 */

export type HumanKind = 'touch' | 'pad'

type Stick = { x: number, y: number, pass: boolean, shoot: boolean, switch: boolean, sprint: boolean }
type HumanView = Phaser.Scene & {
  players: Player[]
  ball: { x: number, y: number }
  ballCarrierId: string | null
  controlledPlayerIndex: number
  activeFoulRestart: null | { takerPlayerId: string, readyAt: number, sanction: string }
  activeBully: unknown
  activeKickoff: unknown
  restartAt: number
  matchEnded: boolean
  simNow: number
  joystickInput: Stick
  labTouch: boolean | null
}

type ProgKind = 'shot' | 'pass' | 'switch' | 'press' | 'foul'
const AIM_NONE = 0, AIM_GOAL = 1, AIM_MATE = 2
const DELAY_LEN = 64
const CY = GAME_HEIGHT / 2

const rand = (r: number[]) => r[0] + Math.random() * (r[1] - r[0])
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const dist = (a: { x: number, y: number }, b: { x: number, y: number }) => Math.hypot(a.x - b.x, a.y - b.y)

/** Pulsaciones de la persona por tipo: pulsadas y abandonadas antes de pulsar (la jugada cambió). */
export type HumanActs = Record<ProgKind, number> & { dropped: number }

/**
 * Arranca el conductor; `stop` suelta stick y botones y quita el mando falso, `acts` cuenta lo que
 * hizo (va en el JSON del humo para ver que la persona juega).
 */
export function startHumanSim(match: Phaser.Scene, kind: HumanKind) {
  const s = match as HumanView
  const P = HUMAN_SIM[kind]
  // B-05 cuelga las ayudas táctiles de isTouchDevice: el táctil lo es y el mando no
  s.labTouch = kind === 'touch'
  const profile = aiProfileFor('blue')
  const delaySteps = Math.min(DELAY_LEN - 1, Math.round(P.reactionMs / SIM_STEP_MS))
  const kSmooth = 1 - Math.exp(-SIM_STEP_MS / P.stickSmoothMs)

  // Línea de retardo de lo que quiere hacer el stick: ángulo, recorrido (0 = suelto) y ganas de correr
  const dAng = new Float32Array(DELAY_LEN)
  const dDefl = new Float32Array(DELAY_LEN)
  const dRun = new Uint8Array(DELAY_LEN)
  let head = 0
  const want = { ang: 0, defl: 0, run: false }
  let stickAng = 0
  let stickDefl = 0
  let noise = 0
  let noiseTarget = 0
  let gesture = P.cruise
  let gestureRun = false
  let nextGestureAt = 0

  /** Pulsación en curso o programada: un botón cada vez, como un pulgar. */
  const prog = { active: false, kind: 'shot' as ProgKind, button: 'shoot' as 'pass' | 'shoot', pressAt: 0, releaseAt: 0, aim: AIM_NONE, mateId: '', err: 0, foul: null as unknown, pressed: false }
  const acts: HumanActs = { shot: 0, pass: 0, switch: 0, press: 0, foul: 0, dropped: 0 }
  const out = { pass: false, shoot: false }
  let nextThinkAt = 0
  let lastSwitchAt = -Infinity

  // Mando falso (standard mapping): A = 0 pase · cambio, X = 2 tiro · robo, RT = 7 sprint
  const fakeButtons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  const fakePad = { id: 'lab-human', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: fakeButtons }
  const fakeList = [fakePad as unknown as Gamepad]
  if (kind === 'pad') Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => fakeList })

  const cancel = () => {
    if (prog.active && !prog.pressed) acts.dropped++
    prog.active = false
    out.pass = false
    out.shoot = false
  }
  const begin = (k: ProgKind, button: 'pass' | 'shoot', now: number, holdMs: number, aim: number, err: number, mateId = '') => {
    prog.active = true
    prog.pressed = false
    prog.kind = k
    prog.button = button
    prog.pressAt = now + P.reactionMs + Math.random() * P.reactionJitterMs + (aim !== AIM_NONE ? 40 : 0)
    prog.releaseAt = prog.pressAt + holdMs
    prog.aim = aim
    prog.err = err
    prog.mateId = mateId
    prog.foul = s.activeFoulRestart
  }
  /** Duración de la pulsación: toque corto (sin carga) o carga en el rango del perfil. */
  const holdFor = (c: Player, shot: boolean, now: number) => {
    const pressed = nearestRivalDist(c.pos.x, c.pos.y, c.team, s.players, now) < AI_CHARGE_PRESSURE_PX
    if (pressed && Math.random() < P.tapUnderPressure) return 50 + Math.random() * 50
    if (!shot && Math.random() >= P.passChargeChance) return 50 + Math.random() * 50
    return rand(shot ? P.shotHoldMs : P.passHoldMs)
  }
  const errOf = (r: number) => (Math.random() * 2 - 1) * r
  /** Compañero de campo más adelantado (donde está ahora: la persona no anticipa). */
  const forwardMate = (from: Player, now: number) => {
    let best: Player | null = null
    let bestX = -Infinity
    const dir = from.side === 'left' ? 1 : -1
    for (const p of s.players) {
      if (p.team !== from.team || p === from || p.role === 'goalie' || !isAvailable(p, now)) continue
      if (p.pos.x * dir > bestX) { bestX = p.pos.x * dir; best = p }
    }
    return best
  }

  /** ¿Sigue teniendo sentido la pulsación? Si no, se suelta. */
  const valid = (c: Player) => {
    const carrier = s.ballCarrierId ? findPlayerById(s.players, s.ballCarrierId) : null
    switch (prog.kind) {
      case 'shot': case 'pass': return carrier === c
      case 'switch': return carrier !== c
      case 'press': return !!carrier && carrier.team !== c.team && dist(carrier.pos, c.pos) <= P.pressRangePx * 1.5
      case 'foul': return !!s.activeFoulRestart && s.activeFoulRestart === prog.foul
    }
  }

  /** Relee la jugada y, si toca, programa tiro, pase, CAMBIO o ROBAR. */
  const think = (c: Player, now: number) => {
    const f = s.activeFoulRestart
    if (f) {
      const taker = findPlayerById(s.players, f.takerPlayerId)
      if (!taker || taker.team !== 'blue' || now < f.readyAt) return
      const free = f.sanction === 'free-hit'
      const mate = free ? forwardMate(taker, now) : null
      const hold = free ? 50 + Math.random() * 60 : rand(P.shotHoldMs)
      begin('foul', free ? 'pass' : 'shoot', now + rand(P.lineUpMs) - P.reactionMs * 0.5, hold, mate ? AIM_MATE : AIM_GOAL, errOf(free ? P.passErrorRad : P.aimErrorRad), mate?.id)
      return
    }
    if (s.activeKickoff || s.activeBully || s.restartAt > 0) return
    const carrier = s.ballCarrierId ? findPlayerById(s.players, s.ballCarrierId) : null
    const sinceBall = now - aiStateOf(c).gotBallAt

    if (carrier === c) {
      if (sinceBall < P.reactionMs) return
      if (c.role === 'goalie') {
        // Portero en sus manos: saca hacia el más adelantado tras mirar un momento
        const mate = forwardMate(c, now)
        if (mate && sinceBall > P.reactionMs + 300) begin('pass', 'pass', now, 60, AIM_MATE, errOf(P.passErrorRad), mate.id)
        return
      }
      const shot = shotScore(c, s.players, now)
      evaluatePasses(c, s.players, profile, now)
      const pass = passPick.mate ? passPick.score : 0
      const dribble = dribbleScore(c, s.players, profile, now)
      // Mismo orden que decideCarrierAction, pero sin dejar la dirección exacta de la IA
      const wantsPass = pass >= profile.passThreshold && pass > dribble && !!passPick.mate
      if (shot >= profile.shootThreshold && shot >= pass * 0.9) begin('shot', 'shoot', now, holdFor(c, true, now), AIM_GOAL, errOf(P.aimErrorRad))
      else if (wantsPass) begin('pass', 'pass', now, holdFor(c, false, now), AIM_MATE, errOf(P.passErrorRad), passPick.mate!.id)
      else if (dribble < 0.08 && shot >= profile.shootThreshold * 0.6) begin('shot', 'shoot', now, holdFor(c, true, now), AIM_GOAL, errOf(P.aimErrorRad))
      return
    }

    if (carrier && carrier.team !== c.team && c.role !== 'goalie' && dist(carrier.pos, c.pos) <= P.pressRangePx) {
      begin('press', 'shoot', now, Infinity, AIM_NONE, 0)
      return
    }
    if (carrier && carrier.team === c.team) return
    // CAMBIO: defendiendo (o con la bola suelta) y lejos de ella, con el stick hacia donde va
    if (now - lastSwitchAt < P.switchCooldownMs || Math.random() >= P.switchChance) return
    const myD = c.role === 'goalie' ? Infinity : dist(c.pos, s.ball)
    if (c.role === 'goalie') {
      if (Math.hypot(getGoalLineX(c.side) - s.ball.x, CY - s.ball.y) < GOALIE_SELECT_RANGE + 40) return
    } else if (myD <= P.switchFarPx) return
    let closer = false
    for (const p of s.players) {
      if (p.team === c.team && p !== c && p.role !== 'goalie' && isAvailable(p, now) && dist(p.pos, s.ball) < myD - 80) closer = true
    }
    if (!closer) return
    lastSwitchAt = now
    begin('switch', 'pass', now, 60 + Math.random() * 40, AIM_NONE, 0)
  }

  /** Lo que querría marcar con el stick ahora mismo (entra en la línea de retardo). */
  const intent = (c: Player, now: number) => {
    want.defl = 0
    want.run = false
    if (s.matchEnded || s.restartAt > 0 || s.activeKickoff || s.activeBully) return
    const f = s.activeFoulRestart
    const from = f ? findPlayerById(s.players, f.takerPlayerId) : c
    if (!from) return
    if (prog.active && prog.aim !== AIM_NONE && now >= prog.pressAt - P.reactionMs - 40) {
      let tx = getGoalLineX(from.side === 'left' ? 'right' : 'left')
      let ty = CY
      const mate = prog.aim === AIM_MATE ? findPlayerById(s.players, prog.mateId) : null
      if (mate) { tx = mate.pos.x; ty = mate.pos.y }
      want.ang = Math.atan2(ty - from.pos.y, tx - from.pos.x) + prog.err
      want.defl = 1
      return
    }
    if (f) return
    const dir = c.side === 'left' ? 1 : -1
    const carrier = s.ballCarrierId ? findPlayerById(s.players, s.ballCarrierId) : null
    let tx: number, ty: number
    if (c.role === 'goalie') {
      // Portero en sus manos: sigue la bola en su línea
      tx = getGoalLineX(c.side) + dir * 22
      ty = CY + Phaser.Math.Clamp(s.ball.y - CY, -60, 60)
      if (Math.hypot(tx - c.pos.x, ty - c.pos.y) < 6) return
    } else if (carrier === c) {
      // Conduce hacia la zona de tiro, apartándose del rival que tiene delante
      const goalX = getGoalLineX(c.side === 'left' ? 'right' : 'left')
      tx = goalX - dir * 120
      ty = CY + Phaser.Math.Clamp(c.pos.y - CY, -90, 90)
      if ((c.pos.x - (goalX - dir * 20)) * dir > 0 && Math.abs(c.pos.y - CY) < 120) {
        // Detrás de la portería: primero salir por el lado
        tx = goalX - dir * 90
        ty = c.pos.y < CY ? CY - 150 : CY + 150
      }
      let near: Player | null = null
      let nd = 110
      for (const r of s.players) {
        if (r.team === c.team || r.role === 'goalie' || !isAvailable(r, now)) continue
        const d = dist(r.pos, c.pos)
        if (d < nd && (r.pos.x - c.pos.x) * dir > -10) { nd = d; near = r }
      }
      if (near) ty += (c.pos.y >= near.pos.y ? 1 : -1) * 90 * (1 - nd / 110)
      want.run = Math.abs(goalX - c.pos.x) > 320
    } else if (carrier && carrier.team !== c.team) {
      // Defiende yendo al lado de portería del portador
      const ox = getGoalLineX(c.side) - carrier.pos.x
      const oy = CY - carrier.pos.y
      const ol = Math.hypot(ox, oy) || 1
      tx = carrier.pos.x + (ox / ol) * 28
      ty = carrier.pos.y + (oy / ol) * 28
      want.run = dist(carrier.pos, c.pos) > 180
    } else if (carrier) {
      // La lleva el portero propio: se ofrece hacia delante
      tx = c.pos.x + dir * 120
      ty = c.pos.y
    } else {
      tx = s.ball.x
      ty = s.ball.y
      want.run = dist(s.ball, c.pos) > 170
    }
    want.ang = Math.atan2(ty - c.pos.y, tx - c.pos.x)
    want.defl = 1
  }

  /** Retardo, giro suavizado, error de pulgar y recorrido del gesto; escribe la entrada. */
  const drive = () => {
    if (!s.players?.length) return
    const now = s.simNow
    const c = getControlledPlayer(s.players, s.controlledPlayerIndex)
    if (s.matchEnded) { cancel(); write(0, 0, false); return }

    if (prog.active && !valid(c)) cancel()
    if (!prog.active && now >= nextThinkAt) {
      nextThinkAt = now + P.thinkMs * (0.75 + Math.random() * 0.5)
      think(c, now)
    }
    intent(c, now)
    dAng[head] = want.ang
    dDefl[head] = want.defl
    dRun[head] = want.run ? 1 : 0
    const tail = (head - delaySteps + DELAY_LEN) % DELAY_LEN
    head = (head + 1) % DELAY_LEN
    const ang = dAng[tail]
    const defl = dDefl[tail]
    const run = dRun[tail] === 1

    if (now >= nextGestureAt || run !== gestureRun) {
      nextGestureAt = now + P.noiseHoldMs * (0.6 + Math.random() * 0.8)
      gestureRun = run
      noiseTarget = errOf(P.stickNoiseRad)
      if (run) gesture = Math.random() < P.shortChance ? 0.7 + Math.random() * 0.17 : 1
      else gesture = Math.random() < P.overshootChance ? 1 : Math.min(1, P.cruise + errOf(0.12))
    }
    noise += (noiseTarget - noise) * kSmooth
    if (defl > 0 && stickDefl === 0) stickAng = ang // el pulgar se apoya ya en la dirección
    else stickAng = wrap(stickAng + wrap(ang - stickAng) * kSmooth)
    stickDefl = defl > 0 ? stickDefl + (defl * gesture - stickDefl) * Math.min(1, kSmooth * 2) : 0

    if (prog.active) {
      const held = now >= prog.pressAt && now < prog.releaseAt
      if (held && !prog.pressed) { prog.pressed = true; acts[prog.kind]++ }
      out.pass = held && prog.button === 'pass'
      out.shoot = held && prog.button === 'shoot'
      if (now >= prog.releaseAt) cancel()
    }
    write(stickAng + noise, stickDefl, kind === 'pad' ? run : stickDefl >= TOUCH_SPRINT_STICK)
  }

  const write = (a: number, d: number, sprint: boolean) => {
    const on = d > 0
    if (kind === 'touch') {
      const j = s.joystickInput
      j.x = on ? Math.cos(a) * 0.5 * d : 0
      j.y = on ? Math.sin(a) * 0.5 * d : 0
      j.sprint = on && sprint
      j.pass = out.pass
      j.shoot = out.shoot
      j.switch = false
      return
    }
    fakePad.axes[0] = on ? Math.cos(a) * d : 0
    fakePad.axes[1] = on ? Math.sin(a) * d : 0
    setButton(0, out.pass)
    setButton(2, out.shoot)
    setButton(7, on && sprint)
    pollGamepad()
  }
  const setButton = (i: number, on: boolean) => {
    fakeButtons[i].pressed = on
    fakeButtons[i].value = on ? 1 : 0
  }

  match.events.on(Phaser.Scenes.Events.UPDATE, drive)
  const stop = () => {
    match.events.off(Phaser.Scenes.Events.UPDATE, drive)
    cancel()
    write(0, 0, false)
    if (kind === 'pad') {
      Reflect.deleteProperty(navigator, 'getGamepads')
      pollGamepad()
    }
  }
  return { stop, acts }
}
