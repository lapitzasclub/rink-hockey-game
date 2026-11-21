/**
 * Medidas y colores del equipamiento de cerca del patinador (E-18): patín quad
 * con ruedas que giran, rodilleras, espinilleras y guantes. Unidades de figura
 * (de pie = 1) salvo los colores; los colores de equipo los pone el tinte del rig.
 */
import { RIG_GEAR, RIG_PROPORTIONS } from '../artSpec'

/** Patín quad: dos ejes de dos ruedas bajo una placa, bota alta y freno delantero (taco). */
export const SKATE = {
  /** Radio de rueda (cabe con la placa en `RIG_PROPORTIONS.skate`). */
  wheelR: RIG_PROPORTIONS.skate * 0.38,
  /** Medio ancho de la banda de rodadura y separación lateral de las ruedas de un eje. */
  wheelHalfW: 0.0145,
  wheelX: 0.026,
  /** Ejes trasero y delantero a lo largo del pie (z = punta). */
  axleZ: [-0.03, 0.065] as readonly number[],
  /** Fases de giro horneadas en media vuelta (la marca de la rueda es simétrica a π). */
  spinFrames: 4,
  /**
   * Velocidad angular (rad/s) a partir de la que la rueda se pinta corrida: por encima,
   * la marca saltaría más de media fase por fotograma y se leería girando al revés.
   */
  blurRate: 55,
  /** Desfase del giro del pie derecho respecto al izquierdo (rad): los dos patines no van al unísono. */
  footPhase: 0.37,
  colors: {
    wheel: RIG_GEAR.wheel,
    /** Banda de rodadura, algo más oscura que la cara. */
    tread: 0xd8cdb0,
    /** Marca de la cara que gira y cubo con rodamiento. */
    mark: 0x7d6f58,
    hub: 0x8f98a2,
    truck: 0x6c757f,
    boot: RIG_GEAR.boot,
    /** Ribete de la suela entre bota y placa, cordones y brillo de la piel. */
    welt: 0xd9d4c8,
    lace: 0xc3c9d1,
    gloss: 0x5a606c,
    toeStop: RIG_GEAR.toeStop,
    toeFace: 0x8f6c42,
  },
} as const

/** Rodillera de concha dura con cinchas (pintada con su color, sin tinte). */
export const KNEE_PAD = {
  rx: 0.055, ry: 0.062,
  /** Cuánto avanza la concha hacia la punta de la rodilla vista de lado. */
  shift: 0.016,
  /** Medio ancho de la pierna a la altura de la rodilla (cinchas). */
  legHalf: 0.05,
  colors: { shell: RIG_GEAR.kneePad, cap: 0x3b404a, strap: 0x121418, shine: 0x6a717e },
} as const

/** Espinillera bajo la media: abombada por delante, gemelo por detrás (blanca y teñida con la media). */
export const SHIN_GUARD = {
  /** Radios en rodilla y tobillo (antes del engorde `limb`). */
  ra: 0.036, rb: 0.03,
  /** Abombado de la espinillera y del gemelo (máximo, en unidades de figura). */
  guard: 0.007, calf: 0.008,
} as const

/** Guante de jugador: manopla acolchada con dedos en rollos y puño de manguito (blanco y teñido). */
export const GLOVE = {
  /** Puño: medio ancho hacia el codo y en la muñeca, y su largo. */
  cuffOut: 0.05, cuffIn: 0.042, cuffLen: 0.05,
  /** Mano: centro a lo largo del antebrazo y semiejes. */
  handY: 0.022, handRx: 0.044, handRy: 0.04,
  thumbR: 0.018,
  /** Por debajo de esta fracción de su largo nominal, el antebrazo se ve de punta y el guante conserva su giro. */
  alignMin: 0.35,
} as const

/** Pliegues de la camiseta: inclinación del tronco (rad) a la que entra cada nivel, con histéresis. */
export const JERSEY_FOLD = { levels: [0.44, 0.66] as readonly number[], hysteresis: 0.03 } as const
