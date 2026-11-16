/**
 * Render por frame de jugadores y bola, sin tocar la física. Para cada jugador
 * orquesta la pose del rig por capas:
 *   pose = locomotion(…) ⊕ upperBody(…) ⊕ actions(…)   (portero: goaliePose)
 *   rig.apply(pose)
 * y coloca sombra, anillo, barra de stamina y etiqueta.
 */
import * as Phaser from 'phaser'
import type { Ball, Player } from '../types'
import { getRoleShort } from '../utils'
import { GOALIE_RADIUS, PLAYER_MAX_SPEED, PLAYER_RADIUS, PLAYER_SPRINT_MAX_SPEED, RINK, STICK_SWING_MS } from '../constants'
import { project, type Projected } from '../render/viewTransform'
import { BOARD_W } from '../render/rink/geometry'
import {
  BALL_VISUAL_DIAMETER_M, DEPTH, FIGURE_EXAG, PENALTY_BOX, PUPPET_LOCAL, PX_PER_M, RIG_TEX_SUPERSAMPLE,
  WORLD_PX_PER_M, bandDepth, figureScale,
} from '../render/artSpec'
import { actions } from '../render/puppet/actions'
import { goaliePose } from '../render/puppet/goalie'
import { advanceStride, locomotion, standingPose } from '../render/puppet/locomotion'
import { resetPose, type PoseContext } from '../render/puppet/pose'
import { RIG_UNIT, SHADOW_FRAME_RADIUS } from '../render/puppet/rig'
import { groundFromLocal } from '../render/puppet/skeleton'
import { upperBody } from '../render/puppet/upperBody'
import { v3 } from '../render/puppet/vec'

const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3
const STAMINA_BAR_Y_OFFSET = 6   // px de pantalla bajo los pies
const LABEL_GAP = 8              // px de pantalla sobre la coronilla
/** Velocidad (px de mundo/s) por debajo de la cual la figura no patina. */
const MOVING_SPEED = 14
/** Sombra de contacto en px de mundo, en múltiplos del radio físico (ancho y alto). */
const SHADOW_W = 2.6
const SHADOW_H = 0.82

/** Limita un valor al rango 0..1 para interpolaciones visuales. */
function clamp01(value: number) {
  return Phaser.Math.Clamp(value, 0, 1)
}

// Zona de sancionados: coordenadas de mundo detrás de la valla lejana, junto a la mesa.
// Azul se coloca a la izquierda del centro, rojo a la derecha.
const PEN_CENTER_X = RINK.x + RINK.width / 2
const PEN_Y_WORLD = RINK.y - BOARD_W - PENALTY_BOX.setbackM * WORLD_PX_PER_M.y

/** Calcula la posición de mundo de cada jugador suspendido. */
function buildPenaltyPositions(players: Player[], timeNow: number): Map<string, { x: number; y: number }> {
  const idxBlue = { n: 0 }
  const idxRed  = { n: 0 }
  const map = new Map<string, { x: number; y: number }>()
  const gap = PENALTY_BOX.centerGapM * WORLD_PX_PER_M.x
  const step = PENALTY_BOX.stepM * WORLD_PX_PER_M.x
  for (const p of players) {
    if (!(p.suspendedUntil && p.suspendedUntil > timeNow)) continue
    if (p.team === 'blue') {
      map.set(p.id, { x: PEN_CENTER_X - gap - idxBlue.n * step, y: PEN_Y_WORLD })
      idxBlue.n++
    } else {
      map.set(p.id, { x: PEN_CENTER_X + gap + idxRed.n * step, y: PEN_Y_WORLD })
      idxRed.n++
    }
  }
  return map
}

const foot: Projected = { x: 0, y: 0, s: 0 }
const probe: Projected = { x: 0, y: 0, s: 0 }
/** Escala del suelo en el último punto proyectado: px de pantalla por px de mundo en X (gx) e Y (gy). */
let gx = 1
let gy = 1

/** Proyecta (wx, wy) al suelo en `foot` y fija gx/gy con la perspectiva local. */
function projectGround(wx: number, wy: number) {
  project(wx, wy, 0, foot)
  project(wx + 1, wy, 0, probe)
  gx = probe.x - foot.x
  project(wx, wy + 1, 0, probe)
  gy = probe.y - foot.y
}

// Escala global de la cabeza; la fija la escena según el modo (cabezones en arcade).
let headScale = 1

/** Fija la escala de la cabeza para todos los jugadores (1 = reglamento). */
export function setVisualHeadScale(scale: number) {
  headScale = scale
}

/** Contexto de pose reutilizado (sin asignaciones por frame). */
const poseCtx: PoseContext = {
  player: null as unknown as Player, kind: 'skater', time: 0, dt: 0,
  velForward: 0, velRight: 0, speedRatio: 0, sprinting: false, phase: 0, blend: 0,
  carrying: false, ball: v3(), swing: -1, stickSide: 1,
}
const stride = { phase: 0, blend: 0, dt: 0 }

/** Escala de la imagen de sombra por radio de mundo (el marco mide SHADOW_FRAME_RADIUS a s = 1). */
function shadowScale(player: Player) {
  const r = player.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
  return r / (2 * SHADOW_FRAME_RADIUS * RIG_TEX_SUPERSAMPLE)
}

/** Actualiza render de jugadores, bola y rig sin tocar la física. */
export function updateVisuals(
  players: Player[],
  controlled: Player,
  ball: Ball,
  ballCarrierId: string | null,
  timeNow: number,
) {
  project(ball.x, ball.y, 0, foot)
  const ballDiam = BALL_VISUAL_DIAMETER_M * PX_PER_M * foot.s * FIGURE_EXAG
  const ballDepth = bandDepth('COURT', foot.y)
  ball.visual.setPosition(foot.x, foot.y - ballDiam / 2).setDisplaySize(ballDiam, ballDiam).setDepth(ballDepth + 0.004)
  const ballShadow = ball.visual.getData('shadow') as Phaser.GameObjects.Ellipse | undefined
  if (ballShadow) {
    projectGround(ball.x, ball.y)
    ballShadow.setVisible(ball.visual.visible).setPosition(foot.x, foot.y)
      .setSize(ballDiam * 1.1, ballDiam * 0.45).setDepth(ballDepth - 0.006)
  }

  const penPos = buildPenaltyPositions(players, timeNow)

  for (const player of players) {
    const suspended = !!(player.suspendedUntil && player.suspendedUntil > timeNow)
    const penWorld = suspended ? penPos.get(player.id)! : null
    projectGround(penWorld ? penWorld.x : player.pos.x, penWorld ? penWorld.y : player.pos.y)
    const sp = foot
    const k = figureScale(sp.s)
    const figH = (PUPPET_LOCAL.feetY - PUPPET_LOCAL.topY) * k
    const depth = bandDepth('COURT', sp.y)
    const centerY = sp.y - PUPPET_LOCAL.feetY * k   // el origen del contenedor es el torso; los pies quedan en sp.y
    const pose = player.pose
    pose.headScale = headScale
    resetPose(pose)

    if (suspended) {
      // Zona de sancionados (al otro lado de la valla): de pie, mirando a la pista, sin stick
      player.container
        .setPosition(sp.x, centerY)
        .setAlpha(1)
        .setScale(k)
        .setRotation(0)
        .setDepth(bandDepth('OFFCOURT_FAR', sp.y))
      player.shadow.setVisible(false)
      player.selectionRing.setVisible(false)
      player.staminaBar?.setVisible(false)
      pose.yaw = 0
      standingPose(pose, player.rig.skeleton.dims)
      player.rig.apply(pose)
      const secsLeft = Math.ceil((player.suspendedUntil! - timeNow) / 1000)
      player.label.setPosition(sp.x, sp.y - figH - LABEL_GAP).setText(`${secsLeft}s`).setAlpha(1).setDepth(DEPTH.FX)
      continue
    }

    const facingAngle = Math.atan2(player.facing.y, player.facing.x)
    const forwardY = Phaser.Math.Clamp(player.facing.y, -1, 1)
    const isGoalie = player.role === 'goalie'
    const speed = Math.hypot(player.velocity.x, player.velocity.y)
    const moving = speed > MOVING_SPEED
    const sprinting = moving && !isGoalie && !!player.sprinting
    const maxVisualSpeed = sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED
    const speedRatio = moving ? clamp01(speed / maxVisualSpeed) : 0
    const sideFactor = Math.abs(player.facing.x)
    const towardCamera = Math.max(0, forwardY)
    const awayFromCamera = Math.max(0, -forwardY)
    const depthScaleX = 1 + towardCamera * 0.11 - awayFromCamera * 0.06 - sideFactor * 0.03
    const depthScaleY = 1 + towardCamera * 0.08 - awayFromCamera * 0.08
    const carrying = ballCarrierId === player.id

    player.container.setAlpha(1).setPosition(sp.x, centerY).setRotation(0).setScale(k).setDepth(depth)
    const sh = shadowScale(player)
    player.shadow
      .setVisible(true)
      .setPosition(sp.x, sp.y)
      .setScale(gx * sh * SHADOW_W * (1 + speedRatio * 0.18), gy * sh * SHADOW_H * (1 - speedRatio * 0.12))
      .setDepth(depth - 0.006)
    player.selectionRing.setPosition(sp.x, sp.y).setDepth(depth - 0.004)
    player.selectionRing.setScale(gx * depthScaleX, gy * depthScaleY)
    player.label.setPosition(sp.x, sp.y - figH - LABEL_GAP).setDepth(DEPTH.FX)
    player.staminaBar?.setVisible(true)
    player.label.setAlpha(1)

    // Stick en mundo (fuente de verdad del contacto, ver getStickTip): hacia la bola, o adelante si la lleva
    const aimX = carrying ? player.pos.x + player.facing.x * 40 : ball.x
    const aimY = carrying ? player.pos.y + player.facing.y * 40 : ball.y
    let stickAngle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, aimX, aimY)
    let swing = -1
    if ((player.stickSwingUntil ?? 0) > timeNow) {
      const t = 1 - (player.stickSwingUntil! - timeNow) / STICK_SWING_MS
      stickAngle = facingAngle + Math.sin(t * Math.PI) * 1.1
      swing = clamp01(t)
    }
    player.stickWorldAngle = stickAngle

    // Pose por capas en el marco del cuerpo
    const yaw = Math.atan2(player.facing.x, player.facing.y)
    pose.yaw = yaw
    advanceStride(player, timeNow, speedRatio, sprinting, stride)
    const c = poseCtx
    c.player = player
    c.kind = isGoalie ? 'goalie' : 'skater'
    c.time = timeNow
    c.dt = stride.dt
    c.velForward = player.velocity.x * player.facing.x + player.velocity.y * player.facing.y
    c.velRight = -player.velocity.x * player.facing.y + player.velocity.y * player.facing.x
    c.speedRatio = speedRatio
    c.sprinting = sprinting
    c.phase = stride.phase
    c.blend = stride.blend
    c.carrying = carrying
    c.swing = swing
    c.stickSide = player.rig.stickSide
    // La bola entra por pantalla para que la pala caiga sobre ella tal como se ve
    project(ball.x, ball.y, 0, probe)
    groundFromLocal(yaw, (probe.x - sp.x) / k, (probe.y - sp.y) / k, RIG_UNIT, c.ball)
    if (isGoalie) {
      goaliePose(pose, c)
    } else {
      locomotion(pose, c)
      upperBody(pose, c)
    }
    actions(pose, c)
    player.rig.apply(pose)

    // Anillo de selección
    const active = controlled.id === player.id
    if (carrying) {
      player.selectionRing.setVisible(true).setStrokeStyle(3, 0x9cff7a, 1)
    } else if (active) {
      player.selectionRing.setVisible(true).setStrokeStyle(3, 0xfff27a, 1)
    } else {
      player.selectionRing.setVisible(false)
    }

    player.label.setText(`${getRoleShort(player.role)}${active ? '★' : ''}${carrying ? '●' : ''}`)

    if (player.staminaBar) {
      const stamina = Math.max(0, (player.stamina ?? 100) / 100)
      const barW = Math.max(1, Math.round(STAMINA_BAR_W * stamina))
      const color = stamina > 0.5 ? 0x4da3ff : stamina > 0.25 ? 0xf5c64f : 0xff4d5c
      player.staminaBar.setFillStyle(color)
      player.staminaBar.setPosition(sp.x - STAMINA_BAR_W / 2, sp.y + STAMINA_BAR_Y_OFFSET).setDepth(DEPTH.FX)
      player.staminaBar.setDisplaySize(barW, STAMINA_BAR_H)
    }
  }
}

/** Devuelve la punta del stick en coordenadas mundo para resolver contactos. */
export function getStickTip(player: Player) {
  const angle = player.stickWorldAngle ?? Math.atan2(player.facing.y, player.facing.x)
  return {
    x: player.pos.x + Math.cos(angle) * 38,
    y: player.pos.y + Math.sin(angle) * 38,
  }
}
