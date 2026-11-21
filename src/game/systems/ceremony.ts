/**
 * Ceremonia del partido (E-21). Mueve a los jugadores en la simulación (paso fijo, `simNow`)
 * y les deja el gesto en `player.mood`, que leen los clips (`render/puppet/celebrationClips.ts`).
 * Sin azar y sin asignar objetos por paso.
 *
 * - `intro`/`introStep`: salida al campo desde la puerta de su banquillo hasta el sitio del
 *   saque inicial; los capitanes se dan la mano en el centro. Reloj parado y sin control.
 * - `final`/`finalStep`: tras la coreografía del final (E-19), dos filas enfrentadas se cruzan
 *   chocando la mano con los rivales y saludan a la grada.
 * - `goal`: peso del gol (último minuto, empate, remontada, hat-trick) y celebración acorde.
 */
import { CELEBRATION as C, CEREMONY as E, PLAYER_RADIUS, RINK } from '../constants'
import { DOOR_HOLD_INTRO, doorHold } from '../render/rink/boards'
import { penaltyDoor } from '../render/rink/table'
import type { Player, TeamColor } from '../types'
import type { PauseDirector } from './celebration'
import { coast, glide, MID_X, MID_Y, moodStyle, setMood, suspended, turnFacing } from './celebrationMotion'

/** Altura de las filas del final: tercio inferior, por debajo del cartel del resultado. */
const ROW_Y = MID_Y + RINK.height * E.rowYFrac

const St = { Wait: 0, Go: 1, Meet: 2, Back: 3, Done: 4 } as const
/** Fases del saludo final: E-19 aún, formar filas, cruzarse, saludo a la grada. */
const Fin = { Idle: 0, Form: 1, Pass: 2, Salute: 3 } as const
const TEAMS: TeamColor[] = ['blue', 'red']
/** Entre dos choques de mano seguidos (el gesto dura MOOD_POSE.five.ms = 650). */
const SLAP_MS = 600
const busyHand = (p: Player, time: number) => p.mood!.hit !== Infinity && time - p.mood!.hit < SLAP_MS

/** Datos del gol que la ceremonia no sabe por sí sola: marcador antes/después y reloj. */
export type GoalContext = { blue: number; red: number; lastMinute: boolean }

export class CeremonyDirector {
  /** Salida al campo en curso: reloj parado, humano sin control. */
  introActive = false
  /** Peso (0..1) del último gol. */
  weight = 0
  private st = new Int8Array(0)
  private tx = new Float64Array(0)
  private ty = new Float64Array(0)
  private start = new Float64Array(0)
  /** Último rival con el que chocó la mano en el saludo final. */
  private slap = new Int16Array(0)
  private cap: Record<TeamColor, number> = { blue: -1, red: -1 }
  private introUntil = 0
  private shakeAt = Infinity
  private finalAt = Infinity
  private phase: number = Fin.Idle
  private phaseAt = 0
  private goals = new Map<string, number>()
  private trailed = { blue: false, red: false }
  private door = { x: 0, y: 0 }

  private ensure(n: number) {
    if (this.st.length === n) return
    this.st = new Int8Array(n)
    this.tx = new Float64Array(n)
    this.ty = new Float64Array(n)
    this.start = new Float64Array(n)
    this.slap = new Int16Array(n)
  }

  /** El jugador de campo más cerca del centro en el saque: el capitán. */
  private captainOf(players: Player[], team: TeamColor) {
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (p.team !== team || p.role === 'goalie') continue
      const d = Math.hypot(p.pos.x - MID_X, p.pos.y - MID_Y)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }

  /**
   * Arranca la salida al campo. Los jugadores ya están en su sitio del saque (lo recuerda
   * como destino) y los lleva en fila junto a la valla, desde la puerta de su banquillo.
   */
  intro(players: Player[], time: number) {
    this.ensure(players.length)
    this.introActive = true
    this.introUntil = time + E.introMaxMs
    this.shakeAt = Infinity
    this.finalAt = Infinity
    this.phase = Fin.Idle
    this.goals.clear()
    this.trailed.blue = false
    this.trailed.red = false
    for (const team of TEAMS) this.cap[team] = this.captainOf(players, team)
    const n = { blue: 0, red: 0 }
    // Sale primero el capitán y después el resto en el orden del equipo
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        if ((pass === 0) !== (this.cap[p.team] === i)) continue
        this.tx[i] = p.pos.x
        this.ty[i] = p.pos.y
        const k = n[p.team]++
        const d = penaltyDoor(p.team, E.doorInset, this.door)
        p.pos.x = d.x + (d.x < MID_X ? -1 : 1) * k * E.queueGap
        p.pos.y = d.y
        p.velocity.x = 0; p.velocity.y = 0
        p.facing.x = 0; p.facing.y = 1
        this.start[i] = time + k * E.staggerMs
        this.st[i] = St.Wait
        setMood(p, 'cross', 0, time, Infinity)
      }
    }
  }

  /** Paso de la salida al campo; false cuando ha terminado (todos en su sitio o tope). */
  introStep(players: Player[], time: number, dt: number) {
    if (!this.introActive) return false
    this.ensure(players.length)
    let busy = false
    doorHold.blue &= ~DOOR_HOLD_INTRO
    doorHold.red &= ~DOOR_HOLD_INTRO
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      const cap = i === this.cap.blue || i === this.cap.red
      // La puerta del banquillo, abierta mientras quede alguien por salir o cruzándola
      if (this.st[i] === St.Wait || this.st[i] === St.Go) {
        const d = penaltyDoor(p.team, E.doorInset, this.door)
        if (this.st[i] === St.Wait || Math.hypot(p.pos.x - d.x, p.pos.y - d.y) < E.doorOpenR) doorHold[p.team] |= DOOR_HOLD_INTRO
      }
      switch (this.st[i]) {
        case St.Wait:
          busy = true
          if (time >= this.start[i]) this.st[i] = St.Go
          break
        case St.Go: {
          busy = true
          // Los capitanes, a su lado de la línea central, un poco por encima de la bola
          const gx = cap ? MID_X + (p.side === 'left' ? -1 : 1) * E.capGap * 0.5 : this.tx[i]
          const gy = cap ? MID_Y - E.capGap : this.ty[i]
          const d = glide(p, gx, gy, cap ? E.capSpeed : E.enterSpeed, dt, true)
          if (d < E.arrive && Math.hypot(p.velocity.x, p.velocity.y) < 60) this.st[i] = cap ? St.Meet : St.Done
          break
        }
        case St.Meet: {
          busy = true
          const o = players[i === this.cap.blue ? this.cap.red : this.cap.blue]
          coast(p, C.coastTau, dt)
          if (o) turnFacing(p, o.pos.x - p.pos.x, o.pos.y - p.pos.y, Math.min(1, dt * 8))
          break
        }
        case St.Back: {
          busy = true
          const d = glide(p, this.tx[i], this.ty[i], E.capSpeed, dt, true)
          if (d < E.arrive) this.st[i] = St.Done
          break
        }
        default:
          glide(p, this.tx[i], this.ty[i], E.enterSpeed, dt, true)
          if (Math.hypot(p.velocity.x, p.velocity.y) < 60) turnFacing(p, MID_X - p.pos.x, MID_Y - p.pos.y, Math.min(1, dt * 4))
      }
    }
    this.handshake(players, time)
    return busy && time < this.introUntil
  }

  /** Apretón de manos de los capitanes al estar los dos; después vuelven a su sitio. */
  private handshake(players: Player[], time: number) {
    const a = this.cap.blue
    const b = this.cap.red
    if (a < 0 || b < 0) {
      for (let q = 0; q < 2; q++) { const i = q ? b : a; if (i >= 0 && this.st[i] === St.Meet) this.st[i] = St.Back }
      return
    }
    if (this.shakeAt === Infinity && this.st[a] === St.Meet && this.st[b] === St.Meet) {
      this.shakeAt = time
      for (let q = 0; q < 2; q++) {
        const i = q ? b : a
        setMood(players[i], 'greet', 0, time - C.fadeMs, Infinity)
        players[i].mood!.hit = time
      }
    }
    if (time < this.shakeAt + E.shakeHoldMs) return
    for (let q = 0; q < 2; q++) {
      const i = q ? b : a
      if (this.st[i] !== St.Meet) continue
      this.st[i] = St.Back
      setMood(players[i], 'cross', 0, time - C.fadeMs, Infinity)
    }
  }

  /** Fin de la salida (o salto): el gesto se apaga; el saque normal lo hace la escena. */
  endIntro(players: Player[], time: number) {
    this.introActive = false
    doorHold.blue &= ~DOOR_HOLD_INTRO
    doorHold.red &= ~DOOR_HOLD_INTRO
    for (const p of players) if (p.mood && p.mood.until === Infinity) p.mood.until = time + C.fadeMs
  }

  /** Final del partido: el saludo empieza cuando acaba la coreografía de E-19. */
  final(time: number) {
    this.finalAt = time + E.lineDelayMs
    this.phase = Fin.Idle
  }

  /** Paso del final; false mientras sigue la coreografía de E-19 (la mueve PauseDirector). */
  finalStep(players: Player[], time: number, dt: number) {
    if (time < this.finalAt) return false
    this.ensure(players.length)
    if (this.phase === Fin.Idle) this.planLines(players, time)
    const row = E.lineRow
    let moving = false
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      if (this.phase === Fin.Salute) {
        glide(p, this.tx[i], this.ty[i], E.lineSpeed, dt, true)
        turnFacing(p, 0, 1, Math.min(1, dt * 4))
        continue
      }
      const dir = p.side === 'left' ? 1 : -1
      const tx = this.phase === Fin.Pass ? this.tx[i] + dir * E.passDist * row : this.tx[i]
      const d = glide(p, tx, this.ty[i], this.phase === Fin.Pass ? E.passSpeed : E.lineSpeed, dt, true)
      if (d > E.arrive) moving = true
      else turnFacing(p, this.phase === Fin.Pass ? dir : 0, this.phase === Fin.Pass ? 0 : dir, Math.min(1, dt * 6))
    }
    if (this.phase === Fin.Pass) this.slaps(players, time)
    const formed = !moving || time - this.phaseAt > E.formMaxMs
    if (this.phase === Fin.Form && formed) { this.phase = Fin.Pass; this.phaseAt = time }
    else if (this.phase === Fin.Pass && (!moving || time - this.phaseAt > (E.passDist * row * 1000) / E.passSpeed + E.formMaxMs)) this.salute(players, time)
    return true
  }

  /**
   * Dos filas horizontales en el tercio inferior (no tapan el cartel): la izquierda arriba y a la
   * izquierda, la derecha abajo y a la derecha; al cruzarse quedan frente a frente a `lineGap`.
   */
  private planLines(players: Player[], time: number) {
    this.phase = Fin.Form
    this.phaseAt = time
    const k = { left: 0, right: 0 }
    for (let g = 0; g < 2; g++) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        // El portero cierra la fila
        if (suspended(p, time) || (g === 0) === (p.role === 'goalie')) continue
        const dir = p.side === 'left' ? 1 : -1
        this.tx[i] = MID_X - dir * E.lineRow * (0.5 + k[p.side]++)
        this.ty[i] = ROW_Y - dir * E.lineGap * 0.5
        this.slap[i] = -1
        setMood(p, 'cross', 0, time, Infinity)
      }
    }
  }

  /** Al pasar frente a un rival nuevo, los dos chocan la mano (la del lado del rival). */
  private slaps(players: Player[], time: number) {
    for (let i = 0; i < players.length; i++) {
      const a = players[i]
      if (a.side !== 'left' || !a.mood || suspended(a, time)) continue
      for (let j = 0; j < players.length; j++) {
        const b = players[j]
        if (b.side === 'left' || !b.mood || suspended(b, time) || this.slap[i] === j) continue
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        if (Math.abs(dx) > E.lineRow * 0.45 || Math.abs(dy) > E.lineGap * 1.6) continue
        if (busyHand(a, time) || busyHand(b, time)) continue
        this.slap[i] = j
        this.slap[j] = i
        a.mood.hit = time
        b.mood.hit = time
        a.mood.side = -dx * a.facing.y + dy * a.facing.x >= 0 ? 1 : -1
        b.mood.side = dx * b.facing.y - dy * b.facing.x >= 0 ? 1 : -1
      }
    }
  }

  /** Todos en una fila de cara a la grada (cada equipo en su mitad), brazos arriba, escalonados. */
  private salute(players: Player[], time: number) {
    this.phase = Fin.Salute
    let k = 0
    for (let g = 0; g < 2; g++) {
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        if (suspended(p, time) || (g === 0) !== (p.side === 'left')) continue
        this.tx[i] = MID_X + (k++ - 4.5) * E.saluteGapR * PLAYER_RADIUS
        this.ty[i] = ROW_Y
      }
    }
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      setMood(p, 'joy', moodStyle(p.id, 2), time, Infinity)
      p.mood!.hit = time + E.saluteMs * 0.25 + (i % 5) * 90
    }
  }

  /**
   * Gol: arranca la celebración de E-19 y le da peso. Con peso, la pausa se alarga (tope
   * `extraMs`), la piña se aprieta y el autor agranda el gesto (`mood.big`); en el tercer gol
   * del mismo autor, su gesto es el del hat-trick. Devuelve el fin de la pausa.
   */
  goal(pause: PauseDirector, players: Player[], team: TeamColor, time: number, until: number, g: GoalContext) {
    pause.goal(players, team, time, until)
    let si = -1
    for (let i = 0; i < players.length; i++) if (players[i].mood?.kind === 'score' && players[i].mood!.at === time) si = i
    const id = si >= 0 ? players[si].id : ''
    const n = id ? (this.goals.get(id) ?? 0) + 1 : 0
    if (id) this.goals.set(id, n)
    const mine = team === 'blue' ? g.blue : g.red
    const theirs = team === 'blue' ? g.red : g.blue
    let w = g.lastMinute ? E.wLastMinute : 0
    if (mine === theirs) w += E.wEqualizer
    if (mine === theirs + 1 && this.trailed[team]) w += E.wComeback
    const hat = n === 3
    if (hat) w += E.wHatTrick
    w = Math.min(1, w)
    if (g.blue < g.red) this.trailed.blue = true
    if (g.red < g.blue) this.trailed.red = true
    this.weight = w
    for (const p of players) if (p.mood) p.mood.big = 0
    if (w <= 0) return until
    const end = until + w * E.extraMs
    pause.goal(players, team, time, end, 1 - w * E.tighten)
    const m = si >= 0 ? players[si].mood : undefined
    if (m && m.kind === 'score') {
      m.big = w
      if (hat) m.style = 4
    }
    return end
  }
}
