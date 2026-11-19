import * as Phaser from 'phaser'
import type { PuppetPose } from './render/puppet/pose'
import type { PuppetRig } from './render/puppet/rig'

export type TeamSide = 'left' | 'right'
export type TeamColor = 'blue' | 'red'
/** arcade: reglas relajadas, turbo, cargas, powerups y cámara dinámica. classic: reglamento. */
export type GameMode = 'arcade' | 'classic'
export type PowerupKind = 'fire' | 'turbo' | 'freeze' | 'magnet' | 'wall'
export type Role = 'goalie' | 'defender' | 'wing' | 'pivot'

export type Vector = { x: number, y: number }

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
  /** Dorsal y nombre sobre la barra de stamina; solo los controlables. */
  nameTag?: Phaser.GameObjects.Text | null
  stickSwingUntil?: number
  anim?: { type: 'pass' | 'shot' | 'turbo' | 'steal' | 'receive' | 'check' | 'celebrate' | 'save'; at: number; save?: 'split' | 'glove' | 'stick' | 'body'; side?: 1 | -1 }
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
