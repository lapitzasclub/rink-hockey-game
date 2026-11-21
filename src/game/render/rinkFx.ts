/**
 * E-16: partículas de pista en reglamento y arcade, leídas del estado ya interpolado en
 * `renderFrame` (no tocan la simulación):
 * - ruedas: virutas y polvo en frenadas fuertes, derrapes y arranques con turbo, orientados
 *   con la velocidad y en los patines; marcas de goma tenues en alta y media;
 * - bola contra valla o poste: motas, destello y (poste) chispas, por la inversión brusca de
 *   su velocidad junto a la valla o al palo;
 * - choques: golpe breve con `player.bump` (E-15) o, si no lo hay, con el frenazo de dos
 *   jugadores en contacto; los fuertes levantan polvo de caída.
 * La tasa va por pasos de simulación (`steps`) y escala con `particleDensity()`.
 */
import * as Phaser from 'phaser'
import { BALL_RADIUS, BALL_WALL_MARGIN, GOAL_HALF_H, GOALIE_RADIUS, PLAYER_RADIUS, PLAYER_SEPARATION_GAP, RINK, SIM_SNAP_DIST } from '../constants'
import type { Ball, Player, Vector } from '../types'
import { getGoalLineX } from '../utils'
import { BALL_VISUAL_DIAMETER_M, PX_PER_M, RINK_FX } from './artSpec'
import { onQualityChange, particleDensity, qualityTier } from './quality'
import { MarkPool, ParticlePool, PKind } from './rinkFxPool'
import { createRinkFxTextures } from './rinkFxTextures'
import { logRinkFx, pollRinkFxLog, rfxLogOn, runRinkFxDemo } from './rinkFxDemo'

const S = RINK_FX.skate
const MAX_PLAYERS = 16
const DEG = Math.PI / 180
/** Tipo de arrastre de las ruedas. */
const NONE = 0, BRAKE = 1, SKID = 2, START = 3
const DRAG_NAMES = ['', 'brake', 'skid', 'start'] as const

const rand = (a: number, b: number) => a + Math.random() * (b - a)
/** 0 por debajo de `r[0]`, 1 desde `r[1]`. */
const ramp = (v: number, r: readonly [number, number]) => Math.max(0, Math.min(1, (v - r[0]) / (r[1] - r[0])))

const BALL_Z = (BALL_VISUAL_DIAMETER_M / 2) * PX_PER_M
const POSTS_Y = [RINK.y + RINK.height / 2 - GOAL_HALF_H, RINK.y + RINK.height / 2 + GOAL_HALF_H] as const

const demoOn = import.meta.env.DEV && new URLSearchParams(window.location.search).get('rfx') === 'demo'

export class RinkFx {
  private readonly scene: Phaser.Scene
  private readonly parts: ParticlePool
  private readonly marks: MarkPool
  private readonly mode: (typeof RINK_FX.mode)['arcade' | 'reglamento']
  private readonly sparkCounts: readonly number[]
  private readonly offQuality: () => void
  private density = 1
  private lastVt = -1

  // Seguimiento por jugador (por índice; se reinicia si cambia el jugador del hueco)
  private readonly seen: (Player | null)[] = new Array(MAX_PLAYERS).fill(null)
  private readonly pvx = new Float32Array(MAX_PLAYERS)
  private readonly pvy = new Float32Array(MAX_PLAYERS)
  private readonly ppx = new Float32Array(MAX_PLAYERS)
  private readonly ppy = new Float32Array(MAX_PLAYERS)
  private readonly inten = new Float32Array(MAX_PLAYERS)
  private readonly dirx = new Float32Array(MAX_PLAYERS)
  private readonly diry = new Float32Array(MAX_PLAYERS)
  private readonly drag = new Uint8Array(MAX_PLAYERS)
  private readonly acc = new Float32Array(MAX_PLAYERS)
  private readonly sparkAcc = new Float32Array(MAX_PLAYERS)
  private readonly emitted = new Uint32Array(MAX_PLAYERS)
  private readonly lastHit = new Float64Array(MAX_PLAYERS).fill(-Infinity)
  private readonly lastBumpAt = new Float64Array(MAX_PLAYERS).fill(-Infinity)
  /** Marca en curso por jugador: último punto de cada patín (izq x, y, der x, y). */
  private readonly markOn = new Uint8Array(MAX_PLAYERS)
  private readonly markPt = new Float32Array(MAX_PLAYERS * 4)
  private bumpSeen = false

  // Bola: velocidad de los dos fotogramas anteriores
  private ballInit = false
  private bx = 0
  private by = 0
  private bvx = 0
  private bvy = 0
  private bvx2 = 0
  private bvy2 = 0
  private lastBallHit = -Infinity

  constructor(scene: Phaser.Scene, arcade: boolean) {
    this.scene = scene
    createRinkFxTextures(scene)
    this.mode = arcade ? RINK_FX.mode.arcade : RINK_FX.mode.reglamento
    this.sparkCounts = arcade ? RINK_FX.ball.sparks.arcade : RINK_FX.ball.sparks.reglamento
    const b = RINK_FX.budget
    this.parts = new ParticlePool(scene, b.particles.alta, b.particles.alta)
    this.marks = new MarkPool(scene, b.marks.alta)
    this.applyQuality()
    this.offQuality = onQualityChange(() => this.applyQuality())
  }

  private applyQuality() {
    const tier = qualityTier()
    this.density = particleDensity()
    this.parts.setCapacity(this.density > 0 ? RINK_FX.budget.particles[tier] : 0)
    this.marks.setCapacity(RINK_FX.budget.marks[tier], RINK_FX.marks.lifeMs[tier])
  }

  /**
   * Una vez por fotograma, con jugadores y bola interpolados. `steps` = pasos de simulación
   * del fotograma (tasa de emisión); `live` = false en saques, final o con la escena cercana.
   */
  update(players: Player[], ball: Ball, ballVelocity: Vector, vt: number, steps: number, live: boolean) {
    const dtMs = this.lastVt < 0 ? 0 : Math.min(100, Math.max(0, vt - this.lastVt))
    this.lastVt = vt
    if (dtMs <= 0) return
    const n = Math.min(players.length, MAX_PLAYERS)
    const emitSteps = live ? steps : 0
    for (let i = 0; i < n; i++) {
      const p = players[i]
      const off = !!(p.suspendedUntil && p.suspendedUntil > vt)
      if (this.seen[i] !== p || off || Math.abs(p.pos.x - this.ppx[i]) + Math.abs(p.pos.y - this.ppy[i]) > SIM_SNAP_DIST) {
        this.seen[i] = off ? null : p
        this.inten[i] = 0
        this.markOn[i] = 0
        continue
      }
      this.wheels(i, p, dtMs, emitSteps, vt, live)
      if (live) this.bump(i, p, vt)
    }
    if (live && !this.bumpSeen) this.contacts(players, n, vt)
    for (let i = 0; i < n; i++) {
      const p = players[i]
      this.pvx[i] = p.velocity.x
      this.pvy[i] = p.velocity.y
      this.ppx[i] = p.pos.x
      this.ppy[i] = p.pos.y
    }
    this.ballHits(ball, ballVelocity, vt, live)
    if (demoOn) runRinkFxDemo(this, vt, steps)
    this.parts.update(vt, dtMs)
    this.marks.update(vt)
    if (rfxLogOn) pollRinkFxLog(this.scene)
  }

  /** Detecta frenada, derrape o arranque y emite en los patines. */
  private wheels(i: number, p: Player, dtMs: number, steps: number, vt: number, live: boolean) {
    const dt = dtMs / 1000
    const pvx = this.pvx[i]
    const pvy = this.pvy[i]
    const prev = Math.hypot(pvx, pvy)
    let raw = 0
    let kind = NONE
    let dx = 0
    let dy = 0
    if (prev > 1) {
      const ux = pvx / prev
      const uy = pvy / prev
      const ax = (p.velocity.x - pvx) / dt
      const ay = (p.velocity.y - pvy) / dt
      const along = ax * ux + ay * uy
      const lat = ay * ux - ax * uy
      const fast = prev > S.minSpeed
      const brake = fast ? ramp(-along, S.brake) : 0
      const skid = fast ? ramp(Math.abs(lat), S.skid) : 0
      const start = p.sprinting && p.role !== 'goalie' && prev < S.startMaxSpeed ? ramp(along, S.start) : 0
      if (brake >= skid && brake >= start && brake > 0) { raw = brake; kind = BRAKE; dx = ux; dy = uy }
      else if (skid >= start && skid > 0) {
        // Hacia fuera de la curva y algo hacia delante
        const side = lat > 0 ? -1 : 1
        raw = skid; kind = SKID
        dx = -uy * side * 0.8 + ux * 0.6
        dy = ux * side * 0.8 + uy * 0.6
      } else if (start > 0) { raw = start; kind = START; dx = -ux; dy = -uy }
    }
    const k = 1 - Math.exp(-dtMs / S.smoothMs)
    const was = this.inten[i]
    this.inten[i] += (raw - this.inten[i]) * k
    if (was < 0.4 && this.inten[i] >= 0.4) logRinkFx(this.scene, DRAG_NAMES[kind], p.pos.x, p.pos.y, this.inten[i])
    if (kind !== NONE) {
      this.drag[i] = kind
      this.dirx[i] += (dx - this.dirx[i]) * k
      this.diry[i] += (dy - this.diry[i]) * k
    }
    const inten = this.inten[i]
    const dl = Math.hypot(this.dirx[i], this.diry[i])
    if (inten < 0.03 || dl < 0.01) { this.markOn[i] = 0; return }
    const ux = this.dirx[i] / dl
    const uy = this.diry[i] / dl
    // Patines a los lados de la marcha (perpendicular a la velocidad)
    const sp = Math.hypot(p.velocity.x, p.velocity.y) || 1
    const gap = S.gapM * PX_PER_M
    const gx = (-p.velocity.y / sp) * gap
    const gy = (p.velocity.x / sp) * gap
    if (live) this.lay(i, p, gx, gy, inten, vt)
    if (steps <= 0 || this.density <= 0) return
    this.acc[i] += inten * S.rate * this.mode.rate * this.density * steps
    let budget = 6
    while (this.acc[i] >= 1 && budget-- > 0) {
      this.acc[i] -= 1
      const side = (this.emitted[i]++ & 1) ? 1 : -1
      this.wheelSpray(p.pos.x + gx * side, p.pos.y + gy * side, ux, uy, inten, vt, this.emitted[i] % S.puffEvery === 0)
    }
    if (this.acc[i] > 2) this.acc[i] = 2
    const drag = this.drag[i]
    if (this.mode.sparks && drag !== START && inten > S.sparkFrom) {
      this.sparkAcc[i] += (inten - S.sparkFrom) / (1 - S.sparkFrom) * S.sparkRate * this.density * steps
      while (this.sparkAcc[i] >= 1) {
        this.sparkAcc[i] -= 1
        const side = Math.random() < 0.5 ? 1 : -1
        this.sparks(p.pos.x + gx * side, p.pos.y + gy * side, ux, uy, 2, 0.4 + inten * 0.6, vt)
      }
    }
  }

  /** Marcas de goma de los dos patines mientras dura la frenada o el derrape. */
  private lay(i: number, p: Player, gx: number, gy: number, inten: number, vt: number) {
    const drag = this.drag[i]
    if (this.marks.capacity === 0 || drag === START || inten < RINK_FX.marks.on) { this.markOn[i] = 0; return }
    const m = this.markPt
    const o = i * 4
    const lx = p.pos.x - gx, ly = p.pos.y - gy
    const rx = p.pos.x + gx, ry = p.pos.y + gy
    if (!this.markOn[i]) {
      this.markOn[i] = 1
      m[o] = lx; m[o + 1] = ly; m[o + 2] = rx; m[o + 3] = ry
      return
    }
    if (Math.hypot(lx - m[o], ly - m[o + 1]) < RINK_FX.marks.segM * PX_PER_M) return
    const a = RINK_FX.marks.alpha * this.mode.alpha * Math.min(1, (inten - RINK_FX.marks.on) / (1 - RINK_FX.marks.on) * 1.5 + 0.25)
    const w = RINK_FX.marks.widthM * PX_PER_M
    this.marks.lay(m[o], m[o + 1], lx, ly, w, a, vt)
    this.marks.lay(m[o + 2], m[o + 3], rx, ry, w, a, vt)
    m[o] = lx; m[o + 1] = ly; m[o + 2] = rx; m[o + 3] = ry
  }

  /** Una mota (y a veces una nube) lanzada desde un patín hacia (ux, uy). Pública para el laboratorio. */
  wheelSpray(x: number, y: number, ux: number, uy: number, inten: number, vt: number, puff: boolean) {
    const sp = this.parts.spec
    const ang = Math.atan2(uy, ux) + rand(-S.speck.spreadDeg, S.speck.spreadDeg) * DEG
    const v = rand(S.speck.speed[0], S.speck.speed[1]) * (0.55 + 0.45 * inten)
    const size = rand(S.speck.sizeM[0], S.speck.sizeM[1]) * PX_PER_M
    sp.kind = PKind.Speck
    sp.x = x; sp.y = y; sp.z = 1
    sp.vx = Math.cos(ang) * v; sp.vy = Math.sin(ang) * v; sp.vz = rand(S.speck.vz[0], S.speck.vz[1]) * (0.6 + 0.4 * inten)
    sp.size0 = size; sp.size1 = size * 0.7
    sp.alpha = S.speck.alpha * this.mode.alpha
    sp.life = rand(S.speck.lifeMs[0], S.speck.lifeMs[1])
    sp.gravity = S.speck.gravity; sp.drag = S.speck.drag
    sp.tint = Math.random() < 0.4 ? RINK_FX.colors.chip : RINK_FX.colors.dust
    sp.depthBias = 0
    this.parts.spawn(vt)
    if (puff) this.puff(x, y, ux, uy, 0.5 + 0.5 * inten, vt)
  }

  private puff(x: number, y: number, ux: number, uy: number, k: number, vt: number) {
    const sp = this.parts.spec
    const v = rand(S.puff.speed[0], S.puff.speed[1])
    sp.kind = PKind.Puff
    sp.x = x; sp.y = y; sp.z = 2
    sp.vx = ux * v; sp.vy = uy * v; sp.vz = rand(S.puff.vz[0], S.puff.vz[1])
    sp.size0 = S.puff.sizeM[0] * PX_PER_M * (0.7 + 0.3 * k)
    sp.size1 = S.puff.sizeM[1] * PX_PER_M * (0.6 + 0.4 * k)
    sp.alpha = S.puff.alpha * this.mode.alpha * (0.6 + 0.4 * k)
    sp.life = rand(S.puff.lifeMs[0], S.puff.lifeMs[1])
    sp.gravity = 0; sp.drag = S.puff.drag
    sp.tint = RINK_FX.colors.dust
    sp.depthBias = 0
    this.parts.spawn(vt)
  }

  /** `count` chispas desde (x, y) hacia (ux, uy) en un abanico; `k` escala velocidad y vida. */
  private sparks(x: number, y: number, ux: number, uy: number, count: number, k: number, vt: number, z = 1, spreadDeg = 40) {
    const sp = this.parts.spec
    const base = Math.atan2(uy, ux)
    const c = RINK_FX.colors.sparks
    for (let j = 0; j < count; j++) {
      const ang = base + rand(-spreadDeg, spreadDeg) * DEG
      const v = rand(S.spark.speed[0], S.spark.speed[1]) * (0.6 + 0.4 * k)
      sp.kind = PKind.Spark
      sp.x = x; sp.y = y; sp.z = z
      sp.vx = Math.cos(ang) * v; sp.vy = Math.sin(ang) * v; sp.vz = rand(S.spark.vz[0], S.spark.vz[1])
      sp.size0 = S.spark.sizeM * PX_PER_M; sp.size1 = sp.size0 * 0.4
      sp.alpha = S.spark.alpha
      sp.life = rand(S.spark.lifeMs[0], S.spark.lifeMs[1]) * (0.7 + 0.3 * k)
      sp.gravity = S.spark.gravity; sp.drag = 1.5
      sp.tint = c[Math.floor(Math.random() * c.length)]
      sp.depthBias = 0
      this.parts.spawn(vt)
    }
  }

  private flash(x: number, y: number, z: number, sizeM: number, alpha: number, tint: number, vt: number, depthBias: number) {
    const sp = this.parts.spec
    const f = RINK_FX.flash
    sp.kind = PKind.Flash
    sp.x = x; sp.y = y; sp.z = z
    sp.vx = 0; sp.vy = 0; sp.vz = 0
    sp.size0 = sizeM * PX_PER_M * 0.8; sp.size1 = sizeM * PX_PER_M * 1.4
    sp.alpha = alpha
    sp.life = rand(f.lifeMs[0], f.lifeMs[1])
    sp.gravity = 0; sp.drag = 0
    sp.tint = tint
    sp.depthBias = depthBias
    this.parts.spawn(vt)
  }

  /** Cuántas emite un efecto de `n` piezas con la densidad actual: nunca menos de `min` si hay partículas. */
  private count(n: number, min = 1) {
    return this.density <= 0 ? 0 : Math.max(min, Math.round(n * this.density * this.mode.rate))
  }

  /**
   * Bola contra la valla (`post` = false) o un palo: motas hacia la pista por la normal (nx, ny),
   * destello y, en el palo, chispas. `k` ∈ [0, 1] según la velocidad de llegada. Pública para el laboratorio.
   */
  impact(x: number, y: number, nx: number, ny: number, tx: number, ty: number, k: number, post: boolean, vt: number) {
    if (this.density <= 0) return
    const b = RINK_FX.ball
    const fa = this.mode.sparks ? RINK_FX.flash.alpha.arcade : RINK_FX.flash.alpha.reglamento
    this.flash(x, y, BALL_Z, (post ? RINK_FX.flash.postM : RINK_FX.flash.boardM) * (0.6 + 0.5 * k), fa * (0.6 + 0.4 * k),
      post ? RINK_FX.colors.flashPost : RINK_FX.colors.flash, vt, 2)
    const n = this.count(b.specks[0] + (b.specks[1] - b.specks[0]) * k, 2)
    const sp = this.parts.spec
    for (let j = 0; j < n; j++) {
      // Hacia la pista por la normal, arrastradas por la componente tangente de la bola
      const ang = Math.atan2(ny, nx) + rand(-65, 65) * DEG
      const v = rand(40, 150) * (0.5 + 0.5 * k)
      sp.kind = PKind.Speck
      sp.x = x; sp.y = y; sp.z = BALL_Z
      sp.vx = Math.cos(ang) * v + tx * 0.25; sp.vy = Math.sin(ang) * v + ty * 0.25; sp.vz = rand(30, 130) * (0.5 + 0.5 * k)
      sp.size0 = rand(S.speck.sizeM[0], S.speck.sizeM[1]) * PX_PER_M; sp.size1 = sp.size0 * 0.7
      sp.alpha = S.speck.alpha * this.mode.alpha
      sp.life = rand(S.speck.lifeMs[0], S.speck.lifeMs[1])
      sp.gravity = S.speck.gravity; sp.drag = S.speck.drag
      sp.tint = post ? RINK_FX.colors.chip : RINK_FX.colors.dust
      sp.depthBias = 0
      this.parts.spawn(vt)
    }
    if (!post || k > 0.35) this.puff(x + nx * 3, y + ny * 3, nx, ny, 0.4 + 0.6 * k, vt)
    if (post) {
      const c = this.sparkCounts
      this.sparks(x, y, nx, ny, this.count(c[0] + (c[1] - c[0]) * k, 1), 0.5 + 0.5 * k, vt, BALL_Z, 70)
    }
  }

  /**
   * Golpe entre jugadores (o contra la valla) en (x, y) con el empuje en (nx, ny); `strength` en px/s.
   * Polvo en los patines de (fx, fy); por encima de `fall`, nube de caída. Pública para el laboratorio.
   */
  hit(x: number, y: number, nx: number, ny: number, strength: number, fx: number, fy: number, vt: number) {
    if (this.density <= 0) return
    const bp = RINK_FX.bump
    const k = ramp(strength, bp.strength)
    if (k <= 0) return
    const fa = this.mode.sparks ? RINK_FX.flash.alpha.arcade : RINK_FX.flash.alpha.reglamento
    const hip = bp.hipM * PX_PER_M
    this.flash(x, y, hip, RINK_FX.flash.hitM * (0.6 + 0.5 * k), fa * (0.55 + 0.45 * k), RINK_FX.colors.flashHit, vt, 6)
    if (this.mode.sparks) {
      // Arcade: estallido corto a los dos lados del contacto
      const n = this.count(2 + 4 * k, 1)
      this.sparks(x, y, -ny, nx, n, 0.5 + 0.5 * k, vt, hip, 50)
      this.sparks(x, y, ny, -nx, n, 0.5 + 0.5 * k, vt, hip, 50)
    }
    const puffs = this.count(1 + 2 * k, 1)
    for (let j = 0; j < puffs; j++) {
      const a = rand(0, Math.PI * 2)
      this.puff(fx + Math.cos(a) * 4, fy + Math.sin(a) * 3, nx, ny, 0.4 + 0.6 * k, vt)
    }
    const specks = this.count(2 + 4 * k, 1)
    for (let j = 0; j < specks; j++) this.wheelSpray(fx, fy, nx, ny, k, vt, false)
    if (strength >= bp.fall) this.fallDust(fx, fy, vt)
  }

  /** Corona de polvo a ras de suelo alrededor de los patines (caída o choque muy fuerte). */
  private fallDust(x: number, y: number, vt: number) {
    const n = this.count(6, 3)
    for (let j = 0; j < n; j++) {
      const a = (j / n) * Math.PI * 2 + rand(-0.3, 0.3)
      this.puff(x + Math.cos(a) * 6, y + Math.sin(a) * 4, Math.cos(a), Math.sin(a), 1, vt)
    }
  }

  /** Choque registrado por la física (E-15): reciente, nuevo y con magnitud. */
  private bump(i: number, p: Player, vt: number) {
    const b = p.bump
    if (!b) return
    this.bumpSeen = true
    if (b.at === this.lastBumpAt[i] || vt - b.at > RINK_FX.bump.recentMs || b.at > vt + 20) return
    this.lastBumpAt[i] = b.at
    const m = Math.hypot(b.x, b.y)
    if (m < RINK_FX.bump.strength[0] || vt - this.lastHit[i] < RINK_FX.bump.cooldownMs) return
    this.lastHit[i] = vt
    const nx = b.x / m
    const ny = b.y / m
    // El empuje aleja del contacto: el golpe queda en el lado contrario del cuerpo
    const r = p.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
    logRinkFx(this.scene, 'bump', p.pos.x, p.pos.y, m)
    this.hit(p.pos.x - nx * r, p.pos.y - ny * r, nx, ny, m, p.pos.x, p.pos.y, vt)
  }

  /** Sin `bump`: dos jugadores en contacto cuya velocidad de acercamiento cae de golpe. */
  private contacts(players: Player[], n: number, vt: number) {
    const bp = RINK_FX.bump
    for (let i = 0; i < n; i++) {
      const a = players[i]
      if (this.seen[i] !== a) continue
      const ra = a.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
      for (let j = i + 1; j < n; j++) {
        const b = players[j]
        if (this.seen[j] !== b) continue
        const dx = b.pos.x - a.pos.x
        const dy = b.pos.y - a.pos.y
        const rb = b.role === 'goalie' ? GOALIE_RADIUS : PLAYER_RADIUS
        const reach = ra + rb + PLAYER_SEPARATION_GAP + bp.fallbackGap
        const d2 = dx * dx + dy * dy
        if (d2 > reach * reach || d2 < 1) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const ny = dy / d
        const before = (this.pvx[i] - this.pvx[j]) * nx + (this.pvy[i] - this.pvy[j]) * ny
        if (before < bp.strength[0]) continue
        const now = (a.velocity.x - b.velocity.x) * nx + (a.velocity.y - b.velocity.y) * ny
        if (now > before * bp.fallbackKeep) continue
        if (vt - this.lastHit[i] < bp.cooldownMs || vt - this.lastHit[j] < bp.cooldownMs) continue
        this.lastHit[i] = vt
        this.lastHit[j] = vt
        // Polvo en los patines del que recibe más (el más lento antes del choque)
        const slowA = Math.hypot(this.pvx[i], this.pvy[i]) < Math.hypot(this.pvx[j], this.pvy[j])
        const f = slowA ? a : b
        logRinkFx(this.scene, 'contact', f.pos.x, f.pos.y, before)
        this.hit(a.pos.x + nx * ra, a.pos.y + ny * ra, slowA ? -nx : nx, slowA ? -ny : ny, before, f.pos.x, f.pos.y, vt)
      }
    }
  }

  /** Bola: inversión de la componente normal junto a la valla o a un palo. */
  private ballHits(ball: Ball, v: Vector, vt: number, live: boolean) {
    const b = RINK_FX.ball
    if (!this.ballInit || Math.abs(ball.x - this.bx) + Math.abs(ball.y - this.by) > SIM_SNAP_DIST) {
      this.ballInit = true
      this.bx = ball.x; this.by = ball.y
      this.bvx = this.bvx2 = v.x; this.bvy = this.bvy2 = v.y
      return
    }
    if (live && this.density > 0 && vt - this.lastBallHit > b.cooldownMs) this.detectBall(ball, v, vt)
    this.bx = ball.x; this.by = ball.y
    this.bvx2 = this.bvx; this.bvy2 = this.bvy
    this.bvx = v.x; this.bvy = v.y
  }

  private detectBall(ball: Ball, v: Vector, vt: number) {
    const b = RINK_FX.ball
    // Llegada: la mayor de los dos fotogramas previos con el mismo sentido (la interpolación reparte el rebote)
    const inX = Math.sign(this.bvx) === Math.sign(this.bvx2) ? Math.max(Math.abs(this.bvx), Math.abs(this.bvx2)) : Math.abs(this.bvx)
    const inY = Math.sign(this.bvy) === Math.sign(this.bvy2) ? Math.max(Math.abs(this.bvy), Math.abs(this.bvy2)) : Math.abs(this.bvy)
    const flipX = this.bvx * v.x < 0
    const flipY = this.bvy * v.y < 0
    if (!flipX && !flipY) return
    // Palos: los cuatro de las dos porterías
    for (let s = 0; s < 2; s++) {
      const gx = getGoalLineX(s === 0 ? 'left' : 'right')
      for (const py of POSTS_Y) {
        const dx = ball.x - gx
        const dy = ball.y - py
        if (dx * dx + dy * dy > b.postPx * b.postPx) continue
        const inSpeed = flipX && flipY ? Math.hypot(inX, inY) : flipX ? inX : inY
        const k = ramp(inSpeed, b.speed)
        if (k <= 0) return
        const d = Math.hypot(dx, dy) || 1
        const r = BALL_RADIUS * 0.5
        this.lastBallHit = vt
        logRinkFx(this.scene, 'post', gx, py, k)
        this.impact(gx + (dx / d) * r, py + (dy / d) * r, dx / d, dy / d, 0, 0, k, true, vt)
        return
      }
    }
    const left = RINK.x + BALL_WALL_MARGIN + b.tolPx
    const right = RINK.x + RINK.width - BALL_WALL_MARGIN - b.tolPx
    const top = RINK.y + BALL_WALL_MARGIN + b.tolPx
    const bottom = RINK.y + RINK.height - BALL_WALL_MARGIN - b.tolPx
    if (flipX && ((ball.x <= left && this.bvx < 0) || (ball.x >= right && this.bvx > 0))) {
      const k = ramp(inX, b.speed)
      if (k > 0) {
        const nx = ball.x <= left ? 1 : -1
        this.lastBallHit = vt
        logRinkFx(this.scene, 'board', ball.x, ball.y, k)
        this.impact(ball.x - nx * BALL_RADIUS, ball.y, nx, 0, 0, v.y, k, false, vt)
        return
      }
    }
    if (flipY && ((ball.y <= top && this.bvy < 0) || (ball.y >= bottom && this.bvy > 0))) {
      const k = ramp(inY, b.speed)
      if (k > 0) {
        const ny = ball.y <= top ? 1 : -1
        this.lastBallHit = vt
        logRinkFx(this.scene, 'board', ball.x, ball.y, k)
        this.impact(ball.x, ball.y - ny * BALL_RADIUS, 0, ny, v.x, 0, k, false, vt)
      }
    }
  }

  get fxDensity() { return this.density }

  /** Laboratorio: un tramo de goma suelto con la intensidad dada. */
  markSegment(x0: number, y0: number, x1: number, y1: number, inten: number, vt: number) {
    this.marks.lay(x0, y0, x1, y1, RINK_FX.marks.widthM * PX_PER_M, RINK_FX.marks.alpha * this.mode.alpha * inten, vt)
  }

  destroy() {
    this.offQuality()
    this.parts.destroy()
    this.marks.destroy()
  }
}
