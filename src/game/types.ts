import * as Phaser from 'phaser'
import type { PuppetPose } from './render/puppet/pose'
import type { PuppetRig } from './render/puppet/rig'

export type TeamSide = 'left' | 'right'
export type TeamColor = 'blue' | 'red'
/** arcade: reglas relajadas, turbo, cargas, powerups y cámara dinámica. classic: reglamento. */
export type GameMode = 'arcade' | 'classic'
export type PowerupKind = 'fire' | 'turbo' | 'freeze' | 'magnet' | 'wall' | 'bolt' | 'crazy' | 'shield' | 'mini'
export type Role = 'goalie' | 'defender' | 'wing' | 'pivot'

export type Vector = { x: number, y: number }

/**
 * Gestos de los parones (E-19): `score` el que marca, `mate` sus compañeros, `joy` alegría
 * (portero del que marca y ganadores), `down` cabizbajo (el que encaja y los que pierden),
 * `keeperDown` el portero que encaja, `rest` descanso, `cross` cruce de campo, `greet` saludo del empate.
 */
export type MoodKind = 'score' | 'mate' | 'joy' | 'down' | 'keeperDown' | 'rest' | 'cross' | 'greet'
/** `big` (E-21): peso del gol del autor (0..1); el clip agranda el gesto. */
export type PlayerMood = { kind: MoodKind; style: number; at: number; until: number; hit: number; side: 1 | -1; big?: number }

export type Ball = {
  x: number           // coordenada X mundo — usada por física
  y: number           // coordenada Y mundo — usada por física
  visual: Phaser.GameObjects.Image  // posicionado en worldToScreen(x, y) cada frame
}

export type Player = {
  id: string
  team: TeamColor
  side: TeamSide
  role: Role
  /** Contenedor de la figura (`rig.container`); el arcade lo rota y escala encima del render. */
  container: Phaser.GameObjects.Container
  /** Rig 2D jerárquico (WP-30) y su pose, que reescribe `updateVisuals` cada frame. */
  rig: PuppetRig
  pose: PuppetPose
  /** Mano del stick (SPEC §5): 'R' = pala a la derecha. */
  hand: 'L' | 'R'
  /** Índices en SKIN_TONES y HAIR_COLORS. */
  skin: number
  hair: number
  /** Dorsal. */
  number: string
  shadow: Phaser.GameObjects.Image
  /** Anillo del jugador controlado: textura de anillo (borde y banda del equipo) que visuals.ts aplana con la perspectiva. */
  selectionRing: Phaser.GameObjects.Image
  /** Punta del marcador del seleccionado, hacia donde mira. */
  selectionArrow: Phaser.GameObjects.Image
  label: Phaser.GameObjects.Text
  pos: Vector
  velocity: Vector
  facing: Vector
  home: Vector
  controllable: boolean
  possessionCooldownUntil?: number
  goalieCatchTime?: number
  ignoreBallUntil?: number
  goalieRecoverUntil?: number
  stamina?: number
  sprinting?: boolean
  ballProtectionUntil?: number
  staminaBar?: Phaser.GameObjects.Rectangle | null
  /** Pase o tiro que el humano está cargando; la barra de stamina lo muestra mientras dura. */
  charge?: { kind: 'pass' | 'shoot', level: number }
  /** Carga en curso de la IA: acción, inicio, carga buscada y si pidió turbo. */
  aiCharge?: { action: 'pass' | 'shoot', start: number, target: number, turbo: boolean, aim: Vector | null }
  /** Dorsal y nombre sobre la barra de stamina; solo los controlables. */
  nameTag?: Phaser.GameObjects.Text | null
  stickSwingUntil?: number
  anim?: { type: 'pass' | 'shot' | 'turbo' | 'steal' | 'receive' | 'check' | 'celebrate' | 'save'; at: number; save?: 'split' | 'glove' | 'stick' | 'body'; side?: 1 | -1 }
  /**
   * Gesto de los parones (E-19): lo pone `systems/celebration.ts` en la simulación y la pose
   * lo lee. `at`/`until` en `simNow` (`until` = Infinity: hasta el final), `hit` = llegada al
   * abrazo, choque de manos o saludo (Infinity: aún no), `style` = variante fija por id y
   * `side` = lado (±1, derecha del jugador) del compañero en el choque de manos.
   */
  mood?: PlayerMood
  /** Último choque con otro jugador o con la valla (E-15): impulso recibido en px/s y su `simNow`. Lo lee la animación (E-17). */
  bump?: { x: number, y: number, at: number }
  /** Angulo del stick en coordenadas mundo; el render puede usar otro por perspectiva. */
  stickWorldAngle?: number
  /** Timestamp hasta el que el jugador está expulsado (tarjeta azul). 0 o ausente = activo. */
  suspendedUntil?: number
  /** Camino del sancionado: patina a la puerta (`out`), la cruza hasta su asiento (`exit`), sentado (`seated`) o de vuelta a la pista (`back`). */
  penPhase?: 'out' | 'exit' | 'seated' | 'back'
  penPhaseAt?: number
  /** Asiento en la zona de sancionados y recorrido hecho del camino puerta → asiento (px). */
  penSeat?: number
  penWalk?: number
  // ─── Estado arcade (ausente en modo reglamento) ───
  /** Aturdido por carga o congelado: sin input ni IA hasta este instante. */
  stunUntil?: number
  stunKind?: 'check' | 'freeze'
  /** Multiplicador de velocidad máxima (rubber-banding, powerup turbo). */
  speedMultiplier?: number
  /** Escala del radio de parada del portero (powerup muro). */
  saveRadiusScale?: number
  /** El portero no puede parar ni atrapar la bola hasta este instante (tiro que le supera). */
  saveDisabledUntil?: number
  checkCooldownUntil?: number
  turboUntil?: number
  magnetUntil?: number
  wallUntil?: number
  /** Escudo: ni cargas, ni robos, ni congelados, ni rayos hasta este instante. */
  shieldUntil?: number
  /** Portero encogido por el powerup «portería mini» del rival. */
  miniUntil?: number
  /** Instante en que recibió el último pase de un compañero (remate al primer toque). */
  receivedPassAt?: number
  /** El siguiente tiro sale como bola de fuego (powerup). */
  fireShotReady?: boolean
  onFire?: boolean
}

export type BullyCandidate = {
  bluePlayerId: string
  redPlayerId: string
  x: number
  y: number
}

export type ActiveBully = {
  bluePlayerId: string
  redPlayerId: string
  x: number
  y: number
  releaseAt: number
  /** Pasado este instante se pita aunque alguien no haya llegado a su sitio. */
  deadline: number
}

export type ActiveFoulRestart = {
  takerPlayerId: string
  x: number
  y: number
  /** Se retrasa mientras los jugadores aún van a su sitio (hasta `deadline`). */
  readyAt: number
  deadline: number
  sanction: 'free-hit' | 'direct-free-hit' | 'penalty'
}

/** Saque de centro en preparación: los jugadores patinan a su sitio y el árbitro pita. */
export type ActiveKickoff = {
  team: TeamColor
  takerPlayerId: string
  partnerPlayerId: string | null
  readyAt: number
  deadline: number
  /** Instante del pitido; null mientras se colocan. El que saca juega la bola tras él. */
  whistledAt: number | null
}

export const ROLE = {
  GOALIE: 'goalie',
  DEFENDER: 'defender',
  WING: 'wing',
  PIVOT: 'pivot',
} as const

export const TEAM = {
  BLUE: 'blue',
  RED: 'red',
} as const

export const SIDE = {
  LEFT: 'left',
  RIGHT: 'right',
} as const

export const SANCTION = {
  FREE_HIT: 'free-hit',
  DIRECT_FREE_HIT: 'direct-free-hit',
  PENALTY: 'penalty',
} as const
