import * as Phaser from 'phaser'
import { PLAYER_PUPPET_VISUAL_SCALE, RINK } from '../constants'
import { createProceduralPuppetTextures } from './createProceduralPuppetTextures'

/**
 * Puppets animados en los banquillos del lado lejano.
 *
 * - Misma escala que los jugadores de campo (PLAYER_PUPPET_VISUAL_SCALE).
 * - Postura sentada: patines rotados ~80° como si apoyaran los pies en el suelo.
 * - Cada jugador tiene velocidades y amplitudes de animación independientes
 *   para que no estén sincronizados entre sí.
 * - Posicionados en screen-space (Y) + convergencia perspectiva X_FAR (X).
 */

const XS = 0.82                          // X_FAR: convergencia perspectiva en t=0
const CX = RINK.x + RINK.width / 2      // 640
const SCALE = PLAYER_PUPPET_VISUAL_SCALE // 0.84, mismo que jugadores de campo

// Screen Y del centro del container — cerca de los tableros lejanos (y≈121)
// A esta posición: cabeza≈y46, cuerpo≈y87, patines≈y113, tablero≈y121
const SEAT_Y = 78

// Tints de equipo — idénticos a createPlayer.ts
const BODY_TINT:   Record<'blue' | 'red', number> = { blue: 0x3399ff, red: 0xff3333 }
const HELMET_TINT: Record<'blue' | 'red', number> = { blue: 0x1155cc, red: 0xcc1111 }
const ARM_TINT:    Record<'blue' | 'red', number> = { blue: 0x2277dd, red: 0xdd2222 }
const SKATE_TINT:  Record<'blue' | 'red', number> = { blue: 0xd9efff, red: 0xffe1e1 }

function wx2sx(wx: number): number {
  return CX + (wx - CX) * XS
}

export interface BenchPlayer {
  container:  Phaser.GameObjects.Container
  head:       Phaser.GameObjects.Image
  body:       Phaser.GameObjects.Image
  leftArm:    Phaser.GameObjects.Image
  rightArm:   Phaser.GameObjects.Image
  leftSkate:  Phaser.GameObjects.Image
  rightSkate: Phaser.GameObjects.Image
  // Parámetros de animación individuales (generados por jugador para evitar sincronía)
  p1: number   // fase principal (escaneo de cabeza)
  p2: number   // fase cuerpo/lean
  p3: number   // fase brazos
  p4: number   // fase respiración/bob
  scanSpeed:   number
  scanAmp:     number
  leanSpeed:   number
  leanAmp:     number
  armSpeed:    number
  breathSpeed: number
  breathAmp:   number
}

/** Crea los puppets de banquillo de ambos equipos y los devuelve para animarlos. */
export function createBenchPlayers(scene: Phaser.Scene): BenchPlayer[] {
  createProceduralPuppetTextures(scene)

  const players: BenchPlayer[] = []
  const N = 5

  const bL = wx2sx(RINK.x + 110)
  const bR = wx2sx(RINK.x + RINK.width / 2 - 70)
  for (let i = 0; i < N; i++) {
    const x = bL + (bR - bL) * (i + 1) / (N + 1)
    players.push(spawnBenchPlayer(scene, x, SEAT_Y, 'blue', i))
  }

  const rL = wx2sx(RINK.x + RINK.width / 2 + 70)
  const rR = wx2sx(RINK.x + RINK.width - 110)
  for (let i = 0; i < N; i++) {
    const x = rL + (rR - rL) * (i + 1) / (N + 1)
    players.push(spawnBenchPlayer(scene, x, SEAT_Y, 'red', i + N))
  }

  return players
}

/** Genera un número pseudo-aleatorio determinista en [min,max] según semilla entera. */
function prng(seed: number, min: number, max: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return min + (s - Math.floor(s)) * (max - min)
}

function spawnBenchPlayer(
  scene: Phaser.Scene,
  screenX: number,
  screenY: number,
  team: 'blue' | 'red',
  idx: number,
): BenchPlayer {
  const container = scene.add.container(screenX, screenY)
    .setScale(SCALE)
    .setDepth(5)

  // ── Patines: postura sentada ──────────────────────────────────────────────
  // En pie los patines están a y=27, apuntando en X. Sentado: bajan a y=44,
  // separados y rotados ~80° para que apunten hacia adelante (hacia el campo).
  const leftSkate  = scene.add.image(-11, 44, 'field-skate')
    .setTint(SKATE_TINT[team])
    .setRotation(1.35)   // ~77°: punta del patín apuntando hacia la derecha/abajo
  const rightSkate = scene.add.image( 11, 44, 'field-skate')
    .setTint(SKATE_TINT[team])
    .setRotation(-1.35)

  // ── Brazos en descanso (sobre las rodillas) ───────────────────────────────
  const leftArm  = scene.add.image(-16, 20, 'field-arm')
    .setTint(ARM_TINT[team])
    .setRotation(0.60)
  const rightArm = scene.add.image( 16, 20, 'field-arm')
    .setTint(ARM_TINT[team])
    .setRotation(-0.60)

  // ── Cuerpo ────────────────────────────────────────────────────────────────
  const body = scene.add.image(0, 10, 'field-body').setTint(BODY_TINT[team])

  // ── Casco / cabeza ────────────────────────────────────────────────────────
  const head = scene.add.image(0, -20, 'field-head').setTint(HELMET_TINT[team])

  // Z-order: patines y brazos debajo, cuerpo y casco encima
  container.add([leftSkate, rightSkate, leftArm, rightArm, body, head])

  // ── Parámetros de animación únicos por jugador ────────────────────────────
  return {
    container, head, body, leftArm, rightArm, leftSkate, rightSkate,
    p1: prng(idx * 7 + 1, 0, Math.PI * 2),
    p2: prng(idx * 7 + 2, 0, Math.PI * 2),
    p3: prng(idx * 7 + 3, 0, Math.PI * 2),
    p4: prng(idx * 7 + 4, 0, Math.PI * 2),
    scanSpeed:   prng(idx * 7 + 5, 0.9,  2.1),   // período 3-7 s
    scanAmp:     prng(idx * 7 + 6, 0.22, 0.38),  // 13-22° — claramente visible
    leanSpeed:   prng(idx * 7 + 7, 0.6,  1.2),   // período 5-10 s
    leanAmp:     prng(idx * 7 + 8, 0.07, 0.14),  // inclinación suave
    armSpeed:    prng(idx * 7 + 9, 0.8,  1.6),   // período 4-8 s
    breathSpeed: prng(idx * 7 + 10, 1.0, 1.6),   // período 4-6 s
    breathAmp:   prng(idx * 7 + 11, 2.0, 4.0),   // bob vertical en px
  }
}

/**
 * Anima los puppets del banquillo en cada frame.
 * Cada jugador usa velocidades y fases distintas para no estar sincronizado.
 *
 * Comportamientos animados:
 * - Cabeza: escaneo lento izquierda-derecha + inclinación secundaria independiente
 * - Cuerpo: lean suave desfasado respecto a la cabeza
 * - Brazos: movimiento de reposo mínimo a velocidad propia
 * - Patines: ligero balanceo al ritmo del cuerpo
 * - Container: micro-bob vertical (simulación de respiración)
 */
export function updateBenchPlayers(players: BenchPlayer[], timeNow: number) {
  const t = timeNow / 1000

  for (const p of players) {
    // Cabeza: escaneo principal + oscilación secundaria a diferente frecuencia
    const scan      = Math.sin(t * p.scanSpeed  + p.p1) * p.scanAmp
    const scanExtra = Math.sin(t * p.scanSpeed * 0.61 + p.p2) * p.scanAmp * 0.35
    p.head.setRotation(scan + scanExtra)

    // Cuerpo: lean independiente de la cabeza
    const lean = Math.sin(t * p.leanSpeed + p.p2) * p.leanAmp
    p.body.setRotation(lean)
    p.container.setRotation(lean * 0.45)

    // Container Y: bob vertical de respiración (en px, directamente)
    const baseY = SEAT_Y
    p.container.setPosition(
      p.container.x,
      baseY + Math.sin(t * p.breathSpeed + p.p4) * p.breathAmp,
    )

    // Brazos: movimiento de reposo independiente
    const armShift = Math.sin(t * p.armSpeed + p.p3) * 0.065
    p.leftArm.setRotation(0.60 + armShift)
    p.rightArm.setRotation(-0.60 - armShift)

    // Patines: micro-balanceo al ritmo del cuerpo (los pies siguen ligeramente)
    const skateShift = lean * 0.3
    p.leftSkate.setRotation(1.35 + skateShift)
    p.rightSkate.setRotation(-1.35 - skateShift)
  }
}
