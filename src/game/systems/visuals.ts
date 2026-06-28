import * as Phaser from 'phaser'
import type { Ball, Player } from '../types'
import { getRoleShort } from '../utils'
import { PLAYER_MAX_SPEED, PLAYER_PUPPET_VISUAL_SCALE, PLAYER_SPRINT_MAX_SPEED, STICK_SWING_MS } from '../constants'
import { VIEW_Y_SCALE, localYScale, worldToScreen } from '../render/viewTransform'

const STAMINA_BAR_W = 36
const STAMINA_BAR_H = 3
const STAMINA_BAR_Y_OFFSET = 22
const LABEL_Y_OFFSET = 52
const BASE_SKATE_Y = 27
const BASE_ARM_Y = 10

const BODY_Y: Record<Player['role'], number> = {
  goalie: 7,
  defender: 8,
  wing: 8,
  pivot: 8,
}

const HEAD_Y: Record<Player['role'], number> = {
  goalie: -23,
  defender: -20,
  wing: -20,
  pivot: -20,
}

/** Limita un valor al rango 0..1 para interpolaciones visuales. */
function clamp01(value: number) {
  return Phaser.Math.Clamp(value, 0, 1)
}

/** Actualiza render de jugadores, bola y piezas puppet sin tocar la física. */
export function updateVisuals(
  players: Player[],
  controlled: Player,
  ball: Ball,
  ballCarrierId: string | null,
  timeNow: number,
) {
  const bs = worldToScreen(ball.x, ball.y)
  ball.visual.setPosition(bs.x, bs.y)

  for (const player of players) {
    const suspended = !!(player.suspendedUntil && player.suspendedUntil > timeNow)
    const sp = worldToScreen(player.pos.x, player.pos.y)

    const facingAngle = Math.atan2(player.facing.y, player.facing.x)
    const sideSign = Math.abs(player.facing.x) > 0.12
      ? Math.sign(player.facing.x)
      : player.side === 'left' ? 1 : -1
    const forwardY = Phaser.Math.Clamp(player.facing.y, -1, 1)

    const speed = Math.hypot(player.velocity.x, player.velocity.y)
    const moving = speed > 14 && player.role !== 'goalie'
    const sprinting = moving && !!player.sprinting
    const maxVisualSpeed = sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED
    const speedRatio = clamp01(speed / maxVisualSpeed)
    const sideFactor = Math.abs(player.facing.x)
    const towardCamera = Math.max(0, forwardY)
    const awayFromCamera = Math.max(0, -forwardY)
    const depthScaleX = 1 + towardCamera * 0.11 - awayFromCamera * 0.06 - sideFactor * 0.03
    const depthScaleY = 1 + towardCamera * 0.08 - awayFromCamera * 0.08

    player.container.setPosition(sp.x, sp.y).setRotation(0).setScale(PLAYER_PUPPET_VISUAL_SCALE)
    player.shadow
      .setPosition(sp.x, sp.y + 10 + towardCamera * 2)
      .setScale(1 + speedRatio * 0.18 + towardCamera * 0.12, 1 - speedRatio * 0.12)
    player.selectionRing.setPosition(sp.x, sp.y)
    player.selectionRing.setScale(depthScaleX, VIEW_Y_SCALE * depthScaleY)
    player.label.setPosition(sp.x, sp.y - LABEL_Y_OFFSET)

    if (suspended) {
      player.container.setAlpha(0.35)
      player.shadow.setAlpha(0.15)
      player.selectionRing.setVisible(false)
      player.staminaBar?.setVisible(false)
      player.label.setText('AZUL').setAlpha(0.5)
      continue
    }

    player.container.setAlpha(1)
    player.shadow.setAlpha(0.28)
    player.staminaBar?.setVisible(true)
    player.label.setAlpha(1)

    // animBlend suaviza la amplitud; fase acumulada por frame para evitar saltos al cambiar cycleSpeed
    const prevBlend = (player.container.getData('ab') as number | undefined) ?? 0
    const animBlend = Phaser.Math.Linear(prevBlend, speedRatio, 0.1)
    player.container.setData('ab', animBlend)

    const prevTime = (player.container.getData('pt') as number | undefined) ?? timeNow
    const frameDt = Math.min(timeNow - prevTime, 50)
    player.container.setData('pt', timeNow)

    const cycleMs = sprinting ? 52 : 130
    const cycleSpeed = 0.6 + animBlend * (sprinting ? 1.2 : 0.6)
    const prevPhase = (player.container.getData('sp') as number | undefined) ?? 0
    const skatePhase = (prevPhase + (frameDt / cycleMs) * cycleSpeed) % 62.83
    player.container.setData('sp', skatePhase)
    // rSin: fase pie derecho; lSin: pie izquierdo en contrafase 180°
    const rSin = Math.sin(skatePhase)
    const lSin = -rSin
    const sprintBoost = sprinting ? 1 : 0

    // Dirección del jugador en espacio contenedor (Y comprimida por perspectiva 3/4)
    const fcx = player.facing.x
    const fcy = player.facing.y * localYScale(player.pos.y)
    const fLen = Math.hypot(fcx, fcy) || 1
    const fnx = fcx / fLen   // forward normalizado X
    const fny = fcy / fLen   // forward normalizado Y
    // Perpendicular a la dirección (eje de separación de pies)
    const pnx = -fny
    const pny = fnx

    // Amplitudes
    const strideAmp = animBlend * (5 + animBlend * 5 + sprintBoost * 8)
    const spreadBase = 7 + animBlend * 1.5 + sprintBoost * 4
    const kickAmp = animBlend * 3 + sprintBoost * 3
    const rKick = spreadBase + Math.max(0, -rSin) * kickAmp
    const lKick = spreadBase + Math.max(0, -lSin) * kickAmp
    const glideDip = -Math.abs(rSin) * animBlend * 0.3

    // Spread perpendicular (funciona bien para movimiento vertical)
    const rSpreadX = rKick * pnx
    const lSpreadX = -lKick * pnx
    const rSpreadY_perp = rKick * pny     // puede ser negativo (hacia arriba → tapa el cuerpo)
    const lSpreadY_perp = -lKick * pny

    // Cuando el jugador se mueve de lado (sideFactor→1), ambos patines bajan al suelo
    // en vez de separarse arriba/abajo y quedar uno oculto tras el cuerpo
    const rSkateX = rSin * strideAmp * fnx + rSpreadX
    const rSkateY = BASE_SKATE_Y + rSin * strideAmp * fny +
      Phaser.Math.Linear(rSpreadY_perp, rKick, sideFactor)
    const lSkateX = lSin * strideAmp * fnx + lSpreadX
    const lSkateY = BASE_SKATE_Y + lSin * strideAmp * fny +
      Phaser.Math.Linear(lSpreadY_perp, lKick, sideFactor)

    const velocityLean = Phaser.Math.Clamp(player.velocity.x / (sprinting ? 680 : 880), -0.2, 0.2)
    const forwardLean = Phaser.Math.Clamp(player.velocity.y / 2200, -0.06, 0.06)

    const weightShift = rSin * animBlend * 0.9
    const headX = sideSign * (1.5 - sideFactor * 0.5) + player.velocity.x * 0.004
    const headY = HEAD_Y[player.role] + forwardY * 3 + glideDip * 0.3 + player.velocity.y * 0.003
    const bodyX = sideSign * -1 + player.velocity.x * 0.005 + weightShift
    const bodyY = BODY_Y[player.role] + towardCamera * 2 - awayFromCamera * 2 + glideDip
    const nearArmX = sideSign * (17 + sideFactor * 2)
    const farArmX = sideSign * (-15 + sideFactor * 1)
    const bodyScaleX = depthScaleX * (1 - sideFactor * 0.1 + speedRatio * 0.03)
    const bodyScaleY = depthScaleY * (1 + speedRatio * 0.02 - awayFromCamera * 0.03)
    const headScaleX = depthScaleX * (1 - sideFactor * 0.05)
    const headScaleY = depthScaleY * (1 + towardCamera * 0.03)

    // Textura frontal o de espalda según si el jugador se aleja o se acerca a cámara
    const dirPrefix = player.role === 'goalie' ? 'goalie' : 'field'
    const showBack = forwardY < -0.35
    const bodyKey = showBack ? `${dirPrefix}-body-back` : `${dirPrefix}-body`
    const headKey = showBack ? `${dirPrefix}-head-back` : `${dirPrefix}-head`
    if (player.body.texture.key !== bodyKey) player.body.setTexture(bodyKey)
    if (player.head.texture.key !== headKey) player.head.setTexture(headKey)

    player.body.setPosition(bodyX, bodyY).setRotation(velocityLean + forwardLean)
    player.body.setScale(sideSign * bodyScaleX, bodyScaleY)
    player.head.setPosition(headX, headY).setRotation(velocityLean * 0.45)
    player.head.setScale(sideSign * headScaleX, headScaleY)
    player.leftSkate.setPosition(lSkateX, lSkateY)
    player.leftSkate.setScale(sideSign * (0.9 + sideFactor * 0.1 + speedRatio * 0.1), 1 - awayFromCamera * 0.1)
    player.leftSkate.setRotation(-0.08 + lSin * animBlend * 0.18)
    player.rightSkate.setPosition(rSkateX, rSkateY)
    player.rightSkate.setScale(sideSign * (0.9 + sideFactor * 0.1 + speedRatio * 0.1), 1 + towardCamera * 0.08)
    player.rightSkate.setRotation(0.08 - rSin * animBlend * 0.18)
    // Swing contralateral de brazos (opuesto al pie adelantado)
    player.leftArm.setPosition(farArmX, BASE_ARM_Y + glideDip * 0.3 - rSin * animBlend * 1.5)
    player.leftArm.setScale(sideSign * (0.9 + depthScaleX * 0.08), depthScaleY)
    player.rightArm.setPosition(nearArmX, BASE_ARM_Y + glideDip * 0.3 + rSin * animBlend * 1.5)
    player.rightArm.setScale(sideSign * (1 + speedRatio * 0.08), depthScaleY)
    player.leftArm.setRotation(0.24 - rSin * animBlend * 0.1 + sprintBoost * 0.08)
    player.rightArm.setRotation(-0.24 + rSin * animBlend * 0.1 - sprintBoost * 0.1)

    // Stick
    const aimX = ballCarrierId === player.id ? player.pos.x + player.facing.x * 40 : ball.x
    const aimY = ballCarrierId === player.id ? player.pos.y + player.facing.y * 40 : ball.y
    const baseStickAngle = Phaser.Math.Angle.Between(player.pos.x, player.pos.y, aimX, aimY)
    const aimScreen = worldToScreen(aimX, aimY)
    const baseStickScreenAngle = Phaser.Math.Angle.Between(sp.x, sp.y, aimScreen.x, aimScreen.y)

    let stickAngle = baseStickAngle
    let stickScreenAngle = baseStickScreenAngle
    if ((player.stickSwingUntil ?? 0) > timeNow) {
      const t = 1 - (player.stickSwingUntil! - timeNow) / STICK_SWING_MS
      stickAngle = facingAngle + Math.sin(t * Math.PI) * 1.1
      const faceScreen = worldToScreen(player.pos.x + player.facing.x * 40, player.pos.y + player.facing.y * 40)
      const facingScreenAngle = Phaser.Math.Angle.Between(sp.x, sp.y, faceScreen.x, faceScreen.y)
      stickScreenAngle = facingScreenAngle + Math.sin(t * Math.PI) * 1.1
    }

    player.stickWorldAngle = stickAngle
    player.stick.setPosition(
      Math.cos(stickScreenAngle) * 19,
      11 + Math.sin(stickScreenAngle) * 11,
    )
    player.stick.rotation = stickScreenAngle
    player.stick.setScale(1)

    // Anillo de selección
    const active = controlled.id === player.id
    const carrying = ballCarrierId === player.id
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
      player.staminaBar.setPosition(sp.x - STAMINA_BAR_W / 2, sp.y + STAMINA_BAR_Y_OFFSET)
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
