import * as Phaser from 'phaser'

export type TeamSide = 'left' | 'right'
export type TeamColor = 'blue' | 'red'
export type Role = 'goalie' | 'defender' | 'wing' | 'pivot'

export type Vector = { x: number, y: number }

export type Player = {
  id: string
  team: TeamColor
  side: TeamSide
  role: Role
  body: Phaser.GameObjects.Image
  shadow: Phaser.GameObjects.Ellipse
  selectionRing: Phaser.GameObjects.Arc
  stick: Phaser.GameObjects.Rectangle
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
  /** Timestamp hasta el que el jugador está expulsado (tarjeta azul). 0 o ausente = activo. */
  suspendedUntil?: number
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
