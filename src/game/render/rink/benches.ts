/**
 * Banquillos del lado lejano (WP-69, SPEC §9): suelo, pared con el rótulo del
 * equipo, tarima, banco con respaldo y patas, y la utilería fija (bolsa,
 * botellas, sticks apoyados en la pared). Todo es estático y lo hornea drawRink.
 * Las figuras (suplentes, entrenador, delegado) las crea benchPlayers.ts sobre
 * las medidas que se exportan aquí.
 *
 * Las posiciones se dan en metros desde la línea central (`u`) en el lado de
 * cada equipo: el banco azul a la izquierda, el rojo espejado a la derecha. Los
 * bancos no cambian en el descanso aunque los equipos cambien de campo.
 */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import type { TeamColor } from '../../types'
import { claveEscudo, ladoDeHueco, nombreDeHueco, registrarEscudos } from '../../externalMatch'
import { BENCH, DEPTH, FIGURE_EXAG, PLAYER_HEIGHT_M, PX_PER_M, RINK_METERS, WORLD_PX_PER_M } from '../artSpec'
import { ARCADE_FONT } from '../arcadeFx'
import { teamKit } from '../puppet/kit'
import { tone } from '../puppet/paint'
import { project } from '../viewTransform'
import { BOARD_W } from './geometry'

const CX = RINK.x + RINK.width / 2
const M = PX_PER_M
const MX = WORLD_PX_PER_M.x
const MY = WORLD_PX_PER_M.y
const C = BENCH.colors
/** Cara exterior de la valla lejana. */
const BOARD_OUT_Y = RINK.y - BOARD_W
const WALL_Y = BOARD_OUT_Y - BENCH.wallSetbackM * MY
/** Inicio (junto a la mesa) y fin (junto a la esquina) de la zona de banquillo, en m desde el centro. */
const AREA_U: [number, number] = [BENCH.centerGapM, RINK_METERS.length / 2 - BENCH.areaCornerM]

/** Lado de cada banco: -1 el azul (izquierda), 1 el rojo. */
export const benchSide = (team: TeamColor) => (team === 'blue' ? -1 : 1)
/** X de mundo a `u` m del centro en el lado del equipo. */
export const benchX = (team: TeamColor, u: number) => CX + benchSide(team) * u * MX
/** Y de mundo del ancla de los sentados (banco y sancionados comparten medidas). */
export const SEAT_ANCHOR_Y = BOARD_OUT_Y - BENCH.seatSetbackM * MY
/** Alto de la tarima en px de mundo (z de los pies de quien está en el banquillo). */
export const PLATFORM_Z = BENCH.platformM * M
/** Pelvis del sentado sobre sus pies, en unidades de figura (para `seatedPose`). */
export const SEAT_PELVIS_Y = (BENCH.seatHeightM + BENCH.pelvisOverSeatM) / (PLAYER_HEIGHT_M * FIGURE_EXAG)
/** Asiento respecto al ancla de los sentados: filas de mundo del borde delantero y del trasero. */
export const SEAT_FRONT_Y = SEAT_ANCHOR_Y + BENCH.seatAheadM * MY
export const SEAT_BACK_Y = SEAT_FRONT_Y - BENCH.seatDepthM * MY

/** Franja de pantalla ocupada por banquillos y mesa (el público no se pinta ahí). */
export const BENCH_SCREEN_RANGE = {
  left: project(benchX('blue', AREA_U[1]), BOARD_OUT_Y, 0).x - 6,
  right: project(benchX('red', AREA_U[1]), BOARD_OUT_Y, 0).x + 6,
  bottom: project(CX, BOARD_OUT_Y, 0).y,
}

type P3 = [number, number, number]
type G = Phaser.GameObjects.Graphics

/** Rellena un cuadrilátero dado por cuatro puntos de mundo (x, y, z en px). */
export function quad(g: G, color: number, alpha: number, a: P3, b: P3, c: P3, d: P3) {
  const pa = project(...a), pb = project(...b), pc = project(...c), pd = project(...d)
  g.fillStyle(color, alpha)
  // Un solo polígono: dos triángulos horneados en lienzo dejan una costura en la diagonal
  g.beginPath()
  g.moveTo(pa.x, pa.y)
  g.lineTo(pb.x, pb.y)
  g.lineTo(pc.x, pc.y)
  g.lineTo(pd.x, pd.y)
  g.closePath()
  g.fillPath()
}

/** Plano vertical a y fijo, entre x0..x1 y alturas z0..z1 (m). */
export function wall(g: G, color: number, x0: number, x1: number, wy: number, z0: number, z1: number, alpha = 1) {
  quad(g, color, alpha, [x0, wy, z0 * M], [x1, wy, z0 * M], [x1, wy, z1 * M], [x0, wy, z1 * M])
}

/** Plano vertical a x fijo, entre y0..y1 y alturas z0..z1 (m). */
export function side(g: G, color: number, wx: number, y0: number, y1: number, z0: number, z1: number) {
  quad(g, color, 1, [wx, y0, z0 * M], [wx, y1, z0 * M], [wx, y1, z1 * M], [wx, y0, z1 * M])
}

/** Plano horizontal a altura z (m). */
export function slab(g: G, color: number, x0: number, x1: number, yBack: number, yFront: number, z: number, alpha = 1) {
  quad(g, color, alpha, [x0, yBack, z * M], [x1, yBack, z * M], [x1, yFront, z * M], [x0, yFront, z * M])
}

/**
 * Banquillos de ambos equipos en la banda OFFCOURT_FAR, por debajo de las
 * figuras (benchPlayers.ts) y por detrás de la valla lejana. Los rótulos
 * (texto y escudo) son objetos aparte: no se hornean con el Graphics.
 */
export function drawBenches(g: G) {
  g.setDepth(DEPTH.OFFCOURT_FAR)
  registrarEscudos(g.scene.textures)
  for (const team of ['blue', 'red'] as const) paintBench(g, team)
}

/** Zona de un equipo de atrás hacia delante: suelo, pared y rótulo, tarima, bancos y utilería. */
function paintBench(g: G, team: TeamColor) {
  const t = teamKit(team)
  const x = (u: number) => benchX(team, u)
  const [a0, a1] = AREA_U
  const P = BENCH.platformM
  const H = BENCH.wallHeightM
  slab(g, C.floor, x(a0), x(a1), WALL_Y, BOARD_OUT_Y, 0)
  wall(g, C.wall, x(a0), x(a1), WALL_Y, 0, H)
  wall(g, t.jersey, x(a0), x(a1), WALL_Y, H - 0.3, H - 0.22, 0.55)
  wall(g, tone(t.jersey, 0.5), x(a0), x(a1), WALL_Y, H - 0.22, H - 0.1, 0.8)
  paintSign(g, team, t.jersey)

  // Tarima: tapa, canto iluminado y frente en sombra
  const platY = BOARD_OUT_Y - BENCH.platformSetbackM * MY
  const p0 = x(a0 + 0.05), p1 = x(a1 - 0.05)
  slab(g, C.platformTop, p0, p1, WALL_Y, platY, P)
  wall(g, C.platform, p0, p1, platY, 0, P)
  wall(g, C.platformEdge, p0, p1, platY, P - 0.025, P)
  side(g, C.platform, team === 'blue' ? p0 : p1, WALL_Y, platY, 0, P)

  for (const [u0, u1] of [BENCH.innerU, BENCH.outerU]) paintSeat(g, x(u0), x(u1), t.jersey)
  paintProps(g, team, t.jersey)
}

/**
 * Banco corrido: postes y dos tablas de respaldo, patas, travesaño y asiento,
 * del color del equipo. Lo de detrás se pinta antes (las patas traseras quedan
 * bajo el asiento).
 */
function paintSeat(g: G, xa: number, xb: number, jersey: number) {
  const P = BENCH.platformM
  const sh = P + BENCH.seatHeightM
  const [r0, r1] = BENCH.backrestM
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb)
  const post = 0.028 * MX
  const legs = [x0 + 0.1 * MX, (x0 + x1) / 2, x1 - 0.1 * MX]
  // Banco neutro con filete del equipo: los suplentes visten ese color y no deben fundirse con él
  const seat = C.seat
  const seatTop = C.seatTop
  for (const lx of legs) wall(g, C.frameDark, lx - post, lx + post, SEAT_BACK_Y - 0.03 * MY, P, P + r1 + 0.02)
  wall(g, seat, x0, x1, SEAT_BACK_Y - 0.02 * MY, P + r0, P + r0 + 0.15)
  wall(g, seat, x0, x1, SEAT_BACK_Y - 0.02 * MY, P + r1 - 0.17, P + r1)
  wall(g, jersey, x0, x1, SEAT_BACK_Y - 0.02 * MY, P + r1 - 0.11, P + r1 - 0.07)
  wall(g, seatTop, x0, x1, SEAT_BACK_Y - 0.02 * MY, P + r1 - 0.025, P + r1)
  for (const lx of legs) wall(g, C.frameDark, lx - post, lx + post, SEAT_BACK_Y + 0.02 * MY, P, sh)
  slab(g, seatTop, x0, x1, SEAT_BACK_Y, SEAT_FRONT_Y, sh)
  wall(g, seat, x0, x1, SEAT_FRONT_Y, sh - 0.045, sh)
  wall(g, jersey, x0, x1, SEAT_FRONT_Y + 0.002 * MY, sh - 0.03, sh - 0.015)
  wall(g, C.frame, x0 + 0.04 * MX, x1 - 0.04 * MX, SEAT_FRONT_Y - 0.03 * MY, sh - 0.09, sh - 0.06)
  for (const lx of legs) wall(g, C.frame, lx - post, lx + post, SEAT_FRONT_Y - 0.04 * MY, P, sh - 0.045)
}

/** Rótulo de la pared: panel oscuro con filete del equipo; el nombre y el escudo van encima como objetos. */
function paintSign(g: G, team: TeamColor, jersey: number) {
  const [z0, z1] = BENCH.signZ
  const half = BENCH.signW / 2
  const x0 = benchX(team, BENCH.signU - half), x1 = benchX(team, BENCH.signU + half)
  const wy = WALL_Y + 0.02 * MY
  wall(g, jersey, x0, x1, wy, z0 - 0.04, z1 + 0.04)
  wall(g, C.sign, x0 + 0.04 * Math.sign(x1 - x0) * MX, x1 - 0.04 * Math.sign(x1 - x0) * MX, wy, z0, z1)

  const scene = g.scene
  const name = nombreDeHueco(team, team === 'blue' ? 'Azul' : 'Rojo').toUpperCase()
  const key = claveEscudo(ladoDeHueco(team))
  const mid = project(benchX(team, BENCH.signU), wy, ((z0 + z1) / 2) * M)
  const w = Math.abs(project(x1, wy, z0 * M).x - project(x0, wy, z0 * M).x)
  const h = Math.abs(project(x0, wy, z1 * M).y - project(x0, wy, z0 * M).y)
  const depth = DEPTH.OFFCOURT_FAR + 0.0005
  const crest = key && scene.textures.exists(key) ? h * 0.82 : 0
  const text = scene.add.text(0, mid.y, name, { fontFamily: ARCADE_FONT, fontSize: '40px', color: C.signText })
    .setOrigin(0.5).setDepth(depth)
  const scale = Math.min((h * 0.62) / text.height, (w * 0.86 - crest * 1.2) / text.width)
  text.setScale(scale).setX(mid.x + crest * 0.6)
  if (crest) {
    const img = scene.add.image(mid.x - (text.width * scale) / 2 - crest * 0.1, mid.y, key!).setDepth(depth)
    img.setScale(crest / Math.max(img.width, img.height))
  }
}

/**
 * Utilería fija: sticks apoyados en la pared al fondo de la tarima, bolsa de
 * material delante y botellas en el borde de la tarima.
 */
function paintProps(g: G, team: TeamColor, jersey: number) {
  const P = BENCH.platformM
  const x = (u: number) => benchX(team, u)
  const s = benchSide(team)
  BENCH.sticksU.forEach((u, i) => {
    // Pala en la tarima, algo separada de la pared, y puño apoyado arriba
    const foot = WALL_Y + (0.32 + (i % 2) * 0.06) * MY
    const lean = s * (i - 1.5) * 0.05 * MX
    const w = 0.022 * MX
    quad(g, C.shaft, 1, [x(u) - w, foot, P * M], [x(u) + w, foot, P * M], [x(u) + w + lean, WALL_Y + 0.03 * MY, (P + 1.12) * M], [x(u) - w + lean, WALL_Y + 0.03 * MY, (P + 1.12) * M])
    wall(g, tone(jersey, 0.7), x(u) - w + lean * 0.95, x(u) + w + lean * 0.95, WALL_Y + 0.05 * MY, P + 0.98, P + 1.08)
    quad(g, C.blade, 1, [x(u) - w, foot, P * M], [x(u) + s * 0.14 * MX, foot + 0.05 * MY, P * M], [x(u) + s * 0.14 * MX, foot + 0.05 * MY, (P + 0.06) * M], [x(u) - w, foot, (P + 0.07) * M])
  })

  // Bolsa: tapa, frente y lateral, con franja del equipo
  const by = BOARD_OUT_Y - (BENCH.platformSetbackM + 0.75) * MY
  const bd = 0.38 * MY
  const b0 = x(BENCH.bagU - 0.38), b1 = x(BENCH.bagU + 0.38)
  side(g, tone(C.bag, 0.8), team === 'blue' ? b0 : b1, by - bd, by, P, P + 0.32)
  wall(g, C.bag, b0, b1, by, P, P + 0.32)
  slab(g, tone(C.bag, 1.35), b0, b1, by - bd, by, P + 0.32)
  wall(g, jersey, b0, b1, by + 0.005 * MY, P + 0.14, P + 0.19)
  slab(g, tone(jersey, 0.8), x(BENCH.bagU - 0.06), x(BENCH.bagU + 0.06), by - bd, by, P + 0.325)

  // Botellas en la tarima, delante del banco (más cerca quedarían tapadas por la valla): cuerpo, reflejo y tapón
  for (const u of BENCH.bottlesU) {
    for (let k = 0; k < 3; k++) {
      const bx = x(u + (k - 1) * 0.1)
      const yy = SEAT_FRONT_Y + (0.3 + (k % 2) * 0.08) * MY
      const r = 0.035 * MX
      wall(g, C.bottle, bx - r, bx + r, yy, P, P + 0.22)
      wall(g, tone(C.bottle, 1.4), bx - r * 0.5, bx - r * 0.1, yy + 0.005 * MY, P + 0.03, P + 0.2)
      wall(g, C.bottleCap, bx - r * 0.55, bx + r * 0.55, yy, P + 0.22, P + 0.27)
    }
  }
}
