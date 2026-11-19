import * as Phaser from 'phaser'
import { PLAYER_UI, WORLD_PX_PER_M } from '../render/artSpec'
import { createProceduralPuppetTextures } from '../render/createProceduralPuppetTextures'
import { playerKit, lookFor, nameFor } from '../render/puppet/kit'
import { createPose } from '../render/puppet/pose'
import { PuppetRig, createContactShadow } from '../render/puppet/rig'
import type { Player, Role, TeamColor, TeamSide } from '../types'
import { getRoleShort } from '../utils'

const FONT = '"Russo One", sans-serif'

/**
 * Textura del anillo de selección (una por equipo, se pinta una vez): relleno muy
 * suave, borde claro y banda del equipo. Antes eran dos círculos Shape que WebGL
 * volvía a triangular en cada fotograma.
 */
function ringTexture(scene: Phaser.Scene, team: TeamColor) {
  const key = `player-ring-${team}`
  if (scene.textures.exists(key)) return key
  const S = PLAYER_UI.ringTexScale
  const r = PLAYER_UI.ringRadiusM * WORLD_PX_PER_M.x
  const size = Math.ceil((r + PLAYER_UI.ringEdgePx) * 2 * S) + 2
  const c = size / 2
  const band = PLAYER_UI.ringBandColor[team]
  const g = scene.make.graphics({ x: 0, y: 0 }, false)
  g.fillStyle(band, PLAYER_UI.ringFillAlpha)
  g.fillCircle(c, c, r * S)
  g.lineStyle(PLAYER_UI.ringEdgePx * S, PLAYER_UI.ringEdgeColor, PLAYER_UI.ringEdgeAlpha)
  g.strokeCircle(c, c, r * S)
  g.lineStyle(PLAYER_UI.ringBandPx * S, band, PLAYER_UI.ringBandAlpha)
  g.strokeCircle(c, c, (r - (PLAYER_UI.ringEdgePx + PLAYER_UI.ringBandPx) / 2) * S)
  g.generateTexture(key, size, size)
  g.destroy()
  return key
}

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

  // Anillo: borde claro y banda del equipo en una textura; visuals.ts la escala con gx/gy a elipse
  const selectionRing = scene.add.image(x, y, ringTexture(scene, team)).setVisible(false)

  // Barra de stamina: fondo oscuro con borde claro (dato 'bg') y relleno que visuals.ts recorta según el nivel
  const staminaBar = controllable
    ? scene.add.rectangle(x, y, 1, 1, PLAYER_UI.barColors[0]).setOrigin(0, 0.5).setVisible(false)
    : null
  if (staminaBar) {
    const bg = scene.add.rectangle(x, y, 1, 1, PLAYER_UI.barBgColor, PLAYER_UI.barBgAlpha)
      .setStrokeStyle(1, PLAYER_UI.barEdgeColor, PLAYER_UI.barEdgeAlpha).setVisible(false)
    staminaBar.setData('bg', bg)
  }

  // Dorsal y nombre (de la plantilla del partido externo, si lo hay): la ve el controlado y quien lleva la bola
  const name = nameFor(id, team, role)
  const nameTag = scene.add.text(x, y, name ? `${look.number}  ${name.toUpperCase()}` : look.number, {
    fontFamily: FONT,
    fontSize: `${PLAYER_UI.nameFontPx}px`,
    color: '#ffffff',
    stroke: PLAYER_UI.nameStroke[team],
    strokeThickness: 3,
  }).setOrigin(0.5, 1).setVisible(false)

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
    shadow, selectionRing, label, staminaBar, nameTag,
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
