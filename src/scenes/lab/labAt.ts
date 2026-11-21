import * as Phaser from 'phaser'
import { worldToScreen } from '../../game/render/viewTransform'
import { FREE_HIT_BOARD_MARGIN, RINK } from '../../game/constants'
import type { LabParams } from './labParams'
import type { SmokeHooks } from './labSmoke'

/**
 * Capturas por evento (WP-66): bloqueo de la cámara principal del partido, `follow=` y `at=`.
 * Lee por nombre campos privados de MatchScene/Officials (solo lab, solo lectura).
 */

/** Tiempo máximo de juego esperando el evento antes de congelar igualmente. */
const AT_TIMEOUT_MS = 180000
/** Desplazamiento vertical (px de pantalla) para encuadrar el torso y no los pies. */
const FOLLOW_LIFT = 24

type Team = 'blue' | 'red'
interface Pos { x: number, y: number }
type MatchView = Phaser.Scene & {
  labCameraLock: boolean
  ball: Pos
  ballVelocity: Pos
  ballCarrierId: string | null
  players: Array<{ id: string, team: Team, role: string, pos: Pos, suspendedUntil?: number, anim?: { type: string, at: number } }>
  blueScore: number
  redScore: number
  ruleState: { teamFouls: Record<Team, number>, passivity?: { hudKind: string | null } }
  activeFoulRestart: unknown
  activeKickoff: unknown
  simNow: number
  officials?: { refs?: Array<{ x: number, y: number, gesture: unknown }> }
}

/** ¿Pide esta URL tocar la cámara principal del partido? */
export const wantsCameraLock = (p: LabParams) => p.zoom !== null || p.cx !== null || p.cy !== null || p.follow !== null

/** Posición en pantalla del objeto de `follow`, o null si no hay (el árbitro cae a la bola). */
function followPoint(s: MatchView, follow: string | null): Pos | null {
  if (!follow) return null
  let w: Pos | null = null
  if (follow === 'referee') {
    const refs = s.officials?.refs
    if (refs?.length) {
      const near = (r: Pos) => Math.hypot(r.x - s.ball.x, r.y - s.ball.y)
      const r = refs.find(f => f.gesture) ?? refs.reduce((a, b) => (near(a) < near(b) ? a : b))
      w = { x: r.x, y: r.y }
    }
  } else if (follow === 'goalie-blue' || follow === 'goalie-red') {
    const g = s.players?.find(p => p.role === 'goalie' && p.team === follow.slice(7))
    if (g) w = g.pos
  }
  w ??= s.ball
  const p = worldToScreen(w.x, w.y)
  return { x: p.x, y: p.y - FOLLOW_LIFT }
}

/** Coloca la cámara principal según zoom/cx/cy/follow; `useFollow` solo al congelar. */
function placeCamera(s: MatchView, p: LabParams, useFollow: boolean) {
  const cam = s.cameras.main
  if (p.zoom !== null) cam.setZoom(p.zoom)
  const target = useFollow ? followPoint(s, p.follow) : null
  if (target) { cam.centerOn(target.x, target.y); return }
  if (p.cx !== null || p.cy !== null) {
    const w = worldToScreen(p.cx ?? 640, p.cy ?? 360)
    cam.centerOn(p.cx !== null ? w.x : cam.midPoint.x, p.cy !== null ? w.y : cam.midPoint.y)
  }
}

/** Bloquea la cámara al crearse el partido y la recoloca tras cada paso (arcade la mueve en saques). */
export function lockMatchCamera(match: Phaser.Scene, p: LabParams) {
  const s = match as MatchView
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    s.labCameraLock = true
    placeCamera(s, p, false)
    match.events.on(Phaser.Scenes.Events.POST_UPDATE, () => { if (s.labCameraLock) placeCamera(s, p, false) })
  })
}

/** Congela el partido: centra en `follow` y pausa la escena. */
export function freezeMatch(match: Phaser.Scene, p: LabParams) {
  const s = match as MatchView
  if (p.follow) {
    s.labCameraLock = true
    placeCamera(s, p, true)
  }
  match.game.scene.pause('match')
}

/**
 * Ganchos para el paso fijo del humo: detectan el evento `at`, dejan pasar `after` ms
 * y congelan. Tras detener el bucle manual se reanuda el de Phaser para que se renderice.
 */
export function atHooks(match: Phaser.Scene, p: LabParams): SmokeHooks {
  const s = match as MatchView
  const at = p.at ?? ''
  const atMs = /^\d+(\.\d+)?$/.test(at) ? Number(at) : null
  const prev = { goals: 0, fouls: 0, foul: false, kickoff: false, susp: new Map<string, number>(), saveAt: 0, gk: null as string | null, speed: 0 }
  let hitMs: number | null = null

  const detect = (ms: number): boolean => {
    const goals = s.blueScore + s.redScore
    const fouls = s.ruleState.teamFouls.blue + s.ruleState.teamFouls.red
    const foulNow = !!s.activeFoulRestart
    // Parada: el portero bloca una bola rápida o arranca su clip de parada
    const carrier = s.ballCarrierId ? s.players.find(q => q.id === s.ballCarrierId) : undefined
    const gk = carrier?.role === 'goalie' ? carrier.id : null
    let saveAt = prev.saveAt
    for (const q of s.players) {
      if (q.role === 'goalie' && q.anim?.type === 'save' && q.anim.at > saveAt) saveAt = q.anim.at
    }
    let carded = false
    for (const q of s.players) {
      const su = q.suspendedUntil ?? 0
      if (su > (prev.susp.get(q.id) ?? 0) && su > s.simNow) carded = true
      prev.susp.set(q.id, su)
    }
    const hit = atMs !== null ? ms >= atMs
      : at === 'goal' ? goals > prev.goals
      : at === 'foul' ? fouls > prev.fouls || (foulNow && !prev.foul)
      : at === 'card' ? carded
      // R-05: pitido del saque de centro (activeKickoff pasa de no nulo a null)
      : at === 'kickoff' ? prev.kickoff && !s.activeKickoff
      : at === 'save' ? (gk !== null && gk !== prev.gk && prev.speed > 150) || saveAt > prev.saveAt
      // B-10: cuenta atrás de tiempo de posesión (≤ 5 s) o aviso de juego pasivo en el HUD
      : at === 'countdown' || at === 'passive' ? s.ruleState.passivity?.hudKind === (at === 'countdown' ? 'possession' : 'passive')
      : false
    prev.kickoff = !!s.activeKickoff
    prev.goals = goals; prev.fouls = fouls; prev.foul = foulNow; prev.saveAt = saveAt; prev.gk = gk
    prev.speed = Math.hypot(s.ballVelocity.x, s.ballVelocity.y)
    return hit
  }

  return {
    onStep: (ms, stop) => {
      if (hitMs === null) {
        if (detect(ms)) { hitMs = ms; console.log(`[at] ${at} t=${Math.round(ms)}`) }
        else if (ms >= AT_TIMEOUT_MS) { console.log('[at] timeout'); stop() }
      }
      if (hitMs !== null && ms >= hitMs + p.after) stop()
    },
    onDone: () => {
      freezeMatch(match, p)
      const g = match.game
      g.loop.start(g.step.bind(g))
    },
  }
}

/** Vuelve a posar la escena cercana con el mismo instante y la cámara actual del partido. */
function repose(match: Phaser.Scene, s: DuelView) {
  const sp = match.scene.get('setpiece') as unknown as { lastVt: number, owns: boolean, frame: (...a: unknown[]) => boolean } | null
  if (sp?.owns) sp.frame(sp.lastVt, match.cameras.main, s.duel, s.players, s.ball, s.duel.z, s.ballCarrierId)
}

type DuelView = MatchView & {
  activeKickoff: unknown
  ruleState: { pendingFoul: unknown }
  joystickInput: { x: number, y: number }
  duel: { active: boolean, startedAt: number, endedAt: number, end: string | null, z: number }
}

/**
 * L-02 (`sp=force`): en vez del saque inicial pita un penalti o directo (`kind`) a favor de
 * `taker`; `spAt=<ms>` congela a esos ms del pitido y `spAt=end+<ms>` tras acabar el duelo;
 * `spStick=x,y` fija el stick de la persona mientras dura.
 */
export function forceSetPiece(match: Phaser.Scene, p: LabParams) {
  const s = match as DuelView
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    let fouled = false
    let stopped = false
    let whistle = -1
    const at = p.spAt ?? ''
    const afterEnd = at.startsWith('end+')
    const atMs = Number(afterEnd ? at.slice(4) : at)
    const onUpdate = () => {
      // El saque azul espera a la persona: se salta y se pita la falta
      if (!fouled && s.simNow > 600) {
        fouled = true
        s.activeKickoff = null
        const taker = s.players.find(q => q.team === p.spTaker && q.role === 'pivot') ?? s.players.find(q => q.team === p.spTaker && q.role !== 'goalie')
        const by = s.players.find(q => q.team !== p.spTaker && q.role !== 'goalie')
        if (!taker || !by) return
        const penalty = p.kind === 'penalty'
        // `wall=1`: libre a 70 cm de la valla de detrás del ejecutante (caso del atasco al colocarse)
        const ownGoalie = s.players.find(q => q.team === p.spTaker && q.role === 'goalie')
        const leftSide = (ownGoalie?.pos.x ?? 0) < RINK.x + RINK.width / 2
        const wallX = leftSide ? RINK.x + FREE_HIT_BOARD_MARGIN : RINK.x + RINK.width - FREE_HIT_BOARD_MARGIN
        s.ruleState.pendingFoul = {
          againstTeam: by.team, byPlayerId: by.id, victimPlayerId: taker.id,
          restartX: p.spWall ? wallX : taker.pos.x, restartY: p.spWall ? RINK.y + RINK.height * 0.3 : taker.pos.y,
          message: p.spFree ? 'LIBRE INDIRECTO' : penalty ? 'PENALTI' : 'LIBRE DIRECTO',
          sanction: p.spFree ? 'free-hit' : penalty ? 'penalty' : 'direct-free-hit',
        }
      }
      const d = s.duel
      const aiming = d.active || (p.spFree && !!s.activeFoulRestart)
      if (p.spStick) { s.joystickInput.x = aiming ? p.spStick.x : 0; s.joystickInput.y = aiming ? p.spStick.y : 0 }
      // Pitido: empieza el duelo o (cámara clásica) el lanzador ya puede golpear
      const f = s.activeFoulRestart as { readyAt: number } | null
      if (d.active) whistle = d.startedAt
      else if (f && d.startedAt <= 0) whistle = f.readyAt
      if (!at || !Number.isFinite(atMs) || whistle < 0) return
      const t0 = afterEnd ? (d.startedAt > 0 ? d.endedAt : NaN) : whistle
      if (Number.isFinite(t0) && (afterEnd ? !d.active : true) && s.simNow >= t0 + atMs) {
        match.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate)
        console.log(`[spAt] ${at} t=${Math.round(s.simNow)} fin=${d.end}`)
        stopped = true
      }
    }
    // Con spAt avanza a pasos fijos (como el humo, sin piloto automático): el tiempo virtual
    // de Chrome headless no da tiempo de juego fiable; al congelar se reanuda el bucle para pintar
    if (at) {
      const game = match.game
      game.loop.stop()
      const STEP = 1000 / 60
      let now = game.loop.time
      const chunk = () => {
        for (let i = 0; i < 300 && !stopped; i++) {
          now += STEP
          match.sys.step(now, STEP)
          if (s.simNow > 40000) { console.log('[spAt] timeout'); stopped = true }
        }
        if (!stopped) { window.setTimeout(chunk, 0); return }
        freezeMatch(match, p)
        game.loop.start(game.step.bind(game))
        // La captura cambia el tamaño del lienzo con el partido congelado: se reencuadra la escena cercana
        const onResize = () => repose(match, s)
        match.scale.on(Phaser.Scale.Events.RESIZE, onResize)
        match.events.once(Phaser.Scenes.Events.SHUTDOWN, () => match.scale.off(Phaser.Scale.Events.RESIZE, onResize))
      }
      window.setTimeout(chunk, 0)
    }
    match.events.on(Phaser.Scenes.Events.POST_UPDATE, onUpdate)
    match.events.once(Phaser.Scenes.Events.SHUTDOWN, () => match.events.off(Phaser.Scenes.Events.POST_UPDATE, onUpdate))
  })
}

/**
 * E-21 (`cer=intro|final|weight`): `final` salta la salida y acaba el partido al poco; `weight`
 * deja la 2.ª parte en su último minuto hasta el primer gol (gol con peso).
 */
export function forceCeremony(match: Phaser.Scene, cer: 'intro' | 'final' | 'weight') {
  const s = match as unknown as { introSkip: boolean, introForce: boolean, simNow: number, currentPeriod: number, remainingSeconds: number, blueScore: number, redScore: number }
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    // `intro`: la salida al campo también con `auto=1` (para congelarla con `at=<ms>`)
    if (cer === 'intro') { s.introForce = true; return }
    s.introSkip = true
    if (cer === 'final') (match as unknown as { labKeepAfterEnd: boolean }).labKeepAfterEnd = true
    let set = false
    const onUpdate = () => {
      if (s.simNow < 300) return
      if (!set) { set = true; s.currentPeriod = 2; s.remainingSeconds = cer === 'final' ? 1 : 58; }
      if (cer === 'final' || s.blueScore + s.redScore > 0) { match.events.off('update', onUpdate); return }
      if (s.remainingSeconds < 45) s.remainingSeconds = 58
    }
    match.events.on('update', onUpdate)
    match.events.once(Phaser.Scenes.Events.SHUTDOWN, () => match.events.off('update', onUpdate))
  })
}