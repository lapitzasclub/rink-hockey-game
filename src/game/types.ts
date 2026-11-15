import * as Phaser from 'phaser'

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
  container: Phaser.GameObjects.Container
  body: Phaser.GameObjects.Image
  head: Phaser.GameObjects.Image
  leftArm: Phaser.GameObjects.Image
  rightArm: Phaser.GameObjects.Image
  leftLeg: Phaser.GameObjects.Image
  rightLeg: Phaser.GameObjects.Image
  leftSkate: Phaser.GameObjects.Image
  rightSkate: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Ellipse
  selectionRing: Phaser.GameObjects.Arc
  stick: Phaser.GameObjects.Image
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
  stickSwingUntil?: number
  /** Angulo del stick en coordenadas mundo; el render puede usar otro por perspectiva. */
  stickWorldAngle?: number
  /** Timestamp hasta el que el jugador está expulsado (tarjeta azul). 0 o ausente = activo. */
  suspendedUntil?: number
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
}

export type ActiveFoulRestart = {
  takerPlayerId: string
  x: number
  y: number
  readyAt: number
  sanction: 'free-hit' | 'direct-free-hit' | 'penalty'
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
