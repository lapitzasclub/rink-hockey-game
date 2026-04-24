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
}
