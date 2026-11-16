import { GAME_HEIGHT, RINK } from '../constants'

/**
 * Constantes visuales del mundo (SPEC §1–§3): escala, exageraciones, cámara
 * y bandas de profundidad. Las de gameplay siguen en `constants.ts`.
 */

/** Metros reales de la pista que representa `RINK` (40 × 20 m). */
export const RINK_METERS = { length: 40, width: 20 } as const

/** px de mundo por metro en altura (z). Coincide con el eje X. */
export const PX_PER_M = 28.5

/** px de mundo por metro en cada eje. Y tiene un 5 % de anisotropía heredada que no se corrige. */
export const WORLD_PX_PER_M = {
  x: RINK.width / RINK_METERS.length,
  y: RINK.height / RINK_METERS.width,
  z: PX_PER_M,
} as const

/** Exageración uniforme de toda figura humana, por legibilidad. Se ajusta solo en el Gate A. */
export const FIGURE_EXAG = 1.15

/**
 * Cámara estenopeica única (SPEC §2), en px de mundo.
 *
 * - `height`: altura del centro óptico sobre el suelo (≈ 95 m).
 * - `distance`: distancia horizontal desde el centro óptico hasta el borde cercano de la pista.
 * - `tiltDeg`: inclinación del eje óptico; negativa = por encima de la horizontal.
 *   Con el plano de imagen casi vertical (lente descentrada) las verticales salen
 *   casi verticales y 1 m de altura mide ≈ PX_PER_M en el centro (s ≈ 1).
 * - `focal`: focal en px de pantalla. focal / profundidad del borde cercano ≈ 1
 *   conserva el ancho de la pista en primer plano.
 * - `farEdgeY`: y de pantalla del borde lejano; fija el descentrado vertical.
 *
 * Valores ajustados para conservar el encuadre previo: borde lejano y = 130,
 * cercano y ≈ 618, anchura lejana 0,82 de la cercana.
 */
export const CAMERA = {
  height: 2700,
  distance: 3045,
  tiltDeg: -6.5,
  focal: 2715,
  farEdgeY: 130,
} as const

/**
 * Bandas de profundidad (SPEC §3). Cada banda empieza en su valor; las que
 * tienen recorrido (`DEPTH_SPAN`) se reparten por la y de pantalla de la base.
 */
export const DEPTH = {
  BACKDROP: -100,
  STANDS_FAR: -90,
  OFFCOURT_FAR: -50,
  BOARD_FAR: -20,
  FLOOR: -10,
  COURT: 0,
  BOARD_NEAR: 20,
  STANDS_NEAR: 21,
  FX: 26,
  UI: 41,
} as const

export type DepthBand = keyof typeof DEPTH

/** Recorrido de cada banda: depth ∈ [DEPTH[b], DEPTH[b] + DEPTH_SPAN[b]]. */
export const DEPTH_SPAN: Record<DepthBand, number> = {
  BACKDROP: 0,
  STANDS_FAR: 30,
  OFFCOURT_FAR: 20,
  BOARD_FAR: 0,
  FLOOR: 0,
  COURT: 19,
  BOARD_NEAR: 0,
  STANDS_NEAR: 4,
  FX: 14,
  UI: 0,
}

/** Rango de y de pantalla (zoom 1) que se reparte dentro de cada banda; cubre el pabellón entero. */
export const DEPTH_SCREEN_Y = { min: -GAME_HEIGHT / 2, max: GAME_HEIGHT * 1.5 } as const

/** Depth dentro de una banda según la y de pantalla de la base del objeto. */
export function bandDepth(band: DepthBand, screenY: number): number {
  const span = DEPTH_SPAN[band]
  if (span === 0) return DEPTH[band]
  const t = (screenY - DEPTH_SCREEN_Y.min) / (DEPTH_SCREEN_Y.max - DEPTH_SCREEN_Y.min)
  return DEPTH[band] + span * Math.max(0, Math.min(1, t))
}

// ─── Suelo y marcas (WP-42) ─────────────────────────────────────────────────

/** Suelo y marcas de la pista (SPEC §10). Líneas reglamentarias de 8 cm ≈ 2,5 px. */
export const FLOOR_STYLE = {
  /** Degradado de la pintura, de la valla lejana a la cercana (casi uniforme). */
  colorFar: '#1d5aa5',
  colorMid: '#1f5fae',
  colorNear: '#2266b6',
  /** Grano: nº de motas y opacidades. */
  grainCount: 16000,
  grainLight: 'rgba(255,255,255,0.03)',
  grainDark: 'rgba(0,10,30,0.05)',
  /** Reflejos cenitales: posiciones relativas en la pista y opacidad del centro. */
  spotsX: [0.2, 0.5, 0.8],
  spotsY: [0.25, 0.75],
  spotAlpha: 0.13,
} as const

export const MARKINGS = {
  lineWidth: 2.5,
  lineColor: 0xf2f6fb,
  lineAlpha: 0.95,
  /** Radio en px de pantalla de los puntos (Ø 10 cm, algo exagerado para leerse). */
  dotRadius: 3,
} as const

// ─── WP-11: figuras y estructuras fuera de la pista ─────────────────────────

/** Altura real de un jugador de pie, en metros. */
export const PLAYER_HEIGHT_M = 1.75

/**
 * Puppet en coordenadas locales del contenedor (origen en el centro del torso):
 * `topY` = coronilla del casco, `feetY` = suela del patín. Sirven para escalar
 * la figura a `PLAYER_HEIGHT_M` y para anclar el contenedor por los pies.
 */
export const PUPPET_LOCAL = { topY: -38, feetY: 40 } as const

/** Escala del contenedor del puppet para la profundidad `s` (origen en los pies). */
export function figureScale(s: number): number {
  return ((PLAYER_HEIGHT_M * PX_PER_M) / (PUPPET_LOCAL.feetY - PUPPET_LOCAL.topY)) * s * FIGURE_EXAG
}

/** Diámetro visual de la bola en metros (exagerado: la real mide 7 cm y no se vería). */
export const BALL_VISUAL_DIAMETER_M = 0.48

/** Altura de la valla, en metros (SPEC §1). */
export const BOARD_HEIGHT_M = 1.0

/** Gradas: altura de la primera fila y subida por escalón, en metros; altura de un espectador sentado. */
export const STANDS = { firstHeightM: 0.42, tierRiseM: 0.53, fanHeightM: 1.25 } as const

/**
 * Banquillos del lado lejano, en metros desde la cara exterior de la valla
 * lejana (hacia fuera) y desde el borde de la pista en X. El eje X del banco
 * azul se espeja para el rojo.
 */
export const BENCH = {
  /** Del extremo exterior del banco a la esquina de la pista (m). */
  cornerGapM: 4,
  /** Del extremo interior del banco al centro de la pista (m). */
  centerGapM: 2.5,
  /** Distancia valla exterior → pies de los sentados (m). */
  seatSetbackM: 1.7,
  seatHeightM: 0.5,
  seatDepthM: 0.55,
  backrestTopM: 1.15,
  /** Distancia valla exterior → pared del fondo (m) y su altura (m). */
  wallSetbackM: 2.7,
  wallHeightM: 1.7,
  /** Altura equivalente de un jugador sentado con los patines hacia delante (m). */
  seatedHeightM: 1.4,
} as const

/** Zona de sancionados junto a la mesa: distancia a la valla exterior, al centro y entre figuras (m). */
export const PENALTY_BOX = { setbackM: 0.7, centerGapM: 1.4, stepM: 1.1 } as const
