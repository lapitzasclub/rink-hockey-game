import { GAME_HEIGHT, K, RINK, RINK_LENGTH_M, RINK_WIDTH_M } from '../constants'

/**
 * Constantes visuales del mundo (SPEC §1–§3): escala, exageraciones, cámara
 * y bandas de profundidad. Las de gameplay siguen en `constants.ts`.
 */

/** Metros reales de la pista que representa `RINK` (40 × 20 m por defecto; ver `RINK_LENGTH_M` en constants). */
export const RINK_METERS = { length: RINK_LENGTH_M, width: RINK_WIDTH_M } as const

/** px de mundo por metro en altura (z). Coincide con el eje X; crece con K al acortar la pista. */
export const PX_PER_M = 28.5 * K

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
 * Inclinación de perspectiva de lo que tiene altura (WP-70): portería, vallas,
 * puertas, publicidad y redes de protección. La cámara lateral ve casi de canto
 * los planos que miran hacia los fondos; para abrirlos, un punto a altura z se
 * desplaza en x de pantalla hacia fuera `k·(wx − CX)` px por px de altura en
 * pantalla (ver `projectLeaned`). `atGoalLine` es ese factor en la línea de
 * gol (la inclinación con que WP-67 abrió la boca). Lo que toca el suelo no se mueve.
 */
export const LEAN = {
  atGoalLine: 0.45,
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

// Stick y acciones (WP-32)

/**
 * Agarre y conducción (SPEC §7), en unidades de figura y rad.
 * `gripGap`: separación de manos a lo largo del mango (≈ 35 cm).
 * `maxBladeY`: tope de altura de la pala en golpes (hombro ≈ 0,7: regla del stick alto).
 * `dribbleSway`/`dribbleRock`: vaivén lateral (en pantalla) y giro de la pala al conducir;
 * el vaivén no supera el radio visual de la bola, así que la pala no la suelta nunca.
 * `dribbleHz`: toques por segundo parado (en marcha van con la zancada).
 * `reachLean`/`reachArms`: cuánto se inclina el tronco y adelantan las manos por unidad de
 * alcance de más; `maxReach` es solo un tope de seguridad (la bola manda).
 * `ballHug`/`ballHugSide`: la pala abraza la bola por su borde (radio visual ≈ 0,14): por
 * detrás si la bola va de lado en pantalla, por el lado del stick si va en profundidad (de
 * frente la bola la taparía); así se ve en toda vista. De espaldas (`backOut`, `backDrop`)
 * las manos bajan y se abren al lado del stick y el tronco se ladea `backRoll` al contrario,
 * para que mango, pala y bola salgan de la silueta del cuerpo.
 * `maxScreen`: largo máximo del mango en pantalla (× `stickLen`); si la bola cae más lejos,
 * las manos bajan hacia ella por el propio mango y el tronco se inclina `fitLean` por unidad.
 */
export const STICK_HOLD = {
  gripGap: 0.2, maxBladeY: 0.52,
  dribbleSway: 0.07, dribbleRock: 0.35, dribbleHz: 1.6,
  reachLean: 0.18, reachArms: 0.35, maxReach: 4,
  ballHug: 0.05, ballHugSide: 0.1, backOut: 0.12, backDrop: 0.16, backRoll: 0.22,
  maxScreen: 1.2, fitLean: 0.7,
} as const

/**
 * Pala de rink hockey, en unidades de figura: largo visual, semiancho en el talón y en la
 * punta, y flecha de la curva hacia la cara de golpeo (se refleja con la mano). Es el final
 * curvo del mango, de madera: arranca con su ancho, se curva en gancho y se ensancha algo
 * hacia la punta (un cuarto del palo). La pala negra, recta y con codo es la de hielo.
 */
export const STICK_BLADE = { len: 0.15, heelR: 0.016, toeR: 0.027, bow: 0.095 } as const

/**
 * Duración visual de cada acción (ms). La física suelta la bola en el instante 0, así que
 * pase y tiro empiezan ya armados: latigazo hasta el impacto (t ≈ 0,1-0,15, < 60 ms) y
 * el resto del clip es el follow-through, que es lo que se lee.
 */
export const ACTION_CLIP_MS = {
  pass: 200, shot: 360, turbo: 420, steal: 220, receive: 260, check: 340, celebrate: 1800,
} as const

/**
 * Claves de los golpes de stick: `[t, peso, ángulo, altura, radio, twist, pitch]`.
 * Ángulo y twist van hacia el lado del stick (se reflejan con la mano); radio y altura
 * son de la pala respecto a la pelvis; pitch se suma al tronco. Peso 0 = pose base.
 */
export const STICK_CLIPS = {
  pass: [[0, 1, 0.7, 0.04, 0.42, 0.25, 0], [0.15, 1, 0.05, 0, 0.5, 0, 0.06], [0.5, 1, -0.55, 0.07, 0.5, -0.22, 0.05], [0.8, 1, -0.5, 0.06, 0.5, -0.2, 0.04], [1, 0, 0, 0, 0, 0, 0]],
  shot: [[0, 1, 2.1, 0.44, 0.42, 0.55, -0.05], [0.1, 1, 0.05, 0, 0.52, 0, 0.14], [0.42, 1, -1.4, 0.42, 0.45, -0.55, 0.1], [0.78, 1, -1.25, 0.36, 0.45, -0.48, 0.08], [1, 0, 0, 0, 0, 0, 0]],
  turbo: [[0, 1, 2.45, 0.52, 0.42, 0.7, -0.08], [0.1, 1, 0.05, 0, 0.54, 0, 0.2], [0.42, 1, -1.6, 0.52, 0.45, -0.7, 0.14], [0.8, 1, -1.45, 0.46, 0.45, -0.6, 0.12], [1, 0, 0, 0, 0, 0, 0]],
  check: [[0, 0, 0, 0, 0, 0, 0], [0.25, 1, -0.4, 0.03, 0.34, 0.9, 0.34], [0.7, 1, -0.4, 0.03, 0.34, 0.9, 0.34], [1, 0, 0, 0, 0, 0, 0]],
} as const

/** Ataque y relajación (fracción del clip) de robo, recepción y celebración. */
export const ACTION_ENVELOPE = { steal: [0.4, 0.75], receive: [0.22, 0.35], celebrate: [0.1, 0.86] } as const

/**
 * Robo, recepción, carga y celebración (unidades de figura y rad).
 * Robo: estocada a una mano hasta `getStickTip`. Recepción: la pala cede `cushion`.
 * Carga: cadera adelantada `checkLunge`, agachada `checkDip` y ladeada `checkRoll`.
 * Celebración: manos a `handsY` con `pumps` sacudidas de `pump`; el stick, pala arriba. Con
 * `bounce` las rodillas acompañan cada sacudida y el tronco se echa atrás (`celebrateBack`).
 * Variante «puño» (la mitad de jugadores, fija por id): stick en alto a una mano, inclinado
 * `stickTilt` hacia fuera, y el puño libre sube de `fistLow` a `fistHigh` en cada sacudida.
 * Recepción: además del cedido, el tronco se vence `cushionLean` sobre la bola.
 */
export const ACTION_POSE = {
  stealLean: 0.3, stealArms: 0.45, stealOneHand: [0.2, 0.8],
  cushion: 0.1, cushionDip: 0.045, cushionLean: 0.1,
  checkDip: 0.04, checkRoll: 0.2, checkLunge: 0.06,
  handsY: 1.04, handsSide: 0.17, pump: 0.05, pumps: 3, stickUp: 0.44, celebrateLift: 0.02,
  bounce: 0.03, celebrateBack: -0.08, fistLow: 0.74, fistHigh: 1.06, fistSide: 0.2,
  stickHandY: 0.78, stickHandSide: 0.24, stickTilt: 0.32,
} as const

// ─── Portero (WP-33) ───

/**
 * Posturas del portero (SPEC §8), en unidades de figura y rad; se mezclan por `k`
 * (0 = de pie atento, 1 = de rodillas). Los x van hacia el lado de la pierna / mano:
 * `footX` separación de cada pie (`footY` < 0 hunde el patín bajo el pad tumbado),
 * `poleX/Y/Z` hacia dónde dobla la rodilla (de rodillas, abajo y adentro: rodillas juntas en el suelo),
 * `mitt*` es la manopla (mano libre, lado contrario al stick), `hand*` la mano del
 * stick y `heel*` el talón de la pala (cruzada delante, tapando el hueco entre pads).
 */
export const GOALIE_POSTURE = {
  stand: {
    pelvisY: 0.41, pelvisZ: -0.02, pitch: 0.32, footX: 0.075, footY: 0, footZ: 0.02, footYaw: 0.12,
    poleX: 0.15, poleY: 0, poleZ: 1, mittX: 0.26, mittY: 0.5, mittZ: 0.2,
    handX: 0.2, handY: 0.36, handZ: 0.22, heelX: 0.1, heelZ: 0.2,
  },
  kneel: {
    pelvisY: 0.21, pelvisZ: 0, pitch: 0.04, footX: 0.2, footY: -0.04, footZ: -0.26, footYaw: 1.9,
    poleX: -0.5, poleY: -1, poleZ: 0.8, mittX: 0.32, mittY: 0.46, mittZ: 0.2,
    handX: 0.24, handY: 0.28, handZ: 0.22, heelX: 0.16, heelZ: 0.26,
  },
} as const

/**
 * Respiración del portero en espera (E-10): sube la cadera `pelvis` y endereza el tronco
 * `pitch` al inspirar, con la fase de su ciclo de espera; se apaga al desplazarse.
 */
export const GOALIE_BREATH = { pelvis: 0.014, pitch: 0.07 } as const

/**
 * Cuándo se arrodilla (unidades de figura, ms): `kneelOn`/`kneelOff` son la distancia de la
 * bola con histéresis; `fastClose` (u/s) y `fastDist` la «bola que viene rápida» hacia él;
 * `hold` el mínimo que aguanta una postura; `tau` la constante de la transición (ms).
 */
export const GOALIE_VIEW = { kneelOn: 1.7, kneelOff: 2.8, fastClose: 10, fastDist: 7, hold: 400, tau: 90 } as const

/**
 * Desplazamiento lateral: `stepAmp`/`stepLift` pasos cortos de pie, `lean` y `slideLean`
 * ladeo del tronco (de pie / de rodillas), `speedRef` velocidad (px/s) de referencia.
 */
export const GOALIE_MOVE = { stepAmp: 0.05, stepLift: 0.03, lean: 0.09, slideLean: 0.14, speedRef: 90 } as const

/** Duración de la parada (≤ 300 ms, SPEC §8) y ataque/relajación (fracción del clip). */
export const GOALIE_CLIP_MS = { save: 280 } as const
export const GOALIE_ENVELOPE = { save: [0.22, 0.7], concede: [0.15, 0.85] } as const

/**
 * Selección de parada por la bola respecto al portero en el instante de la parada
 * (fracciones del radio de parada): `body` = por debajo de esa distancia, bloqueo con el
 * cuerpo; `wide` = lateral por encima del cual abre el pad; `side` = lateral mínimo para
 * llegar con la manopla (lado libre) o con el stick (lado del stick); el resto, stick al suelo.
 */
export const GOALIE_SAVE_PICK = { body: 0.35, wide: 0.7, side: 0.2 } as const

/**
 * Poses de parada y reacción (unidades de figura y rad). `splitOut` abre el pad hasta `x`;
 * `gloveUp/Out` la manopla; `stickOut` la pala por el suelo; `bodyArms` abre los brazos.
 * `concede*`: cabeza gacha y golpes de stick al suelo (`taps` en el clip).
 */
export const GOALIE_SAVE_POSE = {
  splitOut: 0.46, splitDrop: 0.1, splitShift: 0.1, splitRoll: 0.32,
  gloveUp: 0.86, gloveOut: 0.34, gloveRoll: 0.16,
  stickOut: 0.46, stickLean: 0.22,
  bodyDrop: 0.07, bodyArms: 0.34, bodyLunge: 0.06,
  concedePitch: 0.36, concedeTaps: 3, concedeLift: 0.13,
} as const

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

/**
 * Histéresis del orden de pintado de las piezas (unidades de altura de figura):
 * dos piezas solo se reordenan si una pasa a la otra por más de esto. Sin ella,
 * brazo y muslo casi empatados se turnaban delante y detrás en cada fotograma.
 */
export const RIG_SORT_HYSTERESIS = 0.015

/** Equipamiento sin color de equipo. */
export const RIG_GEAR = {
  boot: 0x24272e,
  plate: 0x9aa4ae,
  wheel: 0xeee6cf,
  toeStop: 0xd2a86e,
  kneePad: 0x22252b,
  shaft: 0xcf9a5c,
  /** Madera algo más oscura que el mango: palo y pala son una pieza. */
  blade: 0xc08a50,
  pad: 0xf2eee5,
  cage: 0xc3cad2,
  shoe: 0x15171b,
  /** Casco homologado de jugador: gorro acolchado negro con costuras y pantalla transparente. */
  softCap: 0x1d2027,
  capSeam: 0x3a3f49,
  visor: 0xdcefff,
  visorAlpha: 0.2,
  visorEdge: 0xe8f2fb,
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

// Locomoción (WP-31)

/**
 * Patinaje quad (SPEC §6), en unidades de figura, rad, ms y ciclos/s (un ciclo =
 * una zancada de cada pie). `knee`: flexión de rodilla con el pie bajo la cadera
 * (las piernas del estilo A son cortas: por debajo de ~0,8 rad el empuje no llega).
 * Zancada por pie: `push` (sale lateral-atrás a `out`/`back`, ≈ 45°, y aguanta la
 * extensión `extHold`), `rec` (recogida rozando el suelo) y deslizamiento el resto;
 * en crucero el empuje ocupa `cruiseDuty` y quedan fases con los dos patines paralelos.
 * `acc`, `brake`, `turn`, `lateral`, `backFwd`: umbrales [inicio, pleno] de cada paso.
 * `backC.kneeIn`: cuánto entra la rodilla del patín que corta la «C» hacia atrás (con la punta cerrada).
 * `skid`: derrape de frenada fuerte (E-11) si la aceleración baja de `acc` (× PLAYER_ACCEL)
 * a más de `speed` px/s: el cuerpo entero gira `turn` rad hacia el lado del stick (patines
 * atravesados a la marcha), pies desplazados `feetOut` hacia la marcha y cadera `hip` al
 * contrario, rodillas hondas y ladeo `roll` contra la marcha; los hombros vuelven `twist`.
 * `lean` (E-11): tronco adelante `acc` rad a `accMax` de aceleración; al girar, ladeo hacia
 * dentro de `turn` rad con la aceleración lateral `turnRef` (× PLAYER_ACCEL) y la cadera
 * `turnShift` hacia el centro (los cruces ya traen su propio ladeo).
 * `idleK`: respiración (cadera arriba y pecho erguido al inspirar, ciclo de `hz.idle`).
 */
export const RIG_LOCO = {
  knee: { idle: 0.85, glide: 1.05, drive: 1.15, sprint: 1.25, back: 1.2, brake: 1.3 },
  pitch: { idle: 0.36, glide: 0.5, drive: 0.6, sprint: 0.76, back: 0.3, brake: -0.04 },
  pelvisZ: -0.02, feetHalf: 0.085, feetIdle: 0.11, restYaw: 0.1, kneeOut: 0.15, reach: 0.985,
  push: 0.46, rec: 0.26, extHold: 0.25, cruiseDuty: 0.5,
  out: 0.17, back: 0.1, fore: 0.02, lift: 0.045, pushYaw: 0.75, recPitch: 0.12,
  cruiseAmp: 0.8, sprintAmp: 1.2, shift: 0.035, roll: 0.09, twist: 0.07, bob: 0.012,
  hand: { x: 0.16, y: 0.06, z: 0.12, swing: 0.12 },
  hz: { idle: 0.3, cruise: 0.8, drive: 1.4, sprintCruise: 1.4, sprint: 2.2 },
  tau: { blend: 160, acc: 140, turn: 160, weight: 150 },
  initAccel: 0.6, idleBlend: 0.25, turnMinSpeed: 40,
  acc: [0.05, 0.6], brake: [0.35, 0.85], turn: [1.2, 2.6], turnSpeed: [0.25, 0.6],
  lateral: [0.6, 0.88], backFwd: [-0.2, -0.6],
  cross: { over: 0.3, under: 0.09, fore: 0.08, rear: 0.05, lift: 0.06, yaw: 0.35, lean: 0.4, shift: 0.08, twist: 0.15 },
  backC: { stroke: 0.5, out: 0.24, fore: 0.2, z: -0.06, toeIn: 0.95, lift: 0.014, shift: 0.05, roll: 0.15, kneeIn: 0.5 },
  brakeK: { pelvisZ: -0.08, wedgeHalf: 0.17, wedgeZ: 0.06, toeIn: 0.7, kneeIn: 0.25, frontZ: 0.06, tZ: -0.15, tTwist: 0.3, tRoll: 0.1 },
  skid: {
    acc: -1.9, speed: 300, turn: 1.2, knee: 1.42, pitch: 0.26, roll: 0.3, hip: 0.07,
    feetHalf: 0.1, feetOut: 0.08, stagger: 0.05, pole: 0.35, twist: 0.3,
  },
  lean: { acc: 0.24, accMax: 1.6, turn: 0.3, turnRef: 1.1, turnShift: 0.05 },
  idleK: { breath: 0.016, pitchBreath: 0.085, sway: 0.014, roll: 0.03, yaw: 0.22 },
} as const

/**
 * Caída por carga (SPEC §6): fotogramas clave por progreso `t` del aturdimiento
 * (ARCADE_CHECK_STUN_MS); los extremos son la postura de patinar. Se levanta en
 * los últimos ~600 ms. `py`/`pz` cadera, `roll` hacia el lado del golpe,
 * `fx`/`fz` pies (semiancho y adelanto), `fy` pie levantado, `kneeY` polo de rodilla hacia arriba;
 * `hx`/`hy`/`hz` mano libre respecto a la cadera (brazos abiertos al golpe, apoyo atrás en el
 * suelo y manos a las rodillas al levantarse). La mano del pomo sigue con el stick.
 */
export const RIG_FALL_KEYS = [
  { t: 0.1, py: 0.32, pz: -0.06, pitch: -0.25, roll: 0.35, fx: 0.12, fz: 0.12, fy: 0.08, kneeY: 0.3, hx: 0.27, hy: 0.3, hz: 0.06 },
  { t: 0.2, py: 0.13, pz: -0.1, pitch: -0.75, roll: 0.25, fx: 0.12, fz: 0.26, fy: 0.06, kneeY: 1, hx: 0.22, hy: -0.07, hz: -0.16 },
  { t: 0.48, py: 0.12, pz: -0.1, pitch: -0.55, roll: 0.1, fx: 0.13, fz: 0.24, fy: 0, kneeY: 1, hx: 0.21, hy: -0.07, hz: -0.14 },
  { t: 0.66, py: 0.22, pz: -0.04, pitch: 0.85, roll: 0, fx: 0.1, fz: 0.06, fy: 0, kneeY: 0.4, hx: 0.11, hy: -0.04, hz: 0.16 },
  { t: 0.84, py: 0.38, pz: -0.03, pitch: 0.7, roll: 0, fx: 0.09, fz: 0.02, fy: 0, kneeY: 0, hx: 0.12, hy: 0.02, hz: 0.17 },
] as const

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
  /** La puerta se abre con alguien a menos de este radio (m) y tarda `doorSwingMs` en abrirse o cerrarse. */
  doorOpenRadiusM: 2.2,
  doorSwingMs: 320,
  /** Red de protección tras la portería: altura desde el suelo (m), semianchura (m), paso de malla (m). */
  netTopM: 4,
  netHalfWidthM: 4.2,
  netMeshM: 0.5,
  netAlpha: 0.2,
  /** Color base de la pared (se modula por la normal) y del canto superior. */
  wallColor: 0x2f5086,
  topColor: 0xd5e1ee,
} as const

/**
 * Banquillos del lado lejano (WP-69, SPEC §9), en metros: los `…U` se miden
 * desde la línea central de la pista (el banco azul a la izquierda, el rojo
 * espejado) y los `…SetbackM` desde la cara exterior de la valla lejana hacia fuera.
 */
export const BENCH = {
  /** Del extremo exterior e interior del banco a la esquina y al centro de la pista (m): su punto medio fija la puerta de la valla (rink/boards.ts). */
  cornerGapM: 5.25,
  centerGapM: 3.75,
  /** Fin de la zona de banquillo (suelo, tarima y pared) desde la esquina (m). */
  areaCornerM: 4,
  /** Tarima: alto (m) y distancia de su borde delantero a la valla (m). */
  platformM: 0.12,
  platformSetbackM: 0.3,
  /** Valla → ancla de los sentados (la pelvis proyectada al suelo) (m). */
  seatSetbackM: 1.75,
  /** Asiento sobre la tarima: alto, fondo y vuelo por delante del ancla (m). */
  seatHeightM: 0.47,
  seatDepthM: 0.42,
  seatAheadM: 0.14,
  /** Respaldo: alto de la tabla baja y de la alta sobre la tarima (m). */
  backrestM: [0.62, 0.98],
  /** Distancia valla → pared del fondo (m) y su altura (m). */
  wallSetbackM: 2.7,
  wallHeightM: 1.7,
  /** Tramos del banco a cada lado de la puerta (m desde el centro). */
  innerU: [3.95, 6.6],
  outerU: [9.0, 12.6],
  /** Delegado (sentado junto a la mesa), suplentes y entrenador de pie junto a la puerta (m). */
  delegateU: 4.4,
  subsU: [5.2, 5.95, 9.5, 10.25, 11.0],
  coachU: 7.05,
  coachSetbackM: 0.85,
  /** Rótulo del equipo en la pared: centro (m desde el centro), ancho y alturas (m). */
  signU: 8.25,
  signW: 2.4,
  signZ: [1.02, 1.5],
  /** Pelvis del sentado sobre el asiento (m): media pelvis. */
  pelvisOverSeatM: 0.1,
  /** Utilería (m desde el centro): bolsa en la tarima, botellas y sticks apoyados en la pared. */
  bagU: 13.0,
  bottlesU: [6.32, 11.55],
  sticksU: [13.25, 13.42, 13.59, 13.76],
  /** Dorsales de los suplentes sin partido externo (los que no llevan los de pista). */
  subNumbers: { blue: ['4', '8', '11', '6', '12'], red: ['3', '6', '9', '10', '12'] },
  colors: {
    floor: 0x07111e, wall: 0x0a1322, platform: 0x1a2434, platformTop: 0x253246, platformEdge: 0x3a4a62,
    seat: 0x2c3648, seatTop: 0x48556b, frame: 0x9aa4b2, frameDark: 0x4d5766, bag: 0x161a22, bottle: 0x58b8f0, bottleCap: 0xf4f4f4,
    shaft: 0xd2ab73, blade: 0xc39257, sign: 0x0b111c, signText: '#ffffff',
    /** Pantalón del cuerpo técnico y polo del delegado si el dorsal del equipo no sirve (igual a la camiseta). */
    trousers: 0x1b1f27, polo: 0xe9ebee,
  },
  /** Mirada: pausa entre cambios de objetivo (ms) y probabilidad de seguir a la bola. */
  lookMs: [700, 2600],
  lookBall: 0.8,
  /** Reacciones (ms): celebrar y lamentar un gol, protestar una falta y señalar del entrenador. */
  cheerMs: 4200,
  sadMs: 3400,
  protestMs: 2400,
  pointMs: 1400,
  /** Cada cuánto da instrucciones el entrenador en juego (ms, mín. y máx.). */
  coachEveryMs: [6500, 12500],
  /** Saltos al celebrar: altura (unidades de figura), ciclo (ms) y alternancia de los gestos (ms). */
  hopUnits: 0.035,
  hopMs: 430,
  flipMs: 380,
  /** Retraso máximo entre figuras al reaccionar (ms): no se levantan todos a la vez. */
  staggerMs: 260,
} as const

// ─── Árbitros (WP-50) ───────────────────────────────────────────────────────

/**
 * Árbitros a pie (SPEC §9). Distancias en metros (a px con `WORLD_PX_PER_M`),
 * velocidades en m/s y tiempos en ms. Son solo visuales: no colisionan.
 */
export const REFEREES = {
  /** Amarillo flúor del detalle del uniforme y colores de las tarjetas. */
  fluor: 0xd9ff1f,
  /** Camiseta gris (más clara que el pantalón, para separarlos) y pantalón casi negro (WP-69). */
  shirt: 0x4a515d,
  shorts: 0x15171b,
  cardBlue: 0x2f7bff,
  cardRed: 0xe02424,
  /** Velocidad al andar y al correr, y aceleración (m/s y m/s²). */
  walkMps: 1.8,
  runMps: 5.2,
  accelMps2: 4.5,
  /** Vuelta máxima del cuerpo hacia donde mira (rad/s). */
  turnRate: 6,
  /** Distancia a la bola que mantienen al seguirla (m). */
  followMinM: 4,
  followMaxM: 8,
  /** Se apartan a este radio de la bola y de los jugadores (m) y empujan a esta velocidad (m/s). */
  ballAvoidM: 2,
  playerAvoidM: 1.2,
  avoidMps: 3.2,
  /** Distancia al lateral que cubren (m) y banda en la que pueden moverse (mín. y máx. a la valla). */
  laneM: 1.4,
  laneBandM: [0.6, 3.2],
  /** Cuánto cruzan la línea de medio campo (m) y margen a las vallas de fondo (m). */
  overlapM: 3,
  endMarginM: 1.2,
  /** Distancia (m) al error de posición a la que pasan de andar a correr: [0 = andar, 1 = correr]. */
  runErrM: [3, 9],
  /** Longitud de ciclo completo de zancada (m de mundo) al andar y al correr. */
  strideM: [1.2, 2.2],
  /** Amplitud de zancada (unidades de figura), elevación del pie y balanceo de brazos al andar y al correr. */
  stepA: [0.15, 0.27],
  footLift: [0.05, 0.15],
  armSwing: [0.07, 0.17],
  /** Duración de cada gesto (ms). */
  gestureMs: { whistle: 1000, point: 1300, goal: 1300, card: 1500 },
  /** Bully: separación a cada lado del punto (m) y tiempo que se mantienen allí (ms). */
  bullyOffsetM: [1.5, 3.4],
  bullyHoldMs: 3000,
  /** Ángulo de bajada del brazo al señalar un punto del suelo (rad); la dirección va horizontal. */
  pointDown: 0.55,
  /** Tarjeta (unidades de figura) y radio de la sombra de contacto (m). */
  cardSize: [0.05, 0.075],
  shadowRadiusM: 0.4,
} as const

// ─── Gradas y pabellón (WP-43, WP-68) ───────────────────────────────────────

/**
 * Gradas (WP-68): anfiteatro de escalones con huella y contrahuella, asientos de
 * plástico por bloques, pasillos con escalera, vomitorios y peto de cristal.
 * Distancias en m desde la cara exterior de la valla; alturas en m.
 */
export const STANDS = {
  /** Primera fila (frente del primer escalón) y profundidad/subida de cada escalón. */
  firstM: 2,
  tierDepthM: 0.8,
  tierRiseM: 0.42,
  /** Altura de la huella del primer escalón y nº de escalones del anillo. */
  baseM: 0.4,
  tiers: 22,
  /** El fondo (detrás de banquillos y mesa) empieza más atrás y más alto: escalones que se quitan. */
  farCutTiers: 2,
  /** Asiento: paso entre asientos, posición en el escalón, altura del asiento y del respaldo. */
  seatSpacingM: 0.56,
  seatAtM: 0.36,
  seatPanM: 0.42,
  seatBackAtM: 0.62,
  seatBackTopM: 0.8,
  seatHalfM: 0.22,
  /** Pasillos: ancho y posiciones (fracción de cada tramo) en rectas largas, fondos y curvas. */
  aisleM: 1.1,
  aislesLong: [0, 0.2, 0.4, 0.6, 0.8],
  aislesEnd: [0, 0.5],
  aislesCorner: [0, 0.5],
  /** Vomitorios: ancho, alto de la boca y escalones que ocupan [desde, hasta] (índice del anillo). */
  vomitoryM: 2.4,
  vomitoryMouthM: 1.85,
  vomitoryTiers: [2, 5],
  vomitoryFarTiers: [5, 8],
  /** Boca: fracción del ancho, marco/dintel (m), barandilla de las paredes laterales (m) y cartel de salida [ancho, alto] (m). */
  vomitoryMouthK: 0.74,
  vomitoryFrameM: 0.12,
  vomitoryRailM: 0.85,
  exitSignM: [0.62, 0.22],
  /** Tira LED del muro alto del fondo: [desde, hasta] bajo la albardilla (m) y medio alto del halo (m). */
  ledStripZ: [0.1, 0.36],
  ledGlowM: 0.07,
  /** Peto delantero (sobre la huella del primer escalón), cristal y pasamanos. */
  parapetM: 0.55,
  parapetThickM: 0.14,
  glassM: 0.55,
  railM: 0.9,
  /** Bloque animado del público: `bandTiers` filas × hasta `chunkSeats` asientos (cajas pequeñas, poco atlas). */
  bandTiers: 3,
  chunkSeats: 7,
  /** Resolución máxima del horneado de gradas (la textura grande no pasa de 4096 px). */
  maxRes: 2,
  /** El atlas del público va algo por debajo de la obra: figuras pequeñas, mucha superficie. */
  atlasResK: 0.82,
  /** Franjas en que se parte cada curva de la grada cercana para no guardar su caja medio vacía. */
  nearCornerBands: 4,
  /** La grada cercana (de espaldas, en sombra) a la resolución de la obra; si no, a la del público. */
  nearFullRes: false,
} as const

/** Paleta del pabellón: neutra, más oscura y apagada que la pista (la pista manda). */
export const STANDS_COLORS = {
  /** Suelo del pabellón: gris oscuro con juntas cada `floorJointM` m y luz que se derrama de la pista. */
  floor: 0x2b2e33,
  floorJointM: 2,
  floorJoint: 'rgba(0,0,0,0.22)',
  floorGrain: ['rgba(255,255,255,0.035)', 'rgba(0,0,0,0.08)'],
  floorSpill: 'rgba(150,175,205,0.045)',
  backWall: 0x0a0d13,
  tread: 0x3d4148,
  riser: 0x23262c,
  nosing: 0x8c7a3c,
  parapet: 0x262a31,
  coping: 0x5a606a,
  glass: 'rgba(185,215,240,0.13)',
  glassEdge: 'rgba(215,235,250,0.38)',
  rail: 0x8d96a3,
  tunnel: 0x07090e,
  /** Luz tenue del pasillo al fondo del túnel. */
  tunnelGlow: 0x1b222d,
  exitSign: 0x3fae6a,
  exitGlow: 'rgba(80,190,120,0.12)',
  /** Tira LED del fondo: panel, línea encendida y halo (fríos y apagados: no compiten con la pista). */
  ledPanel: 0x0c121b,
  ledLine: 'rgba(120,180,225,0.62)',
  ledGlow: 'rgba(110,170,220,0.14)',
  /** Asientos por bloque (se alternan) y del graderío de cada peña. */
  seats: [0x2a3b5c, 0x2a3b5c, 0x454b56],
  /** Luz por fila: delante → fondo; la grada cercana va algo más en penumbra (espaldas). */
  lightFront: 0.82,
  lightBack: 0.46,
  lightNear: 0.66,
  /** Mezcla con gris de la ropa (0 = tal cual, 1 = gris). */
  desat: 0.45,
} as const

/** Público (WP-68): bustos estilo A, peñas en los fondos, asientos vacíos y reacción al gol. */
export const CROWD = {
  /** Peña de cada fondo (azul a la izquierda en el laboratorio). */
  penaLeft: 'blue',
  penaRight: 'red',
  /** Filas (índice del anillo) que ocupa cada peña. */
  penaTiers: 10,
  /** Asientos vacíos: delante → fondo. */
  emptyFront: 0.1,
  emptyBack: 0.2,
  /** Peña: vacíos y probabilidad de vestir de su color o con bufanda. */
  penaEmpty: 0.04,
  penaShirt: 0.72,
  penaScarf: 0.45,
  /** Asientos de la peña: color del club oscurecido. */
  penaSeatK: 0.55,
  /** Gorro, bufanda y pelo largo en el público neutro. */
  beanieRate: 0.1,
  scarfRate: 0.08,
  longHairRate: 0.28,
  baldRate: 0.08,
  /** Prenda de arriba (chaqueta, sudadera, deportiva; el resto camiseta) y móvil en la mano. */
  jacketRate: 0.26,
  hoodieRate: 0.2,
  sportRate: 0.14,
  phoneRate: 0.07,
  /** Pantalla del móvil encendida. */
  phoneGlow: 0xa8d8ff,
  /** Trazo del contorno (px de mundo) y alfa: más fino que en los jugadores. */
  outline: 0.75,
  outlineAlpha: 0.75,
  /** Grada cercana: fracción de las filas 0..armsRows−1 que levanta los brazos en el gol. */
  armsRows: 4,
  armsRate: 0.45,
  /** Vaivén: amplitud en reposo (px) + extra con la emoción, y frecuencias (rad/ms). */
  idleAmp: 0.3,
  idleExcite: 1.4,
  idleFreq: 0.004,
  idleFreqExcite: 0.006,
  /** Gol: salto de la peña que marca, del resto y su frecuencia; duración y atenuación (ms). */
  cheerAmpPena: 5,
  cheerAmp: 2.6,
  cheerFreq: 0.016,
  cheerMs: 2600,
  cheerFadeMs: 700,
  /** Calidad baja: solo las peñas se mecen, con esta fracción de amplitud y de ritmo. */
  liteIdleK: 0.7,
  liteFreqK: 0.45,
} as const

/**
 * Banco de sancionados a cada lado de la mesa (WP-69): tramo y asientos en m
 * desde el centro de la pista (el 0 es el más próximo a la mesa) y ancla de los
 * sentados desde la valla exterior. El asiento sigue a `BENCH`.
 */
export const PENALTY_BOX = { u: [1.8, 3.65], seatsU: [2.15, 2.75, 3.35], seatSetbackM: 1.75, corridorM: 0.45 } as const

// ─── Mesa y sancionados (WP-51) ─────────────────────────────────────────────

/**
 * Mesa de oficiales (SPEC §9), centrada tras la valla lejana. Medidas en metros;
 * `setbackM` = de la cara exterior de la valla al borde delantero de la mesa y
 * `figSetbackM` a los pies de los sentados. `figX` = posición de cada figura
 * respecto al centro (auxiliar, cronometrador, anotador); `board` = marcador.
 */
export const TABLE = {
  widthM: 3.2,
  depthM: 0.7,
  heightM: 0.75,
  setbackM: 1.0,
  figSetbackM: 1.85,
  figX: [-1.1, -0.35, 0.4],
  /** Marcador LED sobre la mesa: centro en X, ancho, alto y patas (m). */
  board: { x: 1.12, widthM: 0.66, heightM: 0.32, standM: 0.04 },
  /** Portátil del cronometrador (tapa vista por detrás) y papeles del anotador: centro en X y medidas (m). */
  laptop: { x: -0.35, widthM: 0.4, heightM: 0.26 },
  papers: { x: 0.42, widthM: 0.44, depthM: 0.3 },
  /** Logotipo del faldón: texto sin partido externo y ancho máximo (m). */
  logo: { text: 'LIGA RINK', widthM: 1.6 },
  /** Semiancho de la zona trasera (suelo y pared) que cubre mesa y bancos de sancionados. */
  zoneHalfM: 3.75,
  wallSetbackM: 2.7,
  wallHeightM: 1.7,
  colors: {
    floor: 0x07111e, wall: 0x030810, top: 0xcdb58a, topEdge: 0x8f7a55, skirt: 0x1d2c4a, skirtBand: 0xf2c230,
    side: 0x142038, board: 0x0b0f14, boardLit: 0xffb347, stool: 0x1a2438, stoolEdge: 0x33415a,
    laptop: 0xb7bec7, laptopEdge: 0x6f7883, laptopLogo: 0xe9edf2, paper: 0xf3efe4, paperLine: 0x8d96a1,
    logoText: '#f2c230', clockText: '#ffb347', scoreText: '#ffffff',
  },
  /** Kit de los oficiales de mesa: prenda oscura y calzado de calle. */
  official: { jersey: 0x2b313b, shorts: 0x1c2027, trim: 0xf2c230 },
  /** Reacciones de mesa (ms): señalar la falta, apuntar en el acta y tocar el crono. */
  pointMs: 1700,
  writeMs: 3000,
  clockMs: 1200,
} as const

// ─── Portería (WP-40) ───────────────────────────────────────────────────────

/**
 * Aspecto de la portería (SPEC §10). La boca (ancho) y el fondo salen de
 * `GOAL_HALF_H` y `GOAL_BACK_DEPTH` (gameplay); aquí solo lo que es visual.
 * Frente naranja fluorescente, estructura trasera y red blancas (REGLAMENTO §4).
 */
export const GOAL_VIS = {
  /** Alto interior de la boca en metros (1,05 m). */
  heightM: 1.05,
  /** Grosor del tubo en px de pantalla a s = 1 (real Ø 7,5 cm ≈ 2 px; se exagera). */
  tubePx: 3.4,
  /** Contorno oscuro del tubo a cada lado (px). */
  outlinePx: 0.8,
  /** Tubo del arco trasero, relativo al delantero. */
  rearTubeScale: 0.62,
  /** Barras laterales y arco superior traseros, relativos al tubo trasero. */
  rearBarScale: 0.55,
  /** Chaflán de las esquinas superiores a 45° (m). */
  bevelM: 0.16,
  /** Estructura superior trasera: fondo junto a los postes y en el centro (0,40 y 0,65 m). */
  topSideM: 0.4,
  topCenterM: 0.65,
  /** Caída de la red: barriga del fondo hacia fuera y del techo hacia abajo (m). */
  backSagM: 0.07,
  topSagM: 0.06,
  /** Segmentos del arco trasero (= columnas de malla). */
  arcSegments: 16,
  /** Bandas de malla de la red de fondo y del techo. */
  backRings: 6,
  topRings: 3,
  /** Grosor de la malla a s = 1 (px). */
  meshPx: 0.75,
  /** Sombra en el suelo: arrastre hacia el fondo y hacia la cámara (px a s = 1). */
  shadowBackPx: 7,
  shadowDownPx: 5,
  /** Sombra de contacto al pie de cada poste: ancho y alto relativos al tubo, alpha. */
  footShadowW: 2,
  footShadowH: 0.8,
  footShadowAlpha: 0.35,
  /** Separación de depth entre capas de la portería y lo que va delante. */
  depthEps: 0.002,
  /** Zona «delante de la boca» (px de mundo): margen lateral sobre la boca y alcance hacia el campo. */
  frontBandPx: 12,
  frontReachPx: 60,
  colors: {
    tube: 0xff6a00,
    tubeEdge: 0x6e2400,
    tubeDark: 0xc44300,
    tubeShine: 0xffd2a8,
    rear: 0xf4f6fa,
    rearEdge: 0x55657c,
    rearDark: 0xb9c4d4,
    rearShine: 0xffffff,
    net: 0xffffff,
    netFill: 0xdfe8f4,
    netShade: 0xc8d6e8,
    floor: 0x0a1828,
    shadow: 0x000000,
    flash: 0xffffff,
  },
  alpha: { backFillLow: 0.3, backFillHigh: 0.16, sideFill: 0.14, topFill: 0.3, mesh: 0.42, meshTop: 0.5, floor: 0.32 },
} as const

// UI sobre jugadores (WP-34)
/** Anillo del jugador controlado (elipse en el suelo) y barra de stamina bajo los pies. */
export const PLAYER_UI = {
  /**
   * Marcador del seleccionado (E-13): aro del color del equipo, vivo para
   * despegarse del suelo azul y sin el blanco de las líneas de la pista, con un
   * perfilado oscuro fino y una punta de flecha que señala hacia dónde mira.
   * Radio exterior (m) y grosores (px de mundo, ~px de pantalla a s = 1).
   */
  ringRadiusM: 0.62,
  ringEdgePx: 1.5,
  ringBandPx: 3,
  ringEdgeColor: 0x06101a,
  ringEdgeAlpha: 0.55,
  ringBandColor: { blue: 0x4de6ff, red: 0xff5a62 },
  ringBandAlpha: 0.95,
  ringFillAlpha: 0.12,
  /** Flecha: largo y ancho (m) y separación por fuera del aro (m). */
  arrowLenM: 0.38,
  arrowWM: 0.5,
  arrowGapM: -0.02,
  /** Supermuestreo de la textura del anillo (px de textura por px de mundo): nítido con el zoom arcade. */
  ringTexScale: 3,
  /** Barra: ancho (m), alto (px a s = 1), separación bajo el anillo (px), fondo y borde. */
  barWM: 0.9,
  barHPx: 4,
  barGapPx: 3,
  barBgColor: 0x06101a,
  barBgAlpha: 0.65,
  barEdgeColor: 0xe8f1fa,
  barEdgeAlpha: 0.8,
  /** Relleno según nivel (alto = cian del TURBO del HUD, medio, bajo) y umbrales. */
  barColors: [0x4de6ff, 0xf5c64f, 0xff4d5c],
  /** Carga de pase (blanca) y de tiro (naranja) en la misma barra; llena, parpadea a `chargeFullColor`. */
  chargeColors: { pass: 0xf2f6fb, shoot: 0xff9a2e },
  chargeFullColor: 0xffe14d,
  /** Etiqueta de dorsal y nombre entre el anillo y la barra: cuerpo (px) y separación sobre la barra (px a s = 1). */
  nameFontPx: 11,
  nameGapPx: 1,
  /** Contorno del texto por hueco: oscuro el propio, rojo el rival para distinguirlo sin leer el dorsal. */
  nameStroke: { blue: '#06101a', red: '#9a1219' },
  /** Fundido de la etiqueta (ms de 0 a 1) y cuánto se queda tras perder la bola, para no parpadear en rebotes y pases rápidos. */
  nameFadeMs: 160,
  nameLingerMs: 900,
  /** Tope de la parada del portero (goalieCatchTime) como «tiene la bola», por si el temporizador quedara colgado. */
  nameCatchMaxMs: 3000,
  barMid: 0.5,
  barLow: 0.25,
} as const

// ─── Luz (WP-61) ────────────────────────────────────────────────────────────

/** Luz de pabellón (SPEC §4/§10): pozos cenitales, viñeteado y sombras de valla y portería. */
export const LIGHT = {
  /** Pozos de luz: posiciones relativas (coinciden con los reflejos del suelo), radio (px) y opacidad aditiva. */
  poolsX: [0.2, 0.5, 0.8],
  poolsY: [0.25, 0.75],
  poolRadius: 150,
  poolSquash: 0.4,
  poolAlpha: 0.075,
  /** Pozo junto a cada portería: distancia a la línea de gol (m, hacia dentro), radio y opacidad. */
  goalPoolOffsetM: 2.2,
  goalPoolRadius: 80,
  goalPoolAlpha: 0.14,
  /** Viñeteado: fracción del radio sin oscurecer, color y opacidad máxima en el borde del pabellón. */
  vignetteInner: 0.5,
  vignetteColor: '3,7,16',
  vignetteAlpha: 0.38,
  /** Sombra de la valla: anchos (px de mundo) de las franjas apiladas y opacidad de cada una (más densa pegada a la valla). */
  boardShadowWidths: [2, 5, 9, 14],
  boardShadowAlpha: 0.14,
  /** Sombra de la portería: capas {crecimiento relativo, desplazamiento y (px), opacidad}. */
  goalShadow: [
    { grow: 0.22, dy: 3, alpha: 0.12 },
    { grow: 0.08, dy: 2, alpha: 0.2 },
  ],
  /** Halo claro tras los tubos y la silueta de la portería (canto claro): grosor extra (px), color y opacidad. */
  goalGlowPx: 3.4,
  goalGlowColor: 0xdff0ff,
  goalGlowAlpha: 0.32,
} as const

// ─── Lanzamientos en tercera persona (docs/setpiece, L-00) ──────────────────

/**
 * Cámara estenopeica detrás del lanzador (`setpiece/view.ts`), en metros y px de
 * pantalla. La cámara es móvil (`setCamera`/`follow`); estos son los valores de
 * seguimiento: `back` m detrás de la bola, a `height` m, mirando al objetivo
 * (centro de la boca), que queda en `aimY` (fracción del alto de pantalla).
 */
export const SETPIECE_CAMERA = {
  /** Detrás de la bola y altura del ojo (m). */
  back: 2.0,
  height: 1.4,
  /** Objetivo por defecto (m): centro de la boca interior de 1,70 × 1,05 m. */
  targetX: 0,
  targetY: 0,
  targetZ: 0.525,
  /** Focal (px de pantalla) y altura en pantalla del punto de mira. */
  focal: 560,
  aimY: 0.36,
  /** Exageración de figura de cerca: 1 = altura real, para que case con la portería de 1,05 m. */
  figureExag: 1,
  /** Lanzador respecto a la bola (m): hacia el lado contrario a su stick y hacia atrás. */
  shooterSide: 0.38,
  shooterBack: 0.45,
  /** Pies del portero delante de la línea de gol (m). */
  goalieFront: 0.22,
  /** Bola real (Ø ≈ 7,3 cm); el partido la exagera (BALL_VISUAL_DIAMETER_M). */
  ballDiameterM: 0.073,
  /** Paso de la malla dibujada (m); la real es de 2,5 cm y daría muaré. */
  netMeshM: 0.1,
  /** Suelo, fondo sobre la valla y valla (prototipo, sin hornear). */
  colors: { floor: 0x1f5fae, floorFar: 0x1a4f92, backdrop: 0x0a1322, board: 0x14243c, boardTop: 0xdfe8f4, kick: 0x0b0f14 },
} as const

/**
 * L-02: cámara de seguimiento del duelo y transición con el partido (`setpiece/scene.ts`).
 * Seguimiento: `back` m detrás del lanzador en la recta desde el centro de la boca,
 * desplazada `side` m al lado contrario de su stick (L-00: si no, tapa un poste), a
 * `height` m; muelle críticamente amortiguado de pulsación `omega` (1/s). Tras el
 * golpeo el ancla va hacia la bola hasta `ballWeight` en `ballBlendS`.
 * Entrada/vuelta: el partido se acerca al punto (`zoom`) mientras se funden las dos
 * cámaras entre `fadeFrom` y `fadeTo` (fracción del tiempo de entrada); después la
 * cámara cercana orbita desde la pose equivalente a la del partido hasta la de seguimiento.
 */
export const SETPIECE_FOLLOW = {
  back: 1.8,
  height: 1.7,
  side: 1.8,
  /** Fracción del ancla a la boca de gol a la que mira; altura del ancla (m). */
  look: 0.6,
  anchorZ: 0.3,
  omega: 7,
  ballWeight: 0.45,
  ballBlendS: 0.35,
  enterMs: 800,
  exitMs: 600,
  fadeFrom: 0.06,
  fadeTo: 0.36,
  zoom: 2.6,
  /** Altura (m) sobre el punto a la que apunta el zoom del partido. */
  zoomLiftM: 0.6,
} as const
