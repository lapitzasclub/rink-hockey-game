/**
 * Director de los parones (E-19): celebración del gol, descanso con cambio de campo y
 * final del partido. Mueve a los jugadores en la simulación (paso fijo, `simNow`) mientras
 * la lógica del partido está parada y les pone `player.mood`, que la pose lee para elegir
 * el gesto (`render/puppet/celebrationClips.ts`). Sin azar: la variante sale del id.
 *
 * - `track` recuerda el último jugador de campo con la bola de cada equipo (el autor del gol).
 * - `goal`, `half` y `final` arrancan cada coreografía; `step` la avanza en lugar del deslizamiento.
 * - `cross` marca el cruce de campo; `beforeRitual`/`afterRitual` rodean el ritual del saque
 *   de centro para que el portero cruce por la valla y para el choque de manos al pasar.
 */
import { CELEBRATION as C, GOAL_LINE_OFFSET, GOALIE_BASE_X, METER_PX, PENALTY_AREA_DEPTH, PLAYER_RADIUS, RINK } from '../constants'
import { attackDir, teamSide } from '../formation'
import type { Player, TeamColor } from '../types'
import { coast, glide, integrate, MID_X, MID_Y, moodStyle, setMood, suspended, turnFacing } from './celebrationMotion'
import { applySkating } from './movement'

/**
 * Qué hace cada jugador en el parón: `Skate` lo de siempre (deslizarse o el ritual), `Coast`
 * frenar, `Goto` patinar a un punto, `Follow` ir al hueco de la piña, `Slide` rodillazo,
 * `Route` cruce del portero por la valla, `Keeper` salir y volver a la portería.
 */
const Mode = { Skate: 0, Coast: 1, Goto: 2, Follow: 3, Slide: 4, Route: 5, Keeper: 6 } as const
type Mode = (typeof Mode)[keyof typeof Mode]

export class PauseDirector {
  private mode = new Int8Array(0)
  private tx = new Float64Array(0)
  private ty = new Float64Array(0)
  private spd = new Float64Array(0)
  /** Jugador de referencia: el autor (piña), la pareja (descanso, saludo) o -1. */
  private ref = new Int16Array(0)
  /** Punto al que mirar ya parado (NaN = ninguno). */
  private lx = new Float64Array(0)
  private ly = new Float64Array(0)
  /** Ruta del portero por la valla: tres puntos (x, y) y el siguiente. */
  private route = new Float64Array(0)
  private wp = new Int8Array(0)
  /** Estado del portero guardado antes del ritual del saque (x, y, vx, vy, fx, fy). */
  private saved = new Float64Array(0)
  private lastId: Record<TeamColor, string | null> = { blue: null, red: null }
  private lastAt: Record<TeamColor, number> = { blue: -Infinity, red: -Infinity }
  private prevCarrier: string | null = null

  private ensure(n: number) {
    if (this.mode.length === n) return
    this.mode = new Int8Array(n)
    this.tx = new Float64Array(n)
    this.ty = new Float64Array(n)
    this.spd = new Float64Array(n)
    this.ref = new Int16Array(n).fill(-1)
    this.lx = new Float64Array(n).fill(NaN)
    this.ly = new Float64Array(n).fill(NaN)
    this.route = new Float64Array(n * 6)
    this.wp = new Int8Array(n)
    this.saved = new Float64Array(n * 6)
  }

  private plan(i: number, mode: Mode, tx = 0, ty = 0, spd = 0, ref = -1) {
    this.mode[i] = mode
    this.tx[i] = tx
    this.ty[i] = ty
    this.spd[i] = spd
    this.ref[i] = ref
    this.lx[i] = NaN
    this.ly[i] = NaN
  }

  /** Llamar cada paso de juego: recuerda quién llevaba la bola por última vez en cada equipo. */
  track(carrierId: string | null, players: Player[], time: number) {
    if (carrierId === this.prevCarrier) {
      if (carrierId) for (const p of players) if (p.id === carrierId && p.role !== 'goalie') this.lastAt[p.team] = time
      return
    }
    this.prevCarrier = carrierId
    if (!carrierId) return
    for (const p of players) {
      if (p.id !== carrierId || p.role === 'goalie') continue
      this.lastId[p.team] = p.id
      this.lastAt[p.team] = time
    }
  }

  /** Autor del gol: el último de campo del equipo con la bola o, si no hay, el más cercano a la portería atacada. */
  private scorerOf(players: Player[], team: TeamColor, endX: number, time: number): number {
    const id = time - this.lastAt[team] < C.carrierStaleMs ? this.lastId[team] : null
    let best = -1
    let bestD = Infinity
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (p.team !== team || p.role === 'goalie' || suspended(p, time)) continue
      if (p.id === id) return i
      const d = Math.hypot(p.pos.x - endX, p.pos.y - MID_Y)
      if (d < bestD) { bestD = d; best = i }
    }
    return best
  }

  /**
   * Gol: el autor patina a la esquina del fondo atacado y hace su celebración; los
   * compañeros forman la piña con él; su portero sale y vuelve con los brazos arriba; el
   * que encaja frena cabizbajo y uno va despacio al centro. `until` = fin de la pausa.
   */
  goal(players: Player[], team: TeamColor, time: number, until: number, tight = 1) {
    this.ensure(players.length)
    const dir = teamSide(players, team) === 'left' ? 1 : -1
    const endX = dir > 0 ? RINK.x + RINK.width : RINK.x
    const si = this.scorerOf(players, team, endX, time)
    let cx = MID_X
    let cy = MID_Y
    if (si >= 0) {
      const s = players[si]
      // Dentro de la pista y a la vista: borde del área atacada, lejos de las dos vallas
      const minB = C.huddleBoardM * METER_PX
      const side = Math.max(minB, C.huddleSideM * METER_PX)
      cx = endX - dir * Math.max(minB, GOAL_LINE_OFFSET + PENALTY_AREA_DEPTH)
      cy = s.pos.y < MID_Y ? RINK.y + side : RINK.y + RINK.height - side
      const d = Math.hypot(cx - s.pos.x, cy - s.pos.y)
      if (d > C.scorerRun) {
        cx = s.pos.x + ((cx - s.pos.x) * C.scorerRun) / d
        cy = s.pos.y + ((cy - s.pos.y) * C.scorerRun) / d
      }
      let style = moodStyle(s.id, 4)
      const speed = Math.hypot(s.velocity.x, s.velocity.y)
      // Sin carrerilla no hay rodillazo: salta con el puño
      if (style === 1 && Math.min(d, C.scorerRun) < C.slideMinRun && speed < C.slideMinSpeed) style = 2
      setMood(s, 'score', style, time, until)
      this.plan(si, Mode.Goto, cx, cy, C.scorerSpeed)
      this.lx[si] = MID_X
      this.ly[si] = MID_Y
    }
    // Huecos de la piña: del lado del campo, abiertos en abanico alrededor del autor
    let ux = MID_X - cx
    let uy = MID_Y - cy
    const ul = Math.hypot(ux, uy) || 1
    ux /= ul; uy /= ul
    let mates = 0
    for (const p of players) if (p.team === team && p.role !== 'goalie' && !suspended(p, time) && p !== players[si]) mates++
    let k = 0
    let nearCenter = -1
    let nearD = Infinity
    let lost = 0
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time) || i === si) continue
      if (p.team === team) {
        if (p.role === 'goalie') {
          setMood(p, 'joy', moodStyle(p.id, 2), time, until)
          this.plan(i, Mode.Keeper, p.pos.x + attackDir(p) * C.keeperOut, p.pos.y, C.keeperSpeed)
          this.lx[i] = p.pos.x
          this.ly[i] = p.pos.y
          continue
        }
        const a = (k - (mates - 1) / 2) * 0.95
        k++
        const ox = (Math.cos(a) * ux - Math.sin(a) * uy) * C.huddleRadius * tight
        const oy = (Math.sin(a) * ux + Math.cos(a) * uy) * C.huddleRadius * tight
        setMood(p, 'mate', moodStyle(p.id, 2), time, until)
        if (si >= 0) this.plan(i, Mode.Follow, ox, oy, C.mateSpeed, si)
        else this.plan(i, Mode.Coast, 0, 0, C.coastTau)
        continue
      }
      if (p.role === 'goalie') {
        setMood(p, 'keeperDown', moodStyle(p.id, 2), time, until)
        this.plan(i, Mode.Coast, 0, 0, C.coastTau)
        continue
      }
      // Variantes repartidas (no repetidas) entre los que encajan; el de la cadera da la espalda al gol
      const style = (moodStyle(p.team, 3) + lost++) % 3
      setMood(p, 'down', style, time, until)
      this.plan(i, Mode.Coast, 0, 0, C.coastTau)
      if (style === 1) { this.lx[i] = p.pos.x + attackDir(p) * 300; this.ly[i] = p.pos.y }
      const d = Math.hypot(p.pos.x - MID_X, p.pos.y - MID_Y)
      if (d < nearD) { nearD = d; nearCenter = i }
    }
    // El que más cerca está del centro va hacia él, despacio: le toca sacar
    if (nearCenter >= 0) {
      const p = players[nearCenter]
      this.plan(nearCenter, Mode.Goto, MID_X - attackDir(p) * PLAYER_RADIUS * 2, MID_Y, C.centerSpeed)
    }
  }

  /** Descanso: las parejas se juntan y chocan las manos, estiran; los porteros empiezan a cruzar por la valla. */
  half(players: Player[], time: number, until: number) {
    this.ensure(players.length)
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      // Dura un poco más que la pausa: el cruce lo releva sin apagarse antes
      setMood(p, 'rest', moodStyle(p.id, 3), time, until + C.fadeMs)
      if (p.role === 'goalie') this.planRoute(i, p)
      else this.plan(i, Mode.Coast, 0, 0, C.glideTau)
    }
    for (const team of ['blue', 'red'] as const) {
      let a = -1
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        if (p.team !== team || p.role === 'goalie' || suspended(p, time)) continue
        if (a < 0) { a = i; continue }
        this.pair(players, a, i, C.fiveDist * 0.8, C.restSpeed)
        a = -1
      }
    }
  }

  /** Junta a dos jugadores en su punto medio, mirándose, separados `gap`. */
  private pair(players: Player[], a: number, b: number, gap: number, speed: number) {
    const pa = players[a].pos
    const pb = players[b].pos
    const d = Math.hypot(pb.x - pa.x, pb.y - pa.y)
    if (d > C.pairMax) return
    const ex = d > 0 ? (pb.x - pa.x) / d : 1
    const ey = d > 0 ? (pb.y - pa.y) / d : 0
    const mx = (pa.x + pb.x) / 2
    const my = (pa.y + pb.y) / 2
    this.plan(a, Mode.Goto, mx - (ex * gap) / 2, my - (ey * gap) / 2, speed, b)
    this.plan(b, Mode.Goto, mx + (ex * gap) / 2, my + (ey * gap) / 2, speed, a)
  }

  /** Ruta del portero al otro lado: sube a su valla, la recorre y baja hacia la nueva portería. */
  private planRoute(i: number, p: Player) {
    const left = p.side === 'left'
    const boardY = left ? RINK.y + C.boardGap : RINK.y + RINK.height - C.boardGap
    const fromX = left ? RINK.x + 170 : RINK.x + RINK.width - 170
    const toX = left ? RINK.x + RINK.width - 170 : RINK.x + 170
    const goalX = left ? RINK.x + RINK.width - GOALIE_BASE_X - 40 : RINK.x + GOALIE_BASE_X + 40
    const r = this.route
    r[i * 6] = fromX; r[i * 6 + 1] = boardY
    r[i * 6 + 2] = toX; r[i * 6 + 3] = boardY
    r[i * 6 + 4] = goalX; r[i * 6 + 5] = MID_Y + (left ? -90 : 90)
    this.wp[i] = 0
    this.plan(i, Mode.Route, 0, 0, C.keeperCrossSpeed)
  }

  /** Cambio de campo hecho: todos cruzan relajados (el ritual del saque los lleva a su sitio). */
  cross(players: Player[], time: number) {
    this.ensure(players.length)
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      setMood(p, 'cross', p.mood?.style ?? 0, time - C.fadeMs, time + C.crossMaxMs)
      if (this.mode[i] !== Mode.Route) this.mode[i] = Mode.Skate
    }
  }

  /**
   * Final: los ganadores hacen piña delante de su portero y saltan; los que pierden se van
   * despacio, cabizbajos; en empate se juntan por parejas en el centro y se saludan.
   */
  final(players: Player[], blue: number, red: number, time: number) {
    this.ensure(players.length)
    const until = Infinity
    if (blue === red) {
      const row: Record<TeamColor, number> = { blue: 0, red: 0 }
      const rowOf = (p: Player) => (p.role === 'goalie' ? 4 : row[p.team]++)
      const at = new Int16Array(10).fill(-1)
      for (let i = 0; i < players.length; i++) {
        const p = players[i]
        if (suspended(p, time)) continue
        setMood(p, 'greet', moodStyle(p.id, 2), time, until)
        const r = rowOf(p)
        const x = MID_X + (p.side === 'left' ? -1 : 1) * C.greetGap
        this.plan(i, Mode.Goto, x, MID_Y + (r - 2) * C.greetRow, C.loseSpeed * 1.6)
        const slot = r * 2 + (p.side === 'left' ? 0 : 1)
        if (slot < at.length) at[slot] = i
      }
      for (let r = 0; r < 5; r++) {
        const a = at[r * 2]
        const b = at[r * 2 + 1]
        if (a >= 0 && b >= 0) { this.ref[a] = b; this.ref[b] = a }
      }
      return
    }
    const winner: TeamColor = blue > red ? 'blue' : 'red'
    let hx = MID_X
    let hy = MID_Y
    let members = 0
    for (const p of players) {
      if (p.team !== winner || suspended(p, time)) continue
      members++
      if (p.role === 'goalie') { hx = p.pos.x + attackDir(p) * C.winAhead; hy = MID_Y }
    }
    let k = 0
    let lose = 0
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      if (p.team === winner) {
        // El portero, en el hueco hacia su portería; el resto, repartidos alrededor
        const back = -attackDir(p)
        const a = p.role === 'goalie' ? 0 : ((k++ + 1) * Math.PI * 2) / members
        const x = hx + Math.cos(a) * back * C.huddleRadius * 1.15
        const y = hy + Math.sin(a) * C.huddleRadius * 1.15
        setMood(p, 'joy', moodStyle(p.id, 2), time, until)
        this.plan(i, Mode.Goto, x, y, C.mateSpeed)
        this.lx[i] = hx
        this.ly[i] = hy
        continue
      }
      if (p.role === 'goalie') {
        setMood(p, 'keeperDown', moodStyle(p.id, 2), time, until)
        this.plan(i, Mode.Coast, 0, 0, C.coastTau)
        continue
      }
      setMood(p, 'down', moodStyle(p.id, 3), time, until)
      const back = -attackDir(p)
      this.plan(i, Mode.Goto, MID_X + back * (90 + 45 * lose), MID_Y + (lose - 1.5) * 80, C.loseSpeed)
      lose++
    }
  }

  /** Paso del parón (gol, descanso o final): sustituye al deslizamiento hasta frenar. */
  step(players: Player[], time: number, dt: number) {
    this.ensure(players.length)
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      if (suspended(p, time)) continue
      const m = p.mood
      if (!m || m.until <= time || this.mode[i] === Mode.Skate) {
        p.sprinting = false
        applySkating(p, dt, time)
        continue
      }
      p.sprinting = false
      this.move(players, i, p, time, dt)
    }
    this.pairHits(players, time)
    this.separate(players, time)
  }

  private move(players: Player[], i: number, p: Player, time: number, dt: number) {
    const m = p.mood!
    switch (this.mode[i]) {
      case Mode.Coast:
        coast(p, this.spd[i], dt)
        if (!Number.isNaN(this.lx[i])) this.look(p, this.lx[i], this.ly[i], dt * C.turnSlow)
        break
      case Mode.Slide: {
        const v = p.velocity
        const s = Math.hypot(v.x, v.y)
        const ns = Math.max(0, s - C.slideDecel * dt)
        if (s > 0) { v.x *= ns / s; v.y *= ns / s }
        integrate(p, dt)
        if (ns === 0) { this.mode[i] = Mode.Coast; this.spd[i] = C.coastTau }
        break
      }
      case Mode.Follow: {
        // Esperan algo abiertos a que el autor haga su gesto y después cierran la piña
        const s = players[this.ref[i]]
        const sm = s.mood
        const close = !sm || sm.hit + C.mateDelayMs <= time || time - m.at > C.mateMaxWaitMs
        const f = close ? 1 : C.mateHold
        const d = glide(p, s.pos.x + this.tx[i] * f, s.pos.y + this.ty[i] * f, this.spd[i], dt, true)
        if (m.hit === Infinity && close && d < C.huddleArrive) m.hit = time
        if (d < C.huddleArrive * 1.5) this.look(p, s.pos.x, s.pos.y, dt)
        break
      }
      case Mode.Keeper: {
        if (time - m.at > C.keeperBackMs) { this.tx[i] = this.lx[i]; this.ty[i] = this.ly[i] }
        glide(p, this.tx[i], this.ty[i], this.spd[i], dt, true)
        this.look(p, p.pos.x + attackDir(p) * 100, p.pos.y, dt)
        break
      }
      case Mode.Route: this.routeStep(i, p, dt); break
      default: {
        // El que marca con carrerilla se tira de rodillas cuando la frenada le deja en la esquina
        const sp = Math.hypot(p.velocity.x, p.velocity.y)
        const d = Math.hypot(this.tx[i] - p.pos.x, this.ty[i] - p.pos.y)
        if (m.kind === 'score' && m.style === 1 && m.hit === Infinity && sp > C.slideMinSpeed && d < (sp * sp) / (2 * C.slideDecel) + 12) {
          m.hit = time
          this.mode[i] = Mode.Slide
          break
        }
        glide(p, this.tx[i], this.ty[i], this.spd[i], dt, true)
        const arrived = d < C.huddleArrive && sp < 140
        if (arrived && m.hit === Infinity && (m.kind === 'score' || m.kind === 'joy')) {
          m.hit = time
          // Sin carrerilla al final, el rodillazo se queda en salto
          if (m.kind === 'score' && m.style === 1) m.style = 2
        }
        const r = this.ref[i]
        if (r >= 0) { if (d < 60) this.look(p, players[r].pos.x, players[r].pos.y, dt) }
        else if (!Number.isNaN(this.lx[i]) && d < 60) this.look(p, this.lx[i], this.ly[i], dt)
      }
    }
  }

  /** Ya casi parado, se gira hacia (x, y). */
  private look(p: Player, x: number, y: number, dt: number) {
    if (Math.hypot(p.velocity.x, p.velocity.y) > 90) return
    turnFacing(p, x - p.pos.x, y - p.pos.y, Math.min(1, dt * 6))
  }

  private routeStep(i: number, p: Player, dt: number) {
    const w = this.wp[i]
    if (w > 2) return
    const last = w === 2
    const d = glide(p, this.route[i * 6 + w * 2], this.route[i * 6 + w * 2 + 1], this.spd[i], dt, last)
    if (d < (last ? C.waypointPx * 2 : C.waypointPx)) {
      this.wp[i] = w + 1
      if (last) this.mode[i] = Mode.Skate
    }
  }

  /** Parejas del descanso y del saludo: al estar juntas y casi paradas, chocan las manos. */
  private pairHits(players: Player[], time: number) {
    for (let i = 0; i < players.length; i++) {
      const j = this.ref[i]
      const a = players[i]
      if (j < i || this.mode[i] !== Mode.Goto || !a.mood || a.mood.hit !== Infinity) continue
      if (a.mood.kind !== 'rest' && a.mood.kind !== 'greet') continue
      const b = players[j]
      if (!b.mood || b.mood.hit !== Infinity) continue
      const d = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y)
      if (d < C.fiveDist && Math.hypot(a.velocity.x, a.velocity.y) < 110 && Math.hypot(b.velocity.x, b.velocity.y) < 110) {
        a.mood.hit = time
        b.mood.hit = time
      }
    }
  }

  /** Separación suave en los parones: nadie atraviesa a nadie en la piña ni al cruzarse. */
  private separate(players: Player[], time: number) {
    const min = PLAYER_RADIUS * C.sepFactor
    for (let i = 0; i < players.length; i++) {
      const a = players[i]
      if (suspended(a, time)) continue
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j]
        if (suspended(b, time)) continue
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const d = Math.hypot(dx, dy)
        if (d >= min || d < 1e-6) continue
        const push = (min - d) / 2
        a.pos.x -= (dx / d) * push; a.pos.y -= (dy / d) * push
        b.pos.x += (dx / d) * push; b.pos.y += (dy / d) * push
      }
    }
  }

  /** Antes del ritual del saque: guarda a los porteros que siguen su ruta por la valla. */
  beforeRitual(players: Player[]) {
    if (this.mode.length !== players.length) return
    const s = this.saved
    for (let i = 0; i < players.length; i++) {
      if (this.mode[i] !== Mode.Route) continue
      const p = players[i]
      s[i * 6] = p.pos.x; s[i * 6 + 1] = p.pos.y
      s[i * 6 + 2] = p.velocity.x; s[i * 6 + 3] = p.velocity.y
      s[i * 6 + 4] = p.facing.x; s[i * 6 + 5] = p.facing.y
    }
  }

  /**
   * Tras el ritual: el portero en ruta la sigue (se deshace lo que movió el ritual), se
   * chocan las manos los compañeros que pasan cerca y el gesto relajado acaba al llegar.
   */
  afterRitual(players: Player[], time: number, dt: number) {
    if (this.mode.length !== players.length) return
    const s = this.saved
    for (let i = 0; i < players.length; i++) {
      const p = players[i]
      const m = p.mood
      if (this.mode[i] === Mode.Route) {
        p.pos.x = s[i * 6]; p.pos.y = s[i * 6 + 1]
        p.velocity.x = s[i * 6 + 2]; p.velocity.y = s[i * 6 + 3]
        p.facing.x = s[i * 6 + 4]; p.facing.y = s[i * 6 + 5]
        this.routeStep(i, p, dt)
        continue
      }
      if (!m || m.kind !== 'cross' || m.until <= time) continue
      if (time - m.at > C.crossMinMs + C.fadeMs && Math.hypot(p.velocity.x, p.velocity.y) < C.crossEndSpeed) m.until = time + C.fadeMs
    }
    for (let i = 0; i < players.length; i++) {
      const a = players[i]
      if (a.role === 'goalie' || a.mood?.kind !== 'cross' || a.mood.hit !== Infinity || a.mood.until <= time) continue
      for (let j = i + 1; j < players.length; j++) {
        const b = players[j]
        if (b.team !== a.team || b.role === 'goalie' || b.mood?.kind !== 'cross' || b.mood.hit !== Infinity) continue
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        if (Math.hypot(dx, dy) > C.fiveDist) continue
        a.mood.hit = time
        b.mood.hit = time
        // Lado del compañero en el marco de cada uno (derecha = (-fy, fx))
        a.mood.side = -dx * a.facing.y + dy * a.facing.x >= 0 ? 1 : -1
        b.mood.side = dx * b.facing.y - dy * b.facing.x >= 0 ? 1 : -1
        break
      }
    }
  }
}
