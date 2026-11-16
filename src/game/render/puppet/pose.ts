/**
 * Contrato de pose del rig de figuras (WP-30). Lo escriben, por capas,
 * `locomotion` (WP-31), `upperBody` y `actions` (WP-32) y `goaliePose`
 * (WP-33); el rig lo lee en `PuppetRig.apply` y no guarda estado propio.
 *
 * Marco del cuerpo, en unidades de figura (altura de pie = 1):
 * - x = derecha del jugador, y = arriba (suelo en 0), z = hacia donde mira.
 * - El origen está en el suelo, bajo el centro de los pies en reposo.
 * - Índice de lado 0 = izquierda del jugador, 1 = derecha (pies, manos, polos).
 * - Ángulos en radianes. Los giros del marco del cuerpo (pies, pala, cabeza,
 *   twist) son > 0 hacia la derecha del jugador (+z hacia +x).
 * - `PuppetPose.yaw` es la vista en mundo (0 = a cámara, π/2 = a la derecha de
 *   pantalla) y crece hacia la izquierda del jugador: un giro local +a se ve
 *   en la vista `yaw − a`.
 *
 * La vista la pone el orquestador (`yaw`). Las capas solo describen el cuerpo
 * y pueden leer `PoseContext`. Para colocar algo sobre un punto de mundo
 * (la pala sobre la bola), `PoseContext.ball` ya llega en este marco.
 */
import type { Player } from '../../types'
import { v3, type V3 } from './vec'

export type Side = 0 | 1
export type FigureKind = 'skater' | 'goalie' | 'official'
export type ActionType = NonNullable<Player['anim']>['type']

export interface FootPose {
  /** Punto de apoyo en el suelo bajo el tobillo; `y` > 0 = patín levantado. */
  x: number; y: number; z: number
  /** Dirección del patín respecto al cuerpo (0 = adelante; > 0 = punta a la derecha del jugador). */
  yaw: number
  /** Cabeceo del patín: > 0 = punta abajo (freno frontal apoyado). */
  pitch: number
}

export interface StickPose {
  visible: boolean
  /** Extremo del mango (pomo), donde va la mano superior. */
  top: V3
  /** Talón de la pala; para conducir va en el suelo (y ≈ 0). El rig no impone la longitud del stick. */
  heel: V3
  /** Dirección de la pala desde el talón, en el plano del suelo (mismo convenio que `FootPose.yaw`). */
  bladeYaw: number
  /** Mano que agarra el pomo. */
  topHand: Side
  /** Fracción del mango (0 = pomo, 1 = talón) de la otra mano; null = esa mano va libre a `hands[i]`. */
  lowerGrip: number | null
}

export interface PuppetPose {
  /** Vista: 0 = mira a cámara, π/2 = a la derecha de pantalla, π = de espaldas. */
  yaw: number
  /** Raíz: centro de caderas. Bajarla flexiona las rodillas por IK. */
  pelvis: V3
  /** Tronco desde la pelvis: pitch > 0 adelante, roll > 0 hacia la derecha, twist > 0 hombros hacia la derecha. */
  trunk: { pitch: number; roll: number; twist: number }
  /** Giro de la cabeza respecto al cuerpo (mirada); cambia la textura de cabeza que se usa. */
  headYaw: number
  feet: [FootPose, FootPose]
  /** Objetivos IK de mano para las manos que no agarran el stick. */
  hands: [V3, V3]
  /** Polos IK (dirección hacia la que se dobla la articulación). */
  kneePole: [V3, V3]
  elbowPole: [V3, V3]
  stick: StickPose
  /** Escala de la cabeza (1 = reglamento; los cabezones del arcade la suben). */
  headScale: number
}

/** Datos de entrada de las capas de pose: lectura del estado del jugador, sin tocar la física. */
export interface PoseContext {
  player: Player
  kind: FigureKind
  time: number
  /** ms desde el último frame (0 en el lab: pose determinista). */
  dt: number
  /** Velocidad en el marco del cuerpo (px de mundo/s): adelante y a la derecha. */
  velForward: number
  velRight: number
  speedRatio: number
  sprinting: boolean
  /** Fase (rad) y amplitud 0..1 del ciclo de zancada; las gestiona `locomotion`. */
  phase: number
  blend: number
  carrying: boolean
  /** Bola proyectada al suelo del marco del cuerpo (y = 0). */
  ball: V3
  /** Acción del patinador (de `player.anim`); con ella, `swing` es su progreso 0..1. */
  action: ActionType | null
  /** Punta del stick de mundo (`getStickTip`) en el marco del cuerpo; solo se rellena durante el robo. */
  stickTip: V3
  /** Progreso 0..1 del golpe de stick en curso; < 0 si no hay golpe. */
  swing: number
  /** Lado del stick del jugador (SPEC §5 `hand`): 1 = pala a la derecha. */
  stickSide: Side
}

const foot = (): FootPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 })

export function createPose(): PuppetPose {
  return {
    yaw: 0,
    pelvis: v3(0, 0.45, 0),
    trunk: { pitch: 0, roll: 0, twist: 0 },
    headYaw: 0,
    feet: [foot(), foot()],
    hands: [v3(), v3()],
    kneePole: [v3(), v3()],
    elbowPole: [v3(), v3()],
    stick: { visible: false, top: v3(), heel: v3(), bladeYaw: 0, topHand: 0, lowerGrip: null },
    headScale: 1,
  }
}

/** Deja la pose en neutro (de pie, polos por defecto, sin stick) conservando `yaw` y `headScale`. */
export function resetPose(p: PuppetPose) {
  p.trunk.pitch = 0; p.trunk.roll = 0; p.trunk.twist = 0
  p.headYaw = 0
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1
    const f = p.feet[i]
    f.x = s * 0.09; f.y = 0; f.z = 0; f.yaw = s * 0.15; f.pitch = 0
    const kp = p.kneePole[i]
    kp.x = s * 0.15; kp.y = 0; kp.z = 1
    const ep = p.elbowPole[i]
    ep.x = s; ep.y = -0.3; ep.z = -0.5
  }
  p.stick.visible = false
  p.stick.lowerGrip = null
}
