/**
 * Mesa de oficiales y bancos de sancionados (WP-51, WP-69, SPEC §9): lado
 * lejano, tras la valla, en coordenadas de mundo proyectadas con la cámara única.
 *
 * - Lo fijo (suelo, pared, bancos de sancionados, mesa con faldón, portátil,
 *   papeles y caja del marcador) son Graphics que drawRink hornea.
 * - El logotipo del faldón y el marcador LED son textos: el LED solo cambia con
 *   los eventos `match:clock` y `match:goal` (setText solo si cambia el contenido).
 * - Las tres figuras (auxiliar, cronometrador, anotador) las crea y anima
 *   benchPlayers.ts en `officialSeat`.
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import type { TeamColor } from '../../types'
import { getPartidoExterno } from '../../externalMatch'
import { BENCH, DEPTH, PENALTY_BOX, PX_PER_M, TABLE, WORLD_PX_PER_M, bandDepth } from '../artSpec'
import { ARCADE_FONT } from '../arcadeFx'
import { tone } from '../puppet/paint'
import { project } from '../viewTransform'
import { benchX, side, slab, wall } from './benches'
import { BOARD_W } from './geometry'

const M = PX_PER_M
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y
const CX = RINK.x + RINK.width / 2
/** Cara exterior de la valla lejana (mundo). */
const BOARD_OUT_Y = RINK.y - BOARD_W
const C = TABLE.colors
const LED_FONT = '"Courier New", Courier, monospace'

/** Extremos en X (mundo) de la mesa y de la zona trasera (suelo y pared) que ocupa con los sancionados. */
export const TABLE_X: [number, number] = [CX - (TABLE.widthM / 2) * MX, CX + (TABLE.widthM / 2) * MX]
export const TABLE_ZONE_X: [number, number] = [CX - TABLE.zoneHalfM * MX, CX + TABLE.zoneHalfM * MX]

/** Ancla de mundo del asiento n de sancionados (0 = el más próximo a la mesa): azul a la izquierda, rojo a la derecha. */
export function penaltySeat(team: TeamColor, n: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  const seats = PENALTY_BOX.seatsU
  const i = Math.min(Math.max(0, Math.floor(n)), seats.length - 1)
  out.x = benchX(team, seats[i])
  out.y = BOARD_OUT_Y - PENALTY_BOX.seatSetbackM * MY
  return out
}

/** Ancla de mundo de la figura de mesa i (0 auxiliar, 1 cronometrador, 2 anotador). */
export function officialSeat(i: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = CX + TABLE.figX[i] * MX
  out.y = BOARD_OUT_Y - TABLE.figSetbackM * MY
  return out
}

/** Suelo y pared del fondo de la zona de mesa; por debajo de las figuras. */
function drawBackdrop(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(DEPTH.OFFCOURT_FAR)
  const wallY = BOARD_OUT_Y - TABLE.wallSetbackM * MY
  slab(g, C.floor, TABLE_ZONE_X[0], TABLE_ZONE_X[1], wallY, BOARD_OUT_Y, 0)
  wall(g, C.wall, TABLE_ZONE_X[0], TABLE_ZONE_X[1], wallY, 0, TABLE.wallHeightM)
}

/**
 * Bancos de sancionados a cada lado de la mesa: el mismo asiento que los
 * banquillos (alto y fondo) pero neutro, con respaldo bajo y patas. Por debajo
 * de quien se sienta en ellos.
 */
function drawPenaltyBenches(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(DEPTH.OFFCOURT_FAR + 0.0002)
  const anchorY = BOARD_OUT_Y - PENALTY_BOX.seatSetbackM * MY
  const front = anchorY + BENCH.seatAheadM * MY
  const back = front - BENCH.seatDepthM * MY
  const sh = BENCH.seatHeightM
  const post = 0.028 * MX
  for (const team of ['blue', 'red'] as const) {
    const [u0, u1] = PENALTY_BOX.u
    const xa = benchX(team, u0), xb = benchX(team, u1)
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb)
    const legs = [x0 + 0.08 * MX, (x0 + x1) / 2, x1 - 0.08 * MX]
    for (const lx of legs) wall(g, C.side, lx - post, lx + post, back - 0.02 * MY, 0, BENCH.backrestM[0] + 0.1)
    wall(g, C.stool, x0, x1, back - 0.02 * MY, BENCH.backrestM[0] - 0.08, BENCH.backrestM[0] + 0.1)
    wall(g, C.stoolEdge, x0, x1, back - 0.02 * MY, BENCH.backrestM[0] + 0.07, BENCH.backrestM[0] + 0.1)
    slab(g, C.stoolEdge, x0, x1, back, front, sh)
    wall(g, C.stool, x0, x1, front, sh - 0.045, sh)
    for (const lx of legs) wall(g, C.side, lx - post, lx + post, front - 0.04 * MY, 0, sh - 0.045)
  }
}

/** Mesa con faldón y logotipo, portátil, papeles y la caja del marcador; una pieza delante de las figuras sentadas. */
function drawTable(scene: Phaser.Scene) {
  const yF = BOARD_OUT_Y - TABLE.setbackM * MY
  const yB = yF - TABLE.depthM * MY
  const [x0, x1] = TABLE_X
  const h = TABLE.heightM
  const g = scene.add.graphics().setDepth(bandDepth('OFFCOURT_FAR', project(CX, yF).y))
  side(g, C.side, x0, yB, yF, 0, h)
  side(g, C.side, x1, yB, yF, 0, h)
  slab(g, C.top, x0, x1, yB, yF, h)
  wall(g, C.skirt, x0, x1, yF, 0, h)
  wall(g, tone(C.skirt, 0.7), x0, x1, yF, 0, 0.06)
  wall(g, C.skirtBand, x0, x1, yF, h - 0.2, h - 0.12)
  wall(g, C.topEdge, x0, x1, yF, h - 0.04, h)

  // Papeles del anotador: dos hojas algo giradas sobre el tablero, con renglones
  const pp = TABLE.papers
  const py0 = yB + 0.12 * MY, py1 = py0 + pp.depthM * MY
  for (const [dx, c] of [[-0.06, tone(C.paper, 0.92)], [0.04, C.paper]] as const) {
    const a = CX + (pp.x + dx - pp.widthM / 2) * MX, b = CX + (pp.x + dx + pp.widthM / 2) * MX
    slab(g, c, a, b, py0, py1, h + 0.004)
  }
  for (let r = 0; r < 4; r++) {
    const ry = py0 + (0.07 + r * 0.055) * MY
    slab(g, C.paperLine, CX + (pp.x - 0.12) * MX, CX + (pp.x + 0.2) * MX, ry, ry + 0.012 * MY, h + 0.006)
  }

  // Portátil del cronometrador: base y tapa vista por detrás con su logotipo
  const lp = TABLE.laptop
  const lx0 = CX + (lp.x - lp.widthM / 2) * MX, lx1 = CX + (lp.x + lp.widthM / 2) * MX
  const ly = yB + 0.18 * MY
  slab(g, C.laptopEdge, lx0, lx1, ly - 0.24 * MY, ly, h + 0.012)
  wall(g, C.laptopEdge, lx0 - 0.008 * MX, lx1 + 0.008 * MX, ly + 0.004 * MY, h + 0.012, h + lp.heightM + 0.008)
  wall(g, C.laptop, lx0, lx1, ly + 0.006 * MY, h + 0.018, h + lp.heightM)
  const lc = CX + lp.x * MX
  wall(g, C.laptopLogo, lc - 0.035 * MX, lc + 0.035 * MX, ly + 0.008 * MY, h + lp.heightM * 0.48, h + lp.heightM * 0.48 + 0.07)

  // Marcador: caja sobre dos patas cortas, apoyada en la mesa; los dígitos son textos
  const b = TABLE.board
  const bx0 = CX + (b.x - b.widthM / 2) * MX
  const bx1 = CX + (b.x + b.widthM / 2) * MX
  const by = (yF + yB) / 2
  const z0 = h + b.standM
  wall(g, C.board, bx0 + 0.08 * MX, bx0 + 0.12 * MX, by, h, z0)
  wall(g, C.board, bx1 - 0.12 * MX, bx1 - 0.08 * MX, by, h, z0)
  wall(g, C.board, bx0, bx1, by, z0, z0 + b.heightM)
  wall(g, tone(C.boardLit, 0.35), bx0 + 0.03 * MX, bx1 - 0.03 * MX, by, z0 + 0.03, z0 + b.heightM - 0.03)
  wall(g, C.board, bx0 + 0.045 * MX, bx1 - 0.045 * MX, by, z0 + 0.045, z0 + b.heightM - 0.045)
  wall(g, tone(C.boardLit, 0.25), bx0 + 0.05 * MX, bx1 - 0.05 * MX, by, z0 + b.heightM * 0.47, z0 + b.heightM * 0.5)
  const depth = g.depth + 0.001
  createLed(scene, (bx0 + bx1) / 2, by, z0, bx1 - bx0, depth)
  createLogo(scene, yF, h, depth)
}

/** Logotipo de la competición centrado en el faldón (nombre del partido externo o el genérico). */
function createLogo(scene: Phaser.Scene, yF: number, h: number, depth: number) {
  const name = (getPartidoExterno()?.competicion ?? TABLE.logo.text).toUpperCase()
  const mid = project(CX, yF, (h * 0.42) * M)
  const w = project(CX + TABLE.logo.widthM * MX, yF, 0).x - project(CX, yF, 0).x
  const hh = project(CX, yF, 0).y - project(CX, yF, 0.32 * M).y
  const text = scene.add.text(mid.x, mid.y, name, { fontFamily: ARCADE_FONT, fontSize: '40px', color: C.logoText })
    .setOrigin(0.5).setDepth(depth)
  text.setScale(Math.min(hh / text.height, w / text.width))
}

/**
 * Marcador LED: reloj del periodo arriba y tanteo azul–rojo abajo (los bancos no
 * cambian en el descanso: el azul siempre a la izquierda). Escucha los eventos de
 * la simulación y se da de baja al cerrar la escena.
 */
function createLed(scene: Phaser.Scene, cx: number, by: number, z0: number, wWorld: number, depth: number) {
  const hz = TABLE.board.heightM
  const w = project(cx + wWorld / 2, by, 0).x - project(cx - wWorld / 2, by, 0).x
  const top = project(cx, by, (z0 + hz * 0.73) * M)
  const bot = project(cx, by, (z0 + hz * 0.25) * M)
  const clock = scene.add.text(top.x, top.y, '20:00', { fontFamily: LED_FONT, fontSize: '32px', color: C.clockText, fontStyle: 'bold' })
    .setOrigin(0.5).setDepth(depth)
  clock.setScale((w * 0.8) / clock.width)
  const score = scene.add.text(bot.x, bot.y, '0 - 0', { fontFamily: LED_FONT, fontSize: '32px', color: C.scoreText, fontStyle: 'bold' })
    .setOrigin(0.5).setDepth(depth)
  score.setScale((w * 0.72) / score.width)

  const onClock = (e: { seconds: number }) => {
    const s = Math.max(0, Math.ceil(e.seconds))
    const txt = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    if (clock.text !== txt) clock.setText(txt)
  }
  const onGoal = (e: { blue: number; red: number }) => {
    const txt = `${e.blue} - ${e.red}`
    if (score.text !== txt) score.setText(txt)
  }
  scene.events.on('match:clock', onClock)
  scene.events.on('match:goal', onGoal)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('match:clock', onClock)
    scene.events.off('match:goal', onGoal)
  })
}

/** Dibuja la zona de mesa: fondo, bancos de sancionados, mesa y marcador. */
export function drawOfficialsTable(scene: Phaser.Scene) {
  drawBackdrop(scene)
  drawPenaltyBenches(scene)
  drawTable(scene)
}
