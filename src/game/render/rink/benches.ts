/** Banquillos del lado lejano: estructura en coordenadas de mundo proyectada con la cámara única. */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import { BENCH, DEPTH, PX_PER_M, WORLD_PX_PER_M } from '../artSpec'
import { project } from '../viewTransform'
import { BOARD_W } from './geometry'

const CX = RINK.x + RINK.width / 2
const M = PX_PER_M
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y

/** Extremos en X (mundo) de cada banquillo. */
const BLUE_X: [number, number] = [RINK.x + BENCH.cornerGapM * MX, CX - BENCH.centerGapM * MX]
const RED_X: [number, number] = [CX + BENCH.centerGapM * MX, RINK.x + RINK.width - BENCH.cornerGapM * MX]
/** Cara exterior de la valla lejana. */
const BOARD_OUT_Y = RINK.y - BOARD_W
/** Pies de los sentados (debe coincidir con benchPlayers.ts). */
const FEET_Y = BOARD_OUT_Y - BENCH.seatSetbackM * MY

/** Franja de pantalla ocupada por banquillos y mesa (el público no se pinta ahí). */
export const BENCH_SCREEN_RANGE = {
  left: project(BLUE_X[0], BOARD_OUT_Y, 0).x - 6,
  right: project(RED_X[1], BOARD_OUT_Y, 0).x + 6,
  bottom: project(CX, BOARD_OUT_Y, 0).y,
}

/**
 * Banquillos de ambos equipos. Se dibujan en la banda OFFCOURT_FAR: por debajo
 * de las figuras sentadas (benchPlayers.ts) y por detrás de la valla lejana.
 * Las figuras de los sentados las crea benchPlayers.ts.
 */
export function drawBenches(g: Phaser.GameObjects.Graphics) {
  g.setDepth(DEPTH.OFFCOURT_FAR)
  paintBench(g, BLUE_X[0], BLUE_X[1], 0x0e2a6a, 0x2255cc)
  paintBench(g, RED_X[0], RED_X[1], 0x6a0e0e, 0xcc2222)
}

/** Rellena un cuadrilátero dado por cuatro puntos de mundo (wx, wy, wz). */
function quad(
  g: Phaser.GameObjects.Graphics, color: number, alpha: number,
  a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number],
) {
  const pa = project(...a)
  const pb = project(...b)
  const pc = project(...c)
  const pd = project(...d)
  g.fillStyle(color, alpha)
  g.fillTriangle(pa.x, pa.y, pb.x, pb.y, pc.x, pc.y)
  g.fillTriangle(pa.x, pa.y, pc.x, pc.y, pd.x, pd.y)
}

/** Plano vertical a wy fijo entre x0..x1 y alturas z0..z1 (m). */
function wall(g: Phaser.GameObjects.Graphics, color: number, alpha: number, x0: number, x1: number, wy: number, z0: number, z1: number) {
  quad(g, color, alpha, [x0, wy, z0 * M], [x1, wy, z0 * M], [x1, wy, z1 * M], [x0, wy, z1 * M])
}

/** Plano horizontal a altura z entre dos filas wy. */
function slab(g: Phaser.GameObjects.Graphics, color: number, alpha: number, x0: number, x1: number, wyBack: number, wyFront: number, z: number) {
  quad(g, color, alpha, [x0, wyBack, z * M], [x1, wyBack, z * M], [x1, wyFront, z * M], [x0, wyFront, z * M])
}

/**
 * Estructura de un banquillo (de atrás hacia delante): suelo, pared del fondo
 * con franja del equipo, respaldo, asiento y frente del asiento.
 */
function paintBench(g: Phaser.GameObjects.Graphics, x0: number, x1: number, teamDark: number, teamLight: number) {
  const wallY = BOARD_OUT_Y - BENCH.wallSetbackM * MY
  const backY = FEET_Y - (BENCH.seatDepthM + 0.05) * MY
  const frontY = FEET_Y - 0.05 * MY
  const sh = BENCH.seatHeightM

  slab(g, 0x07111e, 1, x0, x1, wallY, BOARD_OUT_Y, 0)
  wall(g, 0x030810, 1, x0, x1, wallY, 0, BENCH.wallHeightM)
  wall(g, teamLight, 0.55, x0, x1, wallY, BENCH.wallHeightM - 0.3, BENCH.wallHeightM - 0.22)
  wall(g, teamDark, 0.7, x0, x1, wallY, BENCH.wallHeightM - 0.22, BENCH.wallHeightM - 0.1)
  wall(g, 0x091629, 1, x0 + 0.2 * MX, x1 - 0.2 * MX, backY, sh, BENCH.backrestTopM)
  wall(g, teamLight, 0.08, x0 + 0.2 * MX, x1 - 0.2 * MX, backY, BENCH.backrestTopM - 0.25, BENCH.backrestTopM)
  slab(g, 0x0d2040, 1, x0 + 0.2 * MX, x1 - 0.2 * MX, backY, frontY, sh)
  wall(g, 0x07111e, 1, x0 + 0.2 * MX, x1 - 0.2 * MX, frontY, 0, sh)
  wall(g, teamLight, 0.6, x0 + 0.2 * MX, x1 - 0.2 * MX, frontY, sh - 0.12, sh)
}
