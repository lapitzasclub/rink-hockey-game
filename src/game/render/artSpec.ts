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

// Rig de figura (WP-30)

/**
 * Proporciones del estilo A (SPEC §4) en unidades de figura (de pie = 1):
 * cabezas por altura, engorde de miembros, altura de rueda+placa del patín y
 * achatamiento de la cabeza.
 */
export const RIG_PROPORTIONS = { heads: 4.5, limb: 1.2, skate: 0.08, headAspect: 1.06 } as const

/** Escorzo del suelo dentro de la figura: lo que avanza hacia cámara baja en pantalla esta fracción. */
export const RIG_FLOOR_FORESHORTEN = 0.3

/** Px de textura por px de pantalla a s = 1 (margen para zoom de cámara y cabezones). */
export const RIG_TEX_SUPERSAMPLE = 2

/** Contorno (SPEC §4) en px a s = 1: normal y fino (ruedas, freno, stick, que se empastan a s = 1). */
export const RIG_OUTLINE = { color: 0x08111b, min: 0.8, max: 1.6, thinMin: 0.35, thinMax: 0.6 } as const

/** Grosor mínimo del mango del stick en px a s = 1. */
export const RIG_STICK_MIN_PX = 2

/** Equipamiento sin color de equipo. */
export const RIG_GEAR = {
  boot: 0x24272e,
  plate: 0x9aa4ae,
  wheel: 0xeee6cf,
  toeStop: 0xd2a86e,
  kneePad: 0x22252b,
  shaft: 0xcf9a5c,
  blade: 0x1b1d22,
  pad: 0xf2eee5,
  cage: 0xc3cad2,
  shoe: 0x15171b,
} as const

/** Equipaciones (SPEC §4): color principal, segundo color en pantalón y medias, dorsal por contraste. */
export const TEAM_KITS = {
  blue: { jersey: 0x3399ff, shorts: 0x15316a, socks: 0x15316a, gloves: 0x15316a, helmet: 0x3399ff, numColor: 0xffffff, trim: 0x15316a },
  red: { jersey: 0xff3333, shorts: 0xf2efe9, socks: 0xf2efe9, gloves: 0x8a1420, helmet: 0xff3333, numColor: 0xffffff, trim: 0x8a1420 },
} as const

/** Tonos de piel (SPEC §5: 4) y colores de pelo (3–4 tipos). */
export const SKIN_TONES = [0xf1c7a1, 0xe2ab80, 0xc98d62, 0x8d5a3b] as const
export const HAIR_COLORS = [0x2a1b12, 0x6b4426, 0xd8b46a, 0x121212] as const

/** Plantilla de dorsales por equipo: el portero lleva `goalie`; los de campo, `field` por orden de alta. */
export const TEAM_NUMBERS = {
  blue: { goalie: '1', field: ['4', '7', '9', '10', '5', '8', '11', '6'] },
  red: { goalie: '1', field: ['3', '5', '8', '11', '2', '6', '9', '10'] },
} as const

/**
 * Pose base mínima (WP-30; la afinan WP-31/32/33), en unidades de figura y rad.
 * `strideHz`: zancadas por segundo en reposo → a tope (`sprintHz` al esprintar).
 * `reach`: alcance de la pala con bola; `depthReach` lo amplía en profundidad de vista
 * porque el suelo del rig (RIG_FLOOR_FORESHORTEN) está más escorzado que la pista.
 */
export const RIG_STANCE = {
  pelvisY: 0.45, pelvisDip: 0.035, pitch: 0.42, pitchRun: 0.62, pitchSprint: 0.78,
  feetHalf: 0.085, strideOut: 0.11, strideFore: 0.09, strideLift: 0.035,
  strideHz: [0.8, 1.5], sprintHz: [1.2, 2.1],
  stickLen: 0.6, stickRest: 0.4, reach: 0.7, depthReach: 2.6, grip: 0.36,
  goaliePelvisY: 0.41, goaliePitch: 0.32,
} as const

/** Diámetro visual de la bola en metros (exagerado: la real mide 7 cm y no se vería). */
export const BALL_VISUAL_DIAMETER_M = 0.48

/** Altura de la valla, en metros (SPEC §1). */
export const BOARD_HEIGHT_M = 1.0

// Vallas (WP-41)

/**
 * `NEAR_CUT` elige cómo no tapar la bola con la valla cercana (SPEC §3):
 * - `edge`: rodapié, banda de publicidad baja y borde superior; el resto es cristal casi invisible.
 * - `ghost`: toda la cara a `ghostAlpha` (variante descartada, se conserva para comparar).
 */
export const NEAR_CUT: 'edge' | 'ghost' = 'edge'

export const BOARDS = {
  /** Segmentos por esquina (≥ 24, SPEC §10). */
  cornerSegs: 28,
  /** Espesor visual de la valla (px mundo); la física sigue usando BOARD_W. */
  thickPx: 7,
  /** Alto del rodapié (m). */
  kickM: 0.2,
  /** Alto del embellecedor opaco del borde superior de la valla cercana (m). */
  capM: 0.1,
  /** Franja de publicidad (m desde el suelo): lejana alta, cercana baja para no tapar la bola. */
  adFar: { z0: 0.2, z1: 0.88 },
  adNear: { z0: 0.2, z1: 0.52 },
  /** Anchura de un panel de publicidad (m). */
  adWidthM: 3,
  /** Opacidad del cristal de la valla cercana (`edge`) y de la cara entera (`ghost`). */
  glassAlpha: 0.1,
  ghostAlpha: 0.35,
  /** Opacidad de la losa superior de la valla cercana. */
  nearTopAlpha: 0.22,
  /** Sombra de la valla en el suelo: anchos (px mundo) de las franjas apiladas y opacidad de cada una. */
  shadowWidths: [3, 7, 12],
  shadowAlpha: 0.13,
  /** Puerta frente al banquillo: ancho y alto (m). */
  doorWidthM: 1.3,
  doorHeightM: 0.94,
  /** Red de protección tras la portería: altura desde el suelo (m), semianchura (m), paso de malla (m). */
  netTopM: 4,
  netHalfWidthM: 4.2,
  netMeshM: 0.5,
  netAlpha: 0.2,
  /** Color base de la pared (se modula por la normal) y del canto superior. */
  wallColor: 0x2f5086,
  topColor: 0xd5e1ee,
} as const

/** Gradas: altura de la primera fila y subida por escalón, en metros; altura del dibujo de un espectador (con brazos; sentado, la cabeza llega ≈ 1,7 m: nunca menor que un jugador). */
export const STANDS = { firstHeightM: 0.42, tierRiseM: 0.53, fanHeightM: 1.9 } as const

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

// ─── Gradas (WP-43) ─────────────────────────────────────────────────────────

/** Gradas (WP-43): geometría del anfiteatro y variedad del público. */
export const STANDS_STYLE = {
  /** Pasillo entre la cara exterior de la valla y la primera fila (m). Deja ver la publicidad de la valla cercana. */
  firstOffsetM: 2.5,
  /** Fondo de cada escalón (m) y nº de escalones. */
  tierDepthM: 0.85,
  tiers: 24,
  /** Separación media entre asientos (m) y ancho relativo del espectador respecto a su alto. */
  seatSpacingM: 0.7,
  fanWidthK: 0.55,
  /** Probabilidad de asiento vacío (crece hacia las filas altas). */
  emptyRate: 0.07,
  emptyRateTop: 0.22,
  /** Probabilidades de ropa: rayas, bufanda de equipo, capucha, brazos en alto. */
  stripeRate: 0.16,
  scarfRate: 0.1,
  hoodRate: 0.14,
  armsUpRate: 0.1,
  /** Salto en gol: amplitud (px) y frecuencia (rad/ms); el último tramo se atenúa (ms). */
  cheerAmp: 5,
  cheerFreq: 0.016,
  cheerFadeMs: 700,
} as const

/** Zona de sancionados junto a la mesa: distancia a la valla exterior, al centro y entre figuras (m). */
export const PENALTY_BOX = { setbackM: 0.7, centerGapM: 1.4, stepM: 1.1 } as const
