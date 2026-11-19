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
import { GOALIE_RADIUS, RINK, PLAYER_MAX_SPEED, PLAYER_RADIUS, PLAYER_SPRINT_MAX_SPEED, STICK_SWING_MS } from '../constants'
import { project, type Projected } from '../render/viewTransform'
import { PENALTY_CORRIDOR_Y, penaltyDoor, penaltySeat } from '../render/rink/table'
import { BOARD_W } from '../render/rink/geometry'
import { updateBoardDoors } from '../render/rink/boards'
import { SEAT_PELVIS_Y } from '../render/rink/benches'
import {
  BALL_VISUAL_DIAMETER_M, BOARDS, DEPTH, FIGURE_EXAG, PLAYER_UI, PUPPET_LOCAL, PX_PER_M, RIG_TEX_SUPERSAMPLE,
  WORLD_PX_PER_M, bandDepth, figureScale,
} from '../render/artSpec'
import { actions, resolveAction } from '../render/puppet/actions'
import { goaliePose } from '../render/puppet/goalie'
import { advanceStride, locomotion, seatedPose, skidTurn } from '../render/puppet/locomotion'
import { resetPose, type PoseContext } from '../render/puppet/pose'
import { RIG_UNIT, SHADOW_FRAME_RADIUS } from '../render/puppet/rig'
import { groundFromLocal } from '../render/puppet/skeleton'
import { upperBody } from '../render/puppet/upperBody'
import { depthBesideGoal } from '../render/rink/goal'
import { areRoleLabelsEnabled } from '../ui/prefs'
import { v3 } from '../render/puppet/vec'

const LABEL_GAP = 8              // px de pantalla sobre la coronilla
/** Velocidad (px de mundo/s) por debajo de la cual la figura no patina. */
const MOVING_SPEED = 14
/**
 * Sombra de contacto en px de mundo, en múltiplos del radio físico (ancho y alto).
 * Casi redonda en el suelo: los ejes gx/gy ya la acortan como al círculo central.
 */
const SHADOW_W = 1.75
const SHADOW_H = 1.5

/** Limita un valor al rango 0..1 para interpolaciones visuales. */
function clamp01(value: number) {
  return Phaser.Math.Clamp(value, 0, 1)
}

// Zona de sancionados: bancos a los lados de la mesa (rink/table.ts), azul a la izquierda y rojo a la derecha.

const penSeats = new Map<string, { x: number; y: number }>()
const penNext = { blue: 0, red: 0 }
/** Sancionados ya sentados: la pose sentada se aplica una vez al llegar al banco (perf P-10). */
const seated = new WeakSet<Player>()
/** Último segundo de sanción escrito en la etiqueta (setText solo al cambiar). */
const penSecs = new WeakMap<Player, number>()
/** Fundido de la etiqueta de dorsal: alfa actual, último instante con la bola o el control y último pintado. */
const tagFade = new WeakMap<Player, { a: number; seenAt: number; t: number }>()

/** Posición de mundo del asiento de cada jugador suspendido (el lab puede forzarlo con el dato `penSeat`). Sin asignar por fotograma. */
function buildPenaltyPositions(players: Player[], timeNow: number): Map<string, { x: number; y: number }> {
  penNext.blue = 0
  penNext.red = 0
  for (const p of players) {
    if (!(p.suspendedUntil && p.suspendedUntil > timeNow)) continue
    const forced = (p.container.getData('penSeat') as number | undefined) ?? p.penSeat
    let out = penSeats.get(p.id)
    if (!out) { out = { x: 0, y: 0 }; penSeats.set(p.id, out) }
    penaltySeat(p.team, forced ?? penNext[p.team]++, out)
  }
  return penSeats
}

const foot: Projected = { x: 0, y: 0, s: 0 }
const penDoor = { x: 0, y: 0 }
/** Equipos con alguien cruzando su puerta en este fotograma. */
const doorBusy = { blue: false, red: false }

function inDoorway(player: Player) {
  penaltyDoor(player.team, 0, penDoor)
  return Math.abs(player.pos.x - penDoor.x) < (BOARDS.doorWidthM * WORLD_PX_PER_M.x) / 2 && player.pos.y > PENALTY_CORRIDOR_Y - PLAYER_RADIUS
}

function noteDoorTraffic(player: Player) {
  penaltyDoor(player.team, 0, penDoor)
  if (Math.hypot(player.pos.x - penDoor.x, player.pos.y - penDoor.y) < BOARDS.doorOpenRadiusM * WORLD_PX_PER_M.x) doorBusy[player.team] = true
}
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
  action: null, stickTip: v3(),
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
  const ballShadow = ball.visual.getData('shadow') as Phaser.GameObjects.Image | undefined
  if (ballShadow) {
    projectGround(ball.x, ball.y)
    const k = ballDiam / (2 * SHADOW_FRAME_RADIUS * RIG_TEX_SUPERSAMPLE)
    ballShadow.setVisible(ball.visual.visible).setPosition(foot.x, foot.y)
      .setScale(k * 1.1, k * 0.45).setDepth(ballDepth - 0.006)
  }

  const penPos = buildPenaltyPositions(players, timeNow)
  const labelsOn = areRoleLabelsEnabled()

  // Puertas de los banquillos: con lo que pasó por ellas el fotograma anterior
  updateBoardDoors(doorBusy, timeNow)
  doorBusy.blue = false
  doorBusy.red = false
  for (const player of players) {
    let suspended = !!(player.suspendedUntil && player.suspendedUntil > timeNow)
    // Camino al banquillo y de vuelta: se pinta patinando donde lo deja la simulación; sentado solo en su asiento
    const walking = suspended && !!player.penPhase && player.penPhase !== 'seated'
    if (walking) suspended = false
    const penWorld = suspended ? penPos.get(player.id)! : null
    if (walking) noteDoorTraffic(player)
    projectGround(penWorld ? penWorld.x : player.pos.x, penWorld ? penWorld.y : player.pos.y)
    const sp = foot
    const k = figureScale(sp.s)
    const figH = (PUPPET_LOCAL.feetY - PUPPET_LOCAL.topY) * k
    // El portero delante de la boca va por encima del marco (WP-67)
    // Ya en el pasillo, la valla le tapa las piernas; en el hueco de la puerta abierta se ve entero
    const behindBoard = walking && player.pos.y < RINK.y - BOARD_W * 0.5 && !inDoorway(player)
    const depth = player.role === 'goalie' ? depthBesideGoal(player.pos.x, player.pos.y, bandDepth('COURT', sp.y))
      : bandDepth(behindBoard ? 'OFFCOURT_FAR' : 'COURT', sp.y)
    const centerY = sp.y - PUPPET_LOCAL.feetY * k   // el origen del contenedor es el torso; los pies quedan en sp.y
    const pose = player.pose
    pose.headScale = headScale
    resetPose(pose)

    if (suspended) {
      // Zona de sancionados (al otro lado de la valla): sentado en su asiento, mirando a la pista, sin stick
      player.container
        .setPosition(sp.x, centerY)
        .setAlpha(1)
        .setScale(k)
        .setRotation(0)
        .setDepth(bandDepth('OFFCOURT_FAR', sp.y))
      player.shadow.setVisible(false)
      player.selectionRing.setVisible(false)
      player.selectionArrow.setVisible(false)
      player.staminaBar?.setVisible(false)
      ;(player.staminaBar?.getData('bg') as Phaser.GameObjects.Rectangle | undefined)?.setVisible(false)
      player.nameTag?.setVisible(false)
      const f = tagFade.get(player)
      if (f) { f.a = 0; f.seenAt = -Infinity }
      if (!seated.has(player)) {
        seated.add(player)
        pose.yaw = 0
        seatedPose(pose, SEAT_PELVIS_Y)
        player.rig.apply(pose)
      }
      const secsLeft = Math.ceil((player.suspendedUntil! - timeNow) / 1000)
      if (penSecs.get(player) !== secsLeft) { penSecs.set(player, secsLeft); player.label.setText(`${secsLeft}s`) }
      player.label.setPosition(sp.x, sp.y - figH - LABEL_GAP).setAlpha(1).setDepth(DEPTH.FX)  // el contador de sanción se ve siempre
      continue
    }
    if (seated.delete(player)) penSecs.delete(player)

    const isGoalie = player.role === 'goalie'
    const speed = Math.hypot(player.velocity.x, player.velocity.y)
    const moving = speed > MOVING_SPEED
    const sprinting = moving && !isGoalie && !!player.sprinting
    const maxVisualSpeed = sprinting ? PLAYER_SPRINT_MAX_SPEED : PLAYER_MAX_SPEED
    const speedRatio = moving ? clamp01(speed / maxVisualSpeed) : 0
    const carrying = ballCarrierId === player.id

    player.container.setAlpha(1).setPosition(sp.x, centerY).setRotation(0).setScale(k).setDepth(depth)
    const sh = shadowScale(player)
    player.shadow
      .setVisible(true)
      .setPosition(sp.x, sp.y)
      .setScale(gx * sh * SHADOW_W * (1 + speedRatio * 0.18), gy * sh * SHADOW_H * (1 - speedRatio * 0.12))
      .setDepth(depth - 0.006)
    // Anillo: apoyado en el suelo, entre la sombra y los patines; la elipse sale de gx/gy
    player.selectionRing.setPosition(sp.x, sp.y).setScale(gx / PLAYER_UI.ringTexScale, gy / PLAYER_UI.ringTexScale).setDepth(depth - 0.004)
    player.label.setPosition(sp.x, sp.y - figH - LABEL_GAP).setDepth(DEPTH.FX)
    player.label.setAlpha(labelsOn ? 1 : 0)   // alfa y no visibilidad: el lab oculta las etiquetas con setVisible

    // El ángulo del stick en mundo (contactos) lo fija updateStickAngles en la simulación; aquí solo el gesto
    const swing = (player.stickSwingUntil ?? 0) > timeNow ? clamp01(1 - (player.stickSwingUntil! - timeNow) / STICK_SWING_MS) : -1

    // Pose por capas en el marco del cuerpo (el derrape gira el cuerpo entero hacia el stick)
    advanceStride(player, timeNow, speedRatio, sprinting, stride)
    const yaw = Math.atan2(player.facing.x, player.facing.y) - (isGoalie ? 0 : skidTurn(player))
    pose.yaw = yaw
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
    resolveAction(c, timeNow)
    if (c.action === 'steal') {
      // El robo estira la pala hasta la punta de contacto (solo mientras dura: sin asignar por frame)
      const tip = getStickTip(player)
      project(tip.x, tip.y, 0, probe)
      groundFromLocal(yaw, (probe.x - sp.x) / k, (probe.y - sp.y) / k, RIG_UNIT, c.stickTip)
    }
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

    // Anillo y barra solo para el jugador controlado
    const active = controlled.id === player.id
    player.selectionRing.setVisible(active)
    player.selectionArrow.setVisible(active)
    if (active) {
      // Flecha en el borde del aro, girada en el plano del suelo: la dirección pasa por gx/gy igual que el aro
      const fl = Math.hypot(player.facing.x, player.facing.y) || 1
      const fx = (player.facing.x / fl) * gx, fy = (player.facing.y / fl) * gy
      const rr = (PLAYER_UI.ringRadiusM + PLAYER_UI.arrowGapM) * WORLD_PX_PER_M.x
      const sl = Math.hypot(fx, fy) || 1
      const kArrow = Math.sqrt(gx * gy) / PLAYER_UI.ringTexScale
      player.selectionArrow
        .setPosition(sp.x + (player.facing.x / fl) * rr * gx, sp.y + (player.facing.y / fl) * rr * gy)
        .setRotation(Math.atan2(fy / sl, fx / sl))
        .setScale(kArrow, kArrow * Math.min(1, 0.55 + 0.45 * Math.abs(fx / sl)))
        .setDepth(depth - 0.004)
    }

    // Solo el rol: el jugador activo ya lo marca el anillo y el portador se ve con la bola
    if (labelsOn) player.label.setText(getRoleShort(player.role))

    // Bajo el anillo: primero la etiqueta de dorsal y nombre y, debajo, la barra (solo el controlado)
    const ringBottom = sp.y + PLAYER_UI.ringRadiusM * WORLD_PX_PER_M.y * gy
    const tagBottom = ringBottom + PLAYER_UI.barGapPx * gx + (player.nameTag ? player.nameTag.height : 0)
    if (player.nameTag) {
      // Se ve el controlado y quien tiene la bola (también el portero que la ha blocado); se queda un rato al perderla
      const catchAt = player.goalieCatchTime ?? 0
      const holding = carrying || (isGoalie && catchAt > 0 && timeNow >= catchAt && timeNow - catchAt < PLAYER_UI.nameCatchMaxMs)
      let f = tagFade.get(player)
      if (!f) { f = { a: 0, seenAt: -Infinity, t: timeNow }; tagFade.set(player, f) }
      if (active || holding) f.seenAt = timeNow
      const target = timeNow - f.seenAt <= PLAYER_UI.nameLingerMs ? 1 : 0
      const step = Math.max(0, timeNow - f.t) / PLAYER_UI.nameFadeMs
      f.t = timeNow
      f.a = target > f.a ? Math.min(target, f.a + step) : Math.max(target, f.a - step)
      player.nameTag.setVisible(f.a > 0).setAlpha(f.a)
      if (f.a > 0) player.nameTag.setPosition(sp.x, tagBottom).setDepth(DEPTH.FX)
    }

    if (player.staminaBar) {
      const bg = player.staminaBar.getData('bg') as Phaser.GameObjects.Rectangle
      player.staminaBar.setVisible(active)
      bg.setVisible(active)
      if (active) {
        const stamina = clamp01((player.stamina ?? 100) / 100)
        const [hi, mid, low] = PLAYER_UI.barColors
        // Tamaños en px de pantalla: metros de mundo por la escala local del suelo
        const w = PLAYER_UI.barWM * WORLD_PX_PER_M.x * gx
        const h = PLAYER_UI.barHPx * gx
        const y = tagBottom + PLAYER_UI.nameGapPx * gx + h / 2
        bg.setPosition(sp.x, y).setSize(w, h).setDepth(DEPTH.FX - 0.001)
        player.staminaBar.setFillStyle(stamina > PLAYER_UI.barMid ? hi : stamina > PLAYER_UI.barLow ? mid : low)
        player.staminaBar.setPosition(sp.x - w / 2, y).setSize(Math.max(1, w * stamina), h).setDepth(DEPTH.FX)
      }
    }
  }
}

/**
 * Ángulo del stick en mundo (fuente de verdad de los contactos, ver getStickTip):
 * hacia la bola, adelante si la lleva, o el arco del golpe mientras dura. Es
 * lógica de juego: se llama en cada paso de simulación, no al pintar.
 */
export function updateStickAngles(players: Player[], ball: Ball, ballCarrierId: string | null, timeNow: number) {
  for (const player of players) {
    if (player.suspendedUntil && player.suspendedUntil > timeNow) continue
    if ((player.stickSwingUntil ?? 0) > timeNow) {
      const t = 1 - (player.stickSwingUntil! - timeNow) / STICK_SWING_MS
      player.stickWorldAngle = Math.atan2(player.facing.y, player.facing.x) + Math.sin(t * Math.PI) * 1.1
      continue
    }
    const carrying = ballCarrierId === player.id
    const aimX = carrying ? player.pos.x + player.facing.x * 40 : ball.x
    const aimY = carrying ? player.pos.y + player.facing.y * 40 : ball.y
    player.stickWorldAngle = Math.atan2(aimY - player.pos.y, aimX - player.pos.x)
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
