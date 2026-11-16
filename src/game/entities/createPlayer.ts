import * as Phaser from 'phaser'
import { PLAYER_UI, WORLD_PX_PER_M } from '../render/artSpec'
import { createProceduralPuppetTextures } from '../render/createProceduralPuppetTextures'
import { playerKit, lookFor } from '../render/puppet/kit'
import { createPose } from '../render/puppet/pose'
import { PuppetRig, createContactShadow } from '../render/puppet/rig'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'

const FONT = '"Russo One", sans-serif'

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
  const kind = role === 'goalie' ? 'goalie' : 'skater'
  const look = lookFor(id, team, role)
  const stickSide = look.hand === 'R' ? 1 : 0

  // Sombra y anillo van fuera del contenedor; visuals.ts los escala con los ejes del suelo proyectados
  const shadow = createContactShadow(scene, x, y)
  const rig = new PuppetRig(scene, kind, playerKit(team, kind, look), stickSide, x, y)

  // Anillo: borde claro (selectionRing) y banda de equipo (dato 'band'); visuals.ts los escala con gx/gy a elipse
  const ringR = PLAYER_UI.ringRadiusM * WORLD_PX_PER_M.x
  const bandColor = PLAYER_UI.ringBandColor[team]
  const selectionRing = scene.add.circle(x, y, ringR)
  selectionRing.setStrokeStyle(PLAYER_UI.ringEdgePx, PLAYER_UI.ringEdgeColor, PLAYER_UI.ringEdgeAlpha)
  selectionRing.setFillStyle(bandColor, PLAYER_UI.ringFillAlpha)
  selectionRing.setVisible(false)
  const band = scene.add.circle(x, y, ringR - (PLAYER_UI.ringEdgePx + PLAYER_UI.ringBandPx) / 2)
  band.setStrokeStyle(PLAYER_UI.ringBandPx, bandColor, PLAYER_UI.ringBandAlpha).setFillStyle().setVisible(false)
  selectionRing.setData('band', band)

  // Barra de stamina: fondo oscuro con borde claro (dato 'bg') y relleno que visuals.ts recorta según el nivel
  const staminaBar = controllable
    ? scene.add.rectangle(x, y, 1, 1, PLAYER_UI.barColors[0]).setOrigin(0, 0.5).setVisible(false)
    : null
  if (staminaBar) {
    const bg = scene.add.rectangle(x, y, 1, 1, PLAYER_UI.barBgColor, PLAYER_UI.barBgAlpha)
      .setStrokeStyle(1, PLAYER_UI.barEdgeColor, PLAYER_UI.barEdgeAlpha).setVisible(false)
    staminaBar.setData('bg', bg)
  }

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
