import * as Phaser from 'phaser'
import { GOALIE_RADIUS, PLAYER_RADIUS } from '../constants'
import { createProceduralPuppetTextures } from '../render/createProceduralPuppetTextures'
import { playerKit, lookFor } from '../render/puppet/kit'
import { createPose } from '../render/puppet/pose'
import { PuppetRig, createContactShadow } from '../render/puppet/rig'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'

const FONT = '"Russo One", sans-serif'
const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3

/**
 * Monta un jugador con el rig 2D jerárquico (WP-30): kit del equipo, dorsal y
 * variedad (mano, piel, pelo) deterministas por id. Las texturas del rig se
 * pintan una vez por pieza y vista y se comparten entre jugadores.
 */
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
  // La bola y los suplentes siguen usando las texturas procedurales antiguas
  createProceduralPuppetTextures(scene)
  const radius = role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  const kind = role === 'goalie' ? 'goalie' : 'skater'
  const look = lookFor(id, team, role)
  const stickSide = look.hand === 'R' ? 1 : 0

  // Sombra y anillo van fuera del contenedor; visuals.ts los escala con los ejes del suelo proyectados
  const shadow = createContactShadow(scene, x, y)
  const rig = new PuppetRig(scene, kind, playerKit(team, kind, look), stickSide, x, y)

  const selectionRing = scene.add.circle(x, y, radius + 7)
  selectionRing.setStrokeStyle(3, 0xffffff, 1)
  selectionRing.setFillStyle(0, 0)
  selectionRing.setVisible(false)

  const staminaBar = controllable
    ? scene.add.rectangle(x - STAMINA_BAR_W / 2, y + radius + 10, STAMINA_BAR_W, STAMINA_BAR_H, 0x4da3ff)
        .setOrigin(0, 0.5)
    : null

  const labelY = role === 'goalie' ? -64 : -58
  const label = scene.add.text(x, y + labelY, getRoleShort(role), {
    fontFamily: FONT,
    fontSize: '11px',
    color: '#d0e8ff',
    stroke: '#06101a',
    strokeThickness: 3,
  }).setOrigin(0.5)

  return {
    id, team, side, role,
    container: rig.container, rig, pose: createPose(),
    hand: look.hand, skin: look.skin, hair: look.hair, number: look.number,
    shadow, selectionRing, label, staminaBar,
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
