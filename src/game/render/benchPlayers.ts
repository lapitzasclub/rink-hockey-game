/**
 * Figuras del lado lejano (WP-69, SPEC §9): por banquillo un delegado sentado,
 * cinco suplentes con patines y casco (puesto, en la mano o en el banco) y el
 * entrenador de pie junto a la puerta; en la mesa, auxiliar, cronometrador y
 * anotador.
 *
 * - Todas son rigs horneados (figureBaker.ts): una Image por figura que solo
 *   cambia de marco cuando cambia la pose; el salto al celebrar es un `y`.
 * - Miran la bola (cinco vistas con histéresis) o a otro sitio de vez en cuando.
 * - Reaccionan a los eventos de la simulación (`match:goal`, `match:foul`,
 *   `match:card`, `match:kickoff`): los oyentes solo apuntan el hecho y la
 *   reacción arranca en el siguiente pintado, con el tiempo visual.
 * - Sin `Math.random` (lo siembra el lab y lo consume la IA): PRNG por figura.
 * - Los equipos cambian de campo en el descanso, los banquillos no: cada
 *   banquillo es siempre del mismo color (`teamKit`).
 */
import * as Phaser from 'phaser'
import { RINK } from '../constants'
import { equipoDeHueco } from '../externalMatch'
import type { TeamColor } from '../types'
import { BENCH, FIGURE_EXAG, PLAYER_HEIGHT_M, PUPPET_LOCAL, TABLE, WORLD_PX_PER_M, bandDepth, figureScale } from './artSpec'
import { POSE, ROLE_POSES, benchPose, type BenchRole, type BenchStyle } from './benchPoses'
import { FigureBaker } from './figureBaker'
import { lookFor, officialKit, playerKit, staffKit, teamKit, type RigKit } from './puppet/kit'
import { tone } from './puppet/paint'
import { createPose } from './puppet/pose'
import { PuppetRig, RIG_UNIT } from './puppet/rig'
import { J, rigDims } from './puppet/skeleton'
import { bakeResolution } from './quality'
import { PLATFORM_Z, SEAT_ANCHOR_Y, SEAT_PELVIS_Y, benchSide, benchX } from './rink/benches'
import { BOARD_W } from './rink/geometry'
import { officialSeat } from './rink/table'
import { project } from './viewTransform'

const CX = RINK.x + RINK.width / 2
const LOOK_STEP = Math.PI / 4
const TEAMS = ['blue', 'red'] as const
/** Asiento sobre los pies, en unidades de figura. */
const SEAT_TOP = BENCH.seatHeightM / (PLAYER_HEIGHT_M * FIGURE_EXAG)

type HelmetAt = 'on' | 'hand' | 'seat'

export interface BenchPlayer {
  img: Phaser.GameObjects.Image
  role: BenchRole
  /** Equipo del banquillo; null en la mesa. */
  team: TeamColor | null
  /** Orden dentro de su grupo (escalona las reacciones). */
  rank: number
  /** Marco horneado de cada pose (índice = id de POSE). */
  frames: string[]
  /** Ancla de mundo (para mirar la bola). */
  wx: number; wy: number
  baseY: number
  hopPx: number
  pose: number
  look: number
  /** Sigue la bola (true) o mira a un sitio fijo hasta `nextLook`. */
  follow: boolean
  nextLook: number
  nextIdle: number
  seed: number
  /** Reacción en curso: pose (y alternativa, -1 = ninguna), ventana y si salta. */
  react: number
  alt: number
  reactFrom: number
  reactUntil: number
  hop: boolean
}

/** Hechos de la simulación pendientes de reacción (los apuntan los oyentes). */
interface Pending {
  goal: TeamColor | null
  foul: TeamColor | null
  foulX: number
  card: TeamColor | null
  kickoff: boolean
}
const pendingOf = new WeakMap<BenchPlayer[], Pending>()

/** Una figura por crear: papel, kit, estilo y ancla. */
interface Spec {
  role: BenchRole; team: TeamColor | null; rank: number; kit: RigKit; kind: 'skater' | 'official'
  stickSide: 0 | 1; style: BenchStyle; helmet: HelmetAt | null; wx: number; wy: number; wz: number
}

/** Hash entero estable (semillas por figura). */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/** Siguiente número en [0, 1) del PRNG de la figura (mulberry32). */
function rand(f: BenchPlayer): number {
  f.seed = (f.seed + 0x6d2b79f5) >>> 0
  let t = f.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const between = (f: BenchPlayer, r: readonly [number, number]) => r[0] + rand(f) * (r[1] - r[0])

/** Dorsales de los suplentes: los de la plantilla externa que no están en pista o los de artSpec. */
function subNumbers(team: TeamColor): string[] {
  const e = equipoDeHueco(team)
  const base = BENCH.subNumbers[team]
  if (!e) return [...base]
  const used = new Set(e.dorsales)
  const extra = e.plantilla.filter(j => j.rol === 'jugador' && j.dorsal && !used.has(j.dorsal)).map(j => j.dorsal!)
  return base.map((n, i) => extra[i] ?? n)
}

const SUB_REST: Record<TeamColor, BenchStyle['rest'][]> = {
  blue: ['knees', 'stick', 'back', 'cross', 'thighs'],
  red: ['thighs', 'back', 'stick', 'knees', 'cross'],
}
const SUB_HELMET: Record<TeamColor, HelmetAt[]> = {
  blue: ['seat', 'on', 'on', 'hand', 'hand'],
  red: ['hand', 'on', 'on', 'seat', 'seat'],
}

/** Lista de figuras: banquillos (delegado, suplentes, entrenador) y mesa. */
function specs(): Spec[] {
  const out: Spec[] = []
  const seatZ = PLATFORM_Z
  for (const team of TEAMS) {
    const inward = -benchSide(team)
    const nums = subNumbers(team)
    const style = (rest: BenchStyle['rest'], h: number): BenchStyle => ({
      rest, inward, seatY: SEAT_PELVIS_Y,
      spread: 0.07 + (h % 5) * 0.015, feetZ: 0.15 + ((h >>> 3) % 4) * 0.025, lean: 0.06 + ((h >>> 6) % 4) * 0.05,
    })
    BENCH.subsU.forEach((u, i) => {
      const id = `${team}-sub-${i}`
      const look = lookFor(id, team, 'wing')
      look.number = nums[i]
      const helmet = SUB_HELMET[team][i]
      out.push({
        role: 'sub', team, rank: i, kit: playerKit(team, 'skater', look, helmet === 'on'), kind: 'skater',
        stickSide: look.hand === 'L' ? 0 : 1, style: style(SUB_REST[team][i], hash(i + (team === 'red' ? 40 : 0))),
        helmet, wx: benchX(team, u), wy: SEAT_ANCHOR_Y, wz: seatZ,
      })
    })
    const t = team === 'blue' ? 0 : 1
    out.push({
      role: 'delegate', team, rank: 5, kit: staffKit(team, 'delegate', 1 + t * 2, 3 - t), kind: 'official', stickSide: 1,
      style: style('thighs', 7 + t), helmet: null, wx: benchX(team, BENCH.delegateU), wy: SEAT_ANCHOR_Y, wz: seatZ,
    })
    out.push({
      role: 'coach', team, rank: 6, kit: staffKit(team, 'coach', t * 3, 1 + t), kind: 'official', stickSide: 1,
      style: style(team === 'blue' ? 'hips' : 'cross', 3 + t), helmet: null,
      wx: benchX(team, BENCH.coachU), wy: RINK.y - BOARD_W - BENCH.coachSetbackM * WORLD_PX_PER_M.y, wz: seatZ,
    })
  }
  const roles: BenchRole[] = ['aux', 'timer', 'scorer']
  roles.forEach((role, i) => {
    const seat = officialSeat(i)
    out.push({
      role, team: null, rank: i, kit: officialKit(i + 1, i * 2 + 1), kind: 'official', stickSide: 1,
      style: { rest: 'thighs', inward: 1, seatY: SEAT_PELVIS_Y, spread: 0.09, feetZ: 0.17, lean: 0.1 },
      helmet: null, wx: seat.x, wy: seat.y, wz: 0,
    })
  })
  return out
}

/**
 * Casco suelto (en la mano o en el banco), en px del rig: cúpula del color del
 * equipo con la abertura oscura hacia abajo, ranuras de ventilación y brillo.
 */
function helmetGraphic(scene: Phaser.Scene, color: number): Phaser.GameObjects.Graphics {
  const r = rigDims('skater').headR * RIG_UNIT * 0.9
  const g = scene.add.graphics()
  g.fillStyle(0x0b0f16, 1).fillEllipse(0, 0, r * 2.2, r * 1.75)
  g.fillStyle(tone(color, 0.62), 1).fillEllipse(0, r * 0.05, r * 1.98, r * 1.52)
  g.fillStyle(color, 1).fillEllipse(0, -r * 0.12, r * 1.94, r * 1.2)
  g.fillStyle(0x10141c, 1).fillEllipse(r * 0.08, r * 0.42, r * 1.25, r * 0.42)
  g.fillStyle(tone(color, 0.45), 1)
  for (const dx of [-0.42, 0, 0.42]) g.fillRect((dx - 0.07) * r, -r * 0.62, r * 0.14, r * 0.42)
  g.fillStyle(0xffffff, 0.5).fillEllipse(-r * 0.4, -r * 0.42, r * 0.55, r * 0.28)
  return g
}

/** Crea y hornea las figuras del lado lejano y se suscribe a los eventos del partido. */
export function createBenchPlayers(scene: Phaser.Scene): BenchPlayer[] {
  const list = specs()
  const feet = list.map(s => project(s.wx, s.wy, s.wz))
  const ks = feet.map(f => figureScale(f.s))
  const cells = list.reduce((n, s) => n + ROLE_POSES[s.role].length, 0)
  const baker = new FigureBaker(scene, Math.max(...ks), bakeResolution(true), cells)
  const pose = createPose()
  const players: BenchPlayer[] = []

  list.forEach((s, n) => {
    const rig = new PuppetRig(scene, s.kind, s.kit, s.stickSide)
    const d = rig.skeleton.dims
    const helmet = s.helmet === 'hand' || s.helmet === 'seat' ? helmetGraphic(scene, teamKit(s.team ?? 'blue').helmet) : null
    if (helmet) rig.container.add(helmet)
    const frames: string[] = []
    for (const id of ROLE_POSES[s.role]) {
      benchPose(pose, d, s.role, id, s.style)
      rig.apply(pose)
      if (helmet) placeHelmet(helmet, rig, s, id)
      frames[id] = baker.bake(rig.container, ks[n])
    }
    rig.container.destroy()

    const foot = feet[n]
    const k = ks[n]
    const baseY = foot.y - PUPPET_LOCAL.feetY * k
    const img = baker.image(scene, foot.x, baseY, frames[POSE.C]).setDepth(bandDepth('OFFCOURT_FAR', foot.y))
    players.push({
      img, role: s.role, team: s.team, rank: s.rank, frames, wx: s.wx, wy: s.wy, baseY,
      hopPx: BENCH.hopUnits * RIG_UNIT * k, pose: POSE.C, look: POSE.C, follow: true, nextLook: 0, nextIdle: -1,
      seed: hash(n * 977 + 13), react: -1, alt: -1, reactFrom: 0, reactUntil: 0, hop: false,
    })
  })

  listen(scene, players)
  return players
}

/** Casco en la mano derecha o apoyado en el banco a su lado (también cuando se lleva las manos a la cabeza). */
function placeHelmet(g: Phaser.GameObjects.Graphics, rig: PuppetRig, s: Spec, id: number) {
  const sk = rig.skeleton
  if (s.helmet === 'hand' && id !== POSE.SAD) {
    g.setPosition(sk.px[J.hand1], sk.py[J.hand1] + 2)
    return
  }
  // A la derecha del jugador (izquierda de pantalla), apoyado en el asiento
  const r = rigDims('skater').headR * 1.05
  g.setPosition(-0.27 * RIG_UNIT, PUPPET_LOCAL.feetY - (SEAT_TOP + r * 0.8) * RIG_UNIT)
}

/** Oyentes de la simulación: solo apuntan el hecho; se dan de baja al cerrar la escena. */
function listen(scene: Phaser.Scene, players: BenchPlayer[]) {
  const p: Pending = { goal: null, foul: null, foulX: CX, card: null, kickoff: false }
  pendingOf.set(players, p)
  const onGoal = (e: { team: TeamColor }) => { p.goal = e.team }
  const onFoul = (e: { against: TeamColor; x: number }) => { p.foul = e.against; p.foulX = e.x }
  const onCard = (e: { team: TeamColor }) => { p.card = e.team }
  const onKickoff = () => { p.kickoff = true }
  const ev = scene.events
  ev.on('match:goal', onGoal)
  ev.on('match:foul', onFoul)
  ev.on('match:card', onCard)
  ev.on('match:kickoff', onKickoff)
  ev.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    ev.off('match:goal', onGoal)
    ev.off('match:foul', onFoul)
    ev.off('match:card', onCard)
    ev.off('match:kickoff', onKickoff)
  })
}

/** Arranca una reacción: `from` permite escalonarla. */
function react(f: BenchPlayer, id: number, alt: number, from: number, ms: number, hop: boolean) {
  if (f.frames[id] === undefined) return
  f.react = id
  f.alt = alt >= 0 && f.frames[alt] !== undefined ? alt : -1
  f.reactFrom = from
  f.reactUntil = from + ms
  f.hop = hop
}

/** Reparte los hechos pendientes entre las figuras. */
function dispatch(players: BenchPlayer[], p: Pending, t: number) {
  for (const f of players) {
    const lag = f.rank * BENCH.staggerMs + rand(f) * 120
    if (p.goal) {
      const mine = f.team === p.goal
      if (f.role === 'sub') mine ? react(f, POSE.CHEER_A, POSE.CHEER_B, t + lag, BENCH.cheerMs, true) : react(f, POSE.SAD, -1, t + lag, BENCH.sadMs, false)
      else if (f.role === 'delegate') react(f, mine ? POSE.CHEER_A : POSE.SAD, -1, t + lag, mine ? BENCH.cheerMs : BENCH.sadMs, false)
      else if (f.role === 'coach') mine ? react(f, POSE.CHEER_A, POSE.CHEER_B, t + 150, BENCH.cheerMs, true) : react(f, POSE.DESPAIR, -1, t + 250, BENCH.sadMs, false)
      else if (f.role === 'scorer') react(f, POSE.WORK, -1, t + 900, TABLE.writeMs, false)
      else if (f.role === 'timer') react(f, POSE.WORK, -1, t + 200, TABLE.clockMs, false)
    }
    if (p.foul) {
      if (f.role === 'coach' && f.team === p.foul) react(f, POSE.PROTEST_A, POSE.PROTEST_B, t + 200, BENCH.protestMs, false)
      else if (f.role === 'aux') react(f, p.foulX < CX ? POSE.POINT_L : POSE.POINT_R, -1, t + 150, TABLE.pointMs, false)
      else if (f.role === 'scorer') react(f, POSE.WORK, -1, t + 600, TABLE.writeMs, false)
    }
    if (p.card) {
      // El auxiliar indica el banco de sancionados del equipo; el crono cuenta los 2 min
      if (f.role === 'aux') react(f, p.card === 'blue' ? POSE.POINT_L : POSE.POINT_R, -1, t + 900, TABLE.pointMs, false)
      else if (f.role === 'timer') react(f, POSE.WORK, -1, t + 400, TABLE.clockMs, false)
    }
    if (p.kickoff && f.role === 'timer' && f.react < 0) react(f, POSE.WORK, -1, t, TABLE.clockMs, false)
  }
  p.goal = null; p.foul = null; p.card = null; p.kickoff = false
}

/** Cambia de marco solo si cambia la pose. */
function show(f: BenchPlayer, id: number) {
  if (f.pose === id) return
  const frame = f.frames[id]
  if (frame === undefined) return
  f.img.setFrame(frame)
  f.pose = id
}

/** Vista de mirada (0..4) hacia la bola, con histéresis para no parpadear entre dos. */
function lookAtBall(f: BenchPlayer, bx: number, by: number) {
  const v = Math.atan2(bx - f.wx, Math.max(1, by - f.wy)) / LOOK_STEP + POSE.C
  if (Math.abs(v - f.look) > 0.75) f.look = Math.min(POSE.R2, Math.max(POSE.L2, Math.round(v)))
}

/**
 * Anima las figuras con el tiempo visual `timeNow` (ms). Sin asignaciones: solo
 * cambia el marco cuando cambia la pose y la `y` durante los saltos.
 */
export function updateBenchPlayers(players: BenchPlayer[], timeNow: number, ball?: { x: number; y: number }) {
  const p = pendingOf.get(players)
  if (p && (p.goal || p.foul || p.card || p.kickoff)) dispatch(players, p, timeNow)

  for (const f of players) {
    if (f.react >= 0 && timeNow >= f.reactFrom) {
      if (timeNow < f.reactUntil) {
        const e = timeNow - f.reactFrom
        show(f, f.alt >= 0 && Math.floor(e / BENCH.flipMs) % 2 === 1 ? f.alt : f.react)
        if (f.hop) f.img.y = f.baseY - f.hopPx * Math.abs(Math.sin((Math.PI * e) / BENCH.hopMs))
        continue
      }
      f.react = -1
      if (f.hop) f.img.y = f.baseY
    }
    if (f.react >= 0) { show(f, f.look); continue }

    // El entrenador da indicaciones de vez en cuando
    if (f.role === 'coach') {
      if (f.nextIdle < 0) f.nextIdle = timeNow + between(f, BENCH.coachEveryMs)
      else if (timeNow >= f.nextIdle) {
        f.nextIdle = timeNow + between(f, BENCH.coachEveryMs)
        react(f, POSE.POINT, -1, timeNow, BENCH.pointMs, false)
        continue
      }
    }

    // Mirada: la mesa sigue siempre la bola; el banquillo casi siempre, a ratos mira a otro sitio
    if (timeNow >= f.nextLook || timeNow < f.nextLook - BENCH.lookMs[1]) {
      f.nextLook = timeNow + between(f, BENCH.lookMs)
      f.follow = !ball || f.team === null || rand(f) < BENCH.lookBall
      if (!f.follow) f.look = Math.floor(rand(f) * 5)
    }
    if (f.follow) {
      if (ball) lookAtBall(f, ball.x, ball.y)
      else f.look = POSE.C
    }
    show(f, f.look)
  }
}
