/**
 * Mesa de oficiales y asientos de sancionados (WP-51, SPEC §9): lado lejano,
 * tras la valla, en coordenadas de mundo proyectadas con la cámara única.
 * Todo es estático: el fondo, la mesa y los taburetes se dibujan una vez y las
 * tres figuras (auxiliar, cronometrador, anotador) se posan una sola vez.
 * La geometría (extremos en X, asientos) se exporta para los banquillos (WP-52).
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import type { TeamColor } from '../../types'
import { DEPTH, PENALTY_BOX, PUPPET_LOCAL, PX_PER_M, TABLE, WORLD_PX_PER_M, bandDepth, figureScale } from '../artSpec'
import { PuppetRig } from '../puppet/rig'
import { officialKit } from '../puppet/kit'
import { createPose, resetPose } from '../puppet/pose'
import { seatedPose } from '../puppet/locomotion'
import { project } from '../viewTransform'
import { BOARD_W } from './geometry'

const M = PX_PER_M
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y
const CX = RINK.x + RINK.width / 2
/** Cara exterior de la valla lejana (mundo). */
const BOARD_OUT_Y = RINK.y - BOARD_W
const C = TABLE.colors

/** Extremos en X (mundo) de la mesa y de la zona trasera (suelo y pared) que ocupa con los sancionados. */
export const TABLE_X: [number, number] = [CX - (TABLE.widthM / 2) * MX, CX + (TABLE.widthM / 2) * MX]
export const TABLE_ZONE_X: [number, number] = [CX - TABLE.zoneHalfM * MX, CX + TABLE.zoneHalfM * MX]

/** Posición de mundo (pies) del asiento n (0 = el más próximo a la valla) de un equipo: azul a la izquierda, rojo a la derecha. */
export function penaltySeat(team: TeamColor, n: number, out = { x: 0, y: 0 }): { x: number; y: number } {
  const row = Math.min(Math.max(0, Math.floor(n)), PENALTY_BOX.maxRows - 1)
  out.x = CX + (team === 'blue' ? -1 : 1) * PENALTY_BOX.centerGapM * MX
  out.y = BOARD_OUT_Y - (PENALTY_BOX.setbackM + row * PENALTY_BOX.stepM) * MY
  return out
}

type P3 = [number, number, number]

/** Rellena un cuadrilátero dado por cuatro puntos de mundo (x, y, z en px). */
function quad(g: Phaser.GameObjects.Graphics, color: number, alpha: number, a: P3, b: P3, c: P3, d: P3) {
  const pa = project(...a), pb = project(...b), pc = project(...c), pd = project(...d)
  g.fillStyle(color, alpha)
  g.fillTriangle(pa.x, pa.y, pb.x, pb.y, pc.x, pc.y)
  g.fillTriangle(pa.x, pa.y, pc.x, pc.y, pd.x, pd.y)
}

/** Plano vertical a y fijo, entre x0..x1 y alturas z0..z1 (m). */
function wall(g: Phaser.GameObjects.Graphics, color: number, x0: number, x1: number, wy: number, z0: number, z1: number) {
  quad(g, color, 1, [x0, wy, z0 * M], [x1, wy, z0 * M], [x1, wy, z1 * M], [x0, wy, z1 * M])
}

/** Plano vertical a x fijo, entre y0..y1 y alturas z0..z1 (m). */
function side(g: Phaser.GameObjects.Graphics, color: number, wx: number, y0: number, y1: number, z0: number, z1: number) {
  quad(g, color, 1, [wx, y0, z0 * M], [wx, y1, z0 * M], [wx, y1, z1 * M], [wx, y0, z1 * M])
}

/** Plano horizontal a altura z (m). */
function slab(g: Phaser.GameObjects.Graphics, color: number, x0: number, x1: number, yBack: number, yFront: number, z: number) {
  quad(g, color, 1, [x0, yBack, z * M], [x1, yBack, z * M], [x1, yFront, z * M], [x0, yFront, z * M])
}

/** Suelo y pared del fondo de la zona de mesa; por debajo de las figuras. */
function drawBackdrop(scene: Phaser.Scene) {
  const g = scene.add.graphics().setDepth(DEPTH.OFFCOURT_FAR)
  const wallY = BOARD_OUT_Y - TABLE.wallSetbackM * MY
  slab(g, C.floor, TABLE_ZONE_X[0], TABLE_ZONE_X[1], wallY, BOARD_OUT_Y, 0)
  wall(g, C.wall, TABLE_ZONE_X[0], TABLE_ZONE_X[1], wallY, 0, TABLE.wallHeightM)
}

/** Mesa con faldón y marcador; una sola pieza delante de las figuras sentadas. */
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
  wall(g, C.skirtBand, x0, x1, yF, h - 0.2, h - 0.12)
  wall(g, C.topEdge, x0, x1, yF, h - 0.04, h)

  // Marcador: panel sobre dos patas cortas, apoyado en el centro de la mesa
  const b = TABLE.board
  const bx0 = CX + (b.x - b.widthM / 2) * MX
  const bx1 = CX + (b.x + b.widthM / 2) * MX
  const by = (yF + yB) / 2
  const z0 = h + b.standM
  wall(g, C.board, bx0, bx1, by, z0, z0 + b.heightM)
  wall(g, C.boardLit, bx0 + 0.05 * MX, bx1 - 0.05 * MX, by, z0 + 0.06, z0 + b.heightM - 0.06)
  wall(g, C.board, bx0 + 0.08 * MX, bx1 - 0.08 * MX, by, z0 + 0.1, z0 + b.heightM - 0.1)
  const tl = project((bx0 + bx1) / 2, by, (z0 + b.heightM / 2) * M)
  const w = project(bx1, by, 0).x - project(bx0, by, 0).x
  scene.add.text(tl.x, tl.y, '20:00', { fontFamily: '"Courier New", Courier, monospace', fontSize: '24px', color: '#ffb347', fontStyle: 'bold' })
    .setOrigin(0.5).setScale((w * 0.8) / 70).setDepth(g.depth + 0.001)
}

/** Las tres figuras sentadas, de cara a la pista, posadas una sola vez. */
function createSeatedOfficials(scene: Phaser.Scene) {
  const y = BOARD_OUT_Y - TABLE.figSetbackM * MY
  const pose = createPose()
  TABLE.figX.forEach((fx, i) => {
    const rig = new PuppetRig(scene, 'official', officialKit(i + 1, i * 2 + 1), 1)
    const foot = project(CX + fx * MX, y, 0)
    const k = figureScale(foot.s)
    resetPose(pose)
    pose.yaw = 0
    seatedPose(pose)
    rig.apply(pose)
    rig.container.setPosition(foot.x, foot.y - PUPPET_LOCAL.feetY * k).setScale(k)
      .setDepth(bandDepth('OFFCOURT_FAR', foot.y))
  })
}

/** Taburetes de los asientos de sancionados (vacíos o no): detrás de la figura que se sienta en ellos. */
function drawStools(scene: Phaser.Scene) {
  const { w, d, h } = TABLE.stoolM
  for (const team of ['blue', 'red'] as const) {
    for (let n = 0; n < PENALTY_BOX.maxRows; n++) {
      const s = penaltySeat(team, n)
      const foot = project(s.x, s.y, 0)
      const g = scene.add.graphics().setDepth(bandDepth('OFFCOURT_FAR', foot.y) - 0.002)
      const x0 = s.x - (w / 2) * MX, x1 = s.x + (w / 2) * MX
      const yF = s.y - 0.1 * MY, yB = yF - d * MY
      wall(g, C.wall, x0, x1, yF, 0, h)
      slab(g, C.stool, x0, x1, yB, yF, h)
    }
  }
}

/** Dibuja y monta la mesa de oficiales con sus figuras y los taburetes de sancionados. */
export function drawOfficialsTable(scene: Phaser.Scene) {
  drawBackdrop(scene)
  drawStools(scene)
  drawTable(scene)
  createSeatedOfficials(scene)
}
