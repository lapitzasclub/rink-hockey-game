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
  body: Phaser.GameObjects.Arc
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
