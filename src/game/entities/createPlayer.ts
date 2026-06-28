import * as Phaser from 'phaser'
import { GOALIE_RADIUS, PLAYER_PUPPET_VISUAL_SCALE, PLAYER_RADIUS } from '../constants'
import { createProceduralPuppetTextures } from '../render/createProceduralPuppetTextures'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'
import { VIEW_Y_SCALE } from '../render/viewTransform'

const FONT = '"Courier New", Courier, monospace'
const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3

// Tints de equipo — se aplican sobre sprites blancos
const BODY_TINT:   Record<TeamColor, number> = { blue: 0x3399ff, red: 0xff3333 }
const HELMET_TINT: Record<TeamColor, number> = { blue: 0x1155cc, red: 0xcc1111 }
const ARM_TINT:    Record<TeamColor, number> = { blue: 0x2277dd, red: 0xdd2222 }
const SKATE_TINT:  Record<TeamColor, number> = { blue: 0xd9efff, red: 0xffe1e1 }

/** Monta un jugador como puppet 2D por piezas tintables y proporciones fijas. */
export function createPlayer(
  scene: Phaser.Scene,
  id: string,
  team: TeamColor,
  side: TeamSide,
  role: Role,
  x: number,
  y: number,
  _color: number,
  controllable: boolean,
): Player {
  createProceduralPuppetTextures(scene)
  const radius = role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  const isGoalie = role === 'goalie'
  const prefix = isGoalie ? 'goalie' : 'field'

  // Sombra en el suelo
  const shadow = scene.add.ellipse(x, y + 10, radius * 2.6, radius * 0.82 * VIEW_Y_SCALE, 0x000000, 0.22)

  // Container: todo el personaje se mueve aquí
  const container = scene.add.container(x, y).setScale(PLAYER_PUPPET_VISUAL_SCALE)

  const leftSkate = scene.add.image(-8, 27, `${prefix}-skate`).setTint(SKATE_TINT[team])
  const rightSkate = scene.add.image(8, 27, `${prefix}-skate`).setTint(SKATE_TINT[team])

  // Torso / cuerpo principal
  const body = scene.add.image(0, isGoalie ? 7 : 8, `${prefix}-body`)
  body.setTint(BODY_TINT[team])

  const leftArm = scene.add.image(-18, isGoalie ? 9 : 10, `${prefix}-arm`).setTint(ARM_TINT[team])
  const rightArm = scene.add.image(18, isGoalie ? 9 : 10, `${prefix}-arm`).setTint(ARM_TINT[team])
  leftArm.setRotation(0.18)
  rightArm.setRotation(-0.18)

  // Casco — crece hacia la cámara y oculta parte alta del torso.
  const head = scene.add.image(0, isGoalie ? -23 : -20, `${prefix}-head`)
  head.setTint(HELMET_TINT[team])

  const stick = scene.add.image(18, 11, 'hockey-stick')
  stick.setOrigin(0.08, 0.5)

  // Z-order: patines y brazos debajo; torso, casco y stick encima.
  container.add([leftSkate, rightSkate, leftArm, rightArm, body, head, stick])

  // Anillo de selección — fuera del container
  const selectionRing = scene.add.circle(x, y, radius + 7)
  selectionRing.setStrokeStyle(3, 0xffffff, 1)
  selectionRing.setFillStyle(0, 0)
  selectionRing.setScale(1, VIEW_Y_SCALE)
  selectionRing.setVisible(false)

  const staminaBar = controllable
    ? scene.add.rectangle(x - STAMINA_BAR_W / 2, y + radius + 10, STAMINA_BAR_W, STAMINA_BAR_H, 0x4da3ff)
        .setOrigin(0, 0.5)
    : null

  const labelY = isGoalie ? -64 : -58
  const label = scene.add.text(x, y + labelY, getRoleShort(role), {
    fontFamily: FONT,
    fontSize: '11px',
    color: '#d0e8ff',
    stroke: '#06101a',
    strokeThickness: 3,
  }).setOrigin(0.5)

  return {
    id, team, side, role,
    container, body, head, leftArm, rightArm, leftSkate, rightSkate,
    shadow, selectionRing, stick, label, staminaBar,
    pos: { x, y },
    velocity: { x: 0, y: 0 },
    facing: { x: side === 'left' ? 1 : -1, y: 0 },
    home: { x, y },
    controllable,
    possessionCooldownUntil: 0,
    goalieCatchTime: 0,
    ignoreBallUntil: 0,
    goalieRecoverUntil: 0,
    stamina: 100,
    sprinting: false,
    ballProtectionUntil: 0,
  }
}
