import { SETPIECE_BALL as B, SETPIECE_DUEL as D, SETPIECE_GOAL as G, SETPIECE_GOALIE as GK } from '../constants'
import type { DrivePlan, SetPieceKind, SetPieceOutcome, SetPiecePhase, SetPieceResult, ShotInput } from './types'

/**
 * Simulación pura del lanzamiento (L-01): sin Phaser, en metros, paso fijo de
 * 1/60 s. Lanzador como punto que patina con la bola pegada, bola 3D desde el
 * golpeo (gravedad, aire, suelo, efecto), palos y larguero como cilindros, red
 * que frena, y portero como cuatro cápsulas con estirada.
 *
 * Quien la usa llama a `step` cada paso; cuando `phase` pasa a 'aim', decide
 * el tiro y llama a `launch`. El portero lo mueve su cerebro con `gTx/gTy` y
 * `dive`. Nada se asigna por paso: cápsulas en un Float64Array y el resultado
 * es un objeto único que se reescribe.
 */

export const SETPIECE_DT = 1 / 60

/** Estiradas: 0 quieto y las 8 direcciones del plano de la boca (E, NE, N, NO, O, SO, S, SE). */
export const DIVE_DX: readonly number[] = [0, 1, 1, 0, -1, -1, -1, 0, 1]
export const DIVE_DZ: readonly number[] = [0, 0, 1, 1, 1, 0, -1, -1, -1]
export function diveIndex(dx: number, dz: number): number {
  for (let i = 0; i < 9; i++) if (DIVE_DX[i] === dx && DIVE_DZ[i] === dz) return i
  return 0
}

/** Cápsulas del portero: torso, patines/espinilleras, brazo con guante, stick. */
export const GOALIE_CAPS = 4
const CAP = 7
const LAST_TOUCH_NONE = 0
const LAST_TOUCH_GOALIE = 1
const LAST_TOUCH_FRAME = 2

// Punto más cercano del último segmento consultado (sin objetos por paso)
let hx = 0
let hy = 0
let hz = 0
function closestOnSegment(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const ex = bx - ax, ey = by - ay, ez = bz - az
  const len2 = ex * ex + ey * ey + ez * ez
  let u = len2 > 1e-12 ? ((px - ax) * ex + (py - ay) * ey + (pz - az) * ez) / len2 : 0
  u = u < 0 ? 0 : u > 1 ? 1 : u
  hx = ax + ex * u; hy = ay + ey * u; hz = az + ez * u
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const lerp = (a: number, b: number, u: number) => a + (b - a) * u

export class SetPieceSim {
  kind: SetPieceKind = 'penalty'
  finalShot = false
  phase: SetPiecePhase = 'runup'
  t = 0
  /** Bola (m, m/s) y giro (1 = efecto máximo del golpeo). */
  bx = 0; by = 0; bz = B.radiusM
  vx = 0; vy = 0; vz = 0
  spin = 0
  /** Entrada de efecto en vuelo −1..1; quien controla el tiro la fija (se lee en la ventana tras el golpeo). */
  spinInput = 0
  /** Lanzador (punto en el suelo) y su plan. */
  sx = 0; sy = 0; svx = 0; svy = 0
  drive = false
  driveTx = 0; driveTy = 0
  driveStartT = 0
  windupEndT = 0
  /** L-02: conducción a mano (persona); en 'drive' sigue la velocidad pedida (unitaria) en vez de ir al objetivo. */
  manual = false
  wantVx = 0; wantVy = 0
  /** Portero: posición, velocidad, objetivo y estirada (diveDir −1 = sin estirada). */
  goalieOn = true
  gx = 0; gy = GK.lineY; gvx = 0; gvy = 0
  gTx = 0; gTy = GK.lineY
  diveDir = -1
  diveAt = 0
  caps = new Float64Array(GOALIE_CAPS * CAP)
  /** Marco de la portería activo (el caso de prueba del efecto lo apaga). */
  frameOn = true
  /** Golpeo, cruce de la línea y contactos. */
  hitT = -1
  shotSpeed = 0
  crossX = NaN
  crossedMouth = false
  lastTouch = LAST_TOUCH_NONE
  touchedGoalie = false
  touchedFrame = false
  /** Bola metida en un palo más de lo que permite el subpaso, o dentro de la portería sin cruzar la boca. */
  tunnel = 0
  outcome: SetPieceOutcome | null = null
  readonly result: SetPieceResult = {
    outcome: 'wide', x: 0, y: 0, vx: 0, vy: 0, inPlay: false, durationS: 0, shotSpeed: 0, drove: false, touchedGoalie: false, touchedFrame: false,
  }

  /** Pitido: bola en el punto, lanzador detrás (con carrerilla en el directo), portero en la línea. */
  reset(kind: SetPieceKind, finalShot: boolean, plan: DrivePlan) {
    this.kind = kind
    this.finalShot = finalShot
    const spot = kind === 'direct' ? D.directSpotM : D.penaltySpotM
    const runUp = kind === 'direct' ? clamp(plan.runUpM, 0, D.runUpMaxM) : 0
    this.bx = 0; this.by = spot; this.bz = B.radiusM
    this.vx = 0; this.vy = 0; this.vz = 0; this.spin = 0; this.spinInput = 0
    this.sx = 0; this.sy = spot + D.ballLeadM + runUp; this.svx = 0; this.svy = 0
    this.drive = plan.drive && !finalShot
    this.manual = false; this.wantVx = 0; this.wantVy = 0
    this.driveTx = clamp(plan.tx, -3, 3)
    this.driveTy = Math.max(D.minDriveYM, Math.min(spot, plan.ty))
    this.gx = 0; this.gy = GK.lineY; this.gvx = 0; this.gvy = 0
    this.gTx = 0; this.gTy = GK.lineY
    this.goalieOn = true
    this.frameOn = true
    this.diveDir = -1
    this.t = 0; this.hitT = -1; this.shotSpeed = 0
    this.crossX = NaN; this.crossedMouth = false
    this.lastTouch = LAST_TOUCH_NONE; this.touchedGoalie = false; this.touchedFrame = false
    this.tunnel = 0
    this.outcome = null
    this.phase = runUp > 0 ? 'runup' : this.drive ? 'drive' : 'windup'
    this.driveStartT = 0
    this.windupEndT = D.windupS
    this.shapeGoalie()
  }

  /** Tiro aislado desde (x, y) sin portero: casos de prueba (desvío máximo del efecto). */
  resetFreeShot(x: number, y: number) {
    this.reset('direct', true, { drive: false, tx: 0, ty: y, runUpM: 0 })
    this.bx = x; this.by = y
    this.goalieOn = false
    this.gx = 100
    this.shapeGoalie()
    this.phase = 'aim'
  }

  /** Copia completa del estado (repetición del tiro contra el portero perfecto). */
  copyFrom(o: SetPieceSim) {
    const caps = this.caps
    const res = this.result
    Object.assign(this, o)
    ;(this as { caps: Float64Array }).caps = caps
    ;(this as { result: SetPieceResult }).result = res
    caps.set(o.caps)
    Object.assign(res, o.result)
  }

  /** Orden de estirada (0 quieto, 1..8 dirección). Una sola por duelo. */
  dive(dir: number) {
    if (this.diveDir >= 0 || !this.goalieOn) return
    this.diveDir = dir
    this.diveAt = this.t
  }

  /** Golpeo: la fuerza da la velocidad y el apuntado el punto de la boca; con `compensate`, el golpeo cuenta con el efecto inicial. */
  launch(shot: ShotInput, compensate = true) {
    const tx = clamp(shot.aimX, -1.6, 1.6) * G.mouthHalfW
    const tz = Math.max(B.radiusM, clamp(shot.aimZ, 0, 1.4) * G.mouthH)
    const speed = lerp(B.shotSpeedMin, B.shotSpeedMax, clamp(shot.power, 0, 1))
    this.spin = clamp(shot.curve, -1, 1) * B.spinShotMax
    let dx = tx - this.bx
    const dy = -this.by
    const d = Math.max(0.3, Math.hypot(dx, dy))
    const k = B.airDragPerM
    // Tiempo hasta la línea con arrastre cuadrático en horizontal: d = ln(1 + k·v·T)/k
    const T = (Math.exp(k * d) - 1) / (k * speed)
    if (compensate && this.spin !== 0) {
      const lam = B.spinDecayPerS
      const lat = B.curveAccel * this.spin / (lam * lam) * (Math.exp(-lam * T) - 1 + lam * T)
      // Perpendicular del rumbo (−uy, ux): hacia +x tirando hacia la portería
      dx -= (-dy / d) * lat
    }
    const dh = Math.hypot(dx, dy)
    this.vx = dx / dh * speed
    this.vy = dy / dh * speed
    this.vz = (tz - B.radiusM + 0.5 * B.gravity * T * T) / T
    this.bz = B.radiusM
    this.hitT = this.t
    this.shotSpeed = Math.hypot(speed, this.vz)
    this.phase = 'flight'
  }

  step(dt: number) {
    if (this.phase === 'done' && !this.crossedMouth) return
    this.t += dt
    switch (this.phase) {
      case 'runup':
        if (this.skateTo(0, this.by + D.ballLeadM, dt)) {
          this.phase = this.drive ? 'drive' : 'windup'
          this.driveStartT = this.t
          this.windupEndT = this.t + D.windupS
        }
        break
      case 'drive':
        if ((this.manual ? this.steer(dt) : this.skateTo(this.driveTx, this.driveTy + D.ballLeadM, dt)) || this.t - this.driveStartT > D.maxDriveS) {
          this.phase = 'windup'
          this.windupEndT = this.t + D.windupS
        }
        this.glueBall()
        break
      case 'windup':
        if (this.drive) { this.glide(dt); this.glueBall() }
        if (this.t >= this.windupEndT) this.phase = 'aim'
        break
      case 'aim':
        break
      default:
        this.stepBall(dt)
    }
    this.stepGoalie(dt)
    if (this.outcome === null) this.checkEnd()
  }

  /** Fin de la conducción a mano: arranca el armado del golpeo. */
  release() {
    if (this.phase !== 'drive') return
    this.phase = 'windup'
    this.windupEndT = this.t + D.windupS
  }

  /** Conducción a mano: acelera hacia la velocidad pedida sin pasar de la distancia mínima a la línea. */
  private steer(dt: number): boolean {
    const wx = this.wantVx * D.skateSpeed - this.svx, wy = this.wantVy * D.skateSpeed - this.svy
    const dv = Math.hypot(wx, wy), maxDv = D.skateAccel * dt
    const u = dv > maxDv ? maxDv / dv : 1
    this.svx += wx * u; this.svy += wy * u
    this.sx += this.svx * dt; this.sy += this.svy * dt
    const minY = D.minDriveYM + D.ballLeadM
    if (this.sy < minY) { this.sy = minY; if (this.svy < 0) this.svy = 0 }
    return false
  }

  /** Patina hacia (x, y) frenando al llegar; true al llegar. */
  private skateTo(x: number, y: number, dt: number): boolean {
    const ex = x - this.sx, ey = y - this.sy
    const dist = Math.hypot(ex, ey)
    if (dist < 0.08) return true
    const want = Math.min(D.skateSpeed, Math.sqrt(2 * D.skateAccel * dist))
    const wx = ex / dist * want - this.svx, wy = ey / dist * want - this.svy
    const dv = Math.hypot(wx, wy), maxDv = D.skateAccel * dt
    const u = dv > maxDv ? maxDv / dv : 1
    this.svx += wx * u; this.svy += wy * u
    this.sx += this.svx * dt; this.sy += this.svy * dt
    return false
  }

  private glide(dt: number) {
    const f = Math.exp(-3 * dt)
    this.svx *= f; this.svy *= f
    this.sx += this.svx * dt; this.sy += this.svy * dt
  }

  /** Bola pegada delante del stick, mirando al centro de la portería; si toca al portero, se la queda. */
  private glueBall() {
    const d = Math.hypot(this.sx, this.sy) || 1
    this.bx = this.sx - this.sx / d * D.ballLeadM
    this.by = this.sy - this.sy / d * D.ballLeadM
    this.bz = B.radiusM
    this.vx = this.svx; this.vy = this.svy; this.vz = 0
    if (this.goalieOn && this.goalieTouchIndex() >= 0) {
      this.touchedGoalie = true
      this.lastTouch = LAST_TOUCH_GOALIE
      this.finish('held', false)
    }
  }

  private stepGoalie(dt: number) {
    if (!this.goalieOn) return
    if (this.diveDir < 0) {
      const wx = clamp((this.gTx - this.gx) * 8, -GK.latSpeed, GK.latSpeed) - this.gvx
      const wy = clamp((this.gTy - this.gy) * 8, -GK.outSpeed, GK.outSpeed) - this.gvy
      const maxDv = GK.accel * dt
      this.gvx += clamp(wx, -maxDv, maxDv)
      this.gvy += clamp(wy, -maxDv, maxDv)
    } else {
      const f = Math.exp(-10 * dt)
      this.gvx *= f; this.gvy *= f
    }
    this.gx = clamp(this.gx + this.gvx * dt, -1.5, 1.5)
    this.gy = clamp(this.gy + this.gvy * dt, GK.lineY, GK.maxOutM)
    this.shapeGoalie()
  }

  /** Recalcula las cuatro cápsulas del portero según la estirada en curso. */
  private shapeGoalie() {
    const c = this.caps
    let p = 0, f = 0, dx = 0, dz = 0
    if (this.diveDir >= 0) {
      dx = DIVE_DX[this.diveDir]; dz = DIVE_DZ[this.diveDir]
      const u = clamp((this.t - this.diveAt - GK.diveLagS) / GK.diveTimeS, 0, 1)
      p = 1 - (1 - u) * (1 - u)
      if (dz >= 0 && (dx !== 0 || dz > 0)) f = clamp((this.t - this.diveAt - GK.diveLagS - GK.diveTimeS) / GK.fallTimeS, 0, 1)
    }
    const cx = this.gx + dx * GK.bodyShiftM * p
    const cy = this.gy
    const drop = dz > 0 ? -0.12 * p : dz < 0 ? 0.35 * p : dx !== 0 ? 0.2 * p : 0
    const topZ = Math.max(GK.torsoR + 0.05, GK.torsoTopZ - drop - f * 0.45)
    const botZ = Math.max(GK.torsoR, GK.torsoBotZ - f * 0.2 - (dz < 0 ? 0.15 * p : 0))
    const lean = dx * (0.35 * p + 0.2 * f)
    setCap(c, 0, cx, cy, botZ, cx + lean, cy, topZ, GK.torsoR)
    // Patines y espinilleras a ras de suelo; en estirada baja se alargan hacia el lado
    let padA = cx - GK.padHalfW, padB = cx + GK.padHalfW
    if (dx !== 0 && dz <= 0) {
      padA = cx - dx * GK.padHalfW
      padB = cx + dx * (GK.padHalfW + GK.reachM * p * (dz < 0 ? 1 : 0.55))
    } else if (dz < 0) {
      padA -= 0.3 * p; padB += 0.3 * p
    }
    setCap(c, 1, padA, cy, GK.padZ, padB, cy, GK.padZ, GK.padR)
    // Brazo con guante: lado de la estirada (o el del guante, +x, si es recta)
    const side = dx !== 0 ? dx : 1
    const shX = cx + lean + side * 0.18, shZ = topZ - 0.05
    let gloveX = cx + side * (GK.gloveOutM + (dx !== 0 ? GK.reachM * p : 0.1 * p))
    let gloveZ = lerp(GK.gloveZ, dz > 0 ? 1.15 : dz < 0 ? 0.25 : 0.55, p)
    if (dx === 0 && dz > 0) gloveX = cx + 0.22
    gloveZ = lerp(gloveZ, 0.2, f)
    setCap(c, 2, shX, cy, shZ, gloveX, cy + 0.08, gloveZ, GK.gloveR)
    // Stick en el suelo, del lado contrario al guante (o del lado de la estirada)
    const ss = dx !== 0 ? dx : -1
    const ext = dx !== 0 && dz <= 0 ? GK.reachM * p * 0.8 : 0
    setCap(c, 3, cx + ss * 0.1, cy + 0.12, 0.06, cx + ss * (GK.stickLenM + ext), cy + 0.2, 0.06, GK.stickR)
  }

  /** Cápsula del portero que solapa la bola, o −1. */
  private goalieTouchIndex(): number {
    const c = this.caps
    for (let i = 0; i < GOALIE_CAPS; i++) {
      const o = i * CAP
      closestOnSegment(this.bx, this.by, this.bz, c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5])
      const rr = c[o + 6] + B.radiusM
      const ex = this.bx - hx, ey = this.by - hy, ez = this.bz - hz
      if (ex * ex + ey * ey + ez * ez < rr * rr) return i
    }
    return -1
  }

  /** Choque bola-cápsula: saca la bola y refleja la componente normal. Devuelve la penetración (≤ 0 sin contacto). */
  private hitCapsule(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, rest: number, keep: number): number {
    closestOnSegment(this.bx, this.by, this.bz, ax, ay, az, bx, by, bz)
    let nx = this.bx - hx, ny = this.by - hy, nz = this.bz - hz
    const rr = r + B.radiusM
    const d2 = nx * nx + ny * ny + nz * nz
    if (d2 >= rr * rr) return 0
    const d = Math.sqrt(d2)
    if (d < 1e-6) { nx = 0; ny = 1; nz = 0 } else { nx /= d; ny /= d; nz /= d }
    const pen = rr - d
    this.bx += nx * pen; this.by += ny * pen; this.bz += nz * pen
    const vn = this.vx * nx + this.vy * ny + this.vz * nz
    if (vn < 0) {
      const tx = this.vx - vn * nx, ty = this.vy - vn * ny, tz = this.vz - vn * nz
      this.vx = tx * keep - rest * vn * nx
      this.vy = ty * keep - rest * vn * ny
      this.vz = tz * keep - rest * vn * nz
    }
    return pen
  }

  private stepBall(dt: number) {
    if (this.phase === 'flight' && this.t - this.hitT <= B.spinInputWindowS) {
      this.spin = clamp(this.spin + clamp(this.spinInput, -1, 1) * B.spinInputRate * dt, -B.spinCap, B.spinCap)
    }
    this.spin *= Math.exp(-B.spinDecayPerS * dt)
    const speed = Math.hypot(this.vx, this.vy, this.vz)
    const n = clamp(Math.ceil(speed * dt / B.maxSubstepM), 1, 40)
    const h = dt / n
    for (let i = 0; i < n; i++) {
      this.integrate(h)
      if (this.outcome !== null && this.phase === 'done' && !this.crossedMouth) return
    }
  }

  /** Un subpaso de la bola: fuerzas, suelo, red, marco, portero y cruce de la línea. */
  private integrate(h: number) {
    const r = B.radiusM
    const px = this.bx, py = this.by, pz = this.bz
    const airborne = this.bz > r + 1e-4 || this.vz > 0
    if (airborne) this.vz -= B.gravity * h
    const sp = Math.hypot(this.vx, this.vy, this.vz)
    const drag = 1 / (1 + B.airDragPerM * sp * h)
    this.vx *= drag; this.vy *= drag; this.vz *= drag
    const hs = Math.hypot(this.vx, this.vy)
    if (hs > 0.5 && this.spin !== 0) {
      const a = B.curveAccel * this.spin * h / hs
      const vx0 = this.vx
      this.vx += -this.vy * a
      this.vy += vx0 * a
    }
    this.bx += this.vx * h; this.by += this.vy * h; this.bz += this.vz * h
    if (this.bz < r) {
      this.bz = r
      if (this.vz < -0.6) {
        this.vz = -this.vz * B.floorRestitution
        this.vx *= B.floorTangentKeep; this.vy *= B.floorTangentKeep
      } else this.vz = 0
    }
    if (!airborne && this.bz <= r + 1e-4) {
      const f = Math.exp(-B.rollDampPerS * h)
      this.vx *= f; this.vy *= f
    }
    if (this.crossedMouth) this.collideNet(h)
    if (this.frameOn) this.collideFrame()
    if (this.goalieOn && this.outcome === null) this.collideGoalie()
    if (py >= 0 && this.by < 0 && this.outcome === null) {
      const u = py / (py - this.by)
      const xc = px + (this.bx - px) * u, zc = pz + (this.bz - pz) * u
      if (Number.isNaN(this.crossX)) this.crossX = xc
      if (Math.abs(xc) < G.mouthHalfW && zc < G.mouthH) this.crossedMouth = true
      else this.finish(this.lastTouch === LAST_TOUCH_GOALIE ? 'save' : this.lastTouch === LAST_TOUCH_FRAME ? 'post' : 'wide', false)
    }
    if (this.outcome === null && this.crossedMouth && this.by < -r) this.finish('goal', false)
    if (!this.crossedMouth && this.by < -r && Math.abs(this.bx) < G.mouthHalfW && this.bz < G.mouthH) this.tunnel++
  }

  private collideFrame() {
    const R = G.tubeR, px = G.mouthHalfW + R, barZ = G.mouthH + R
    let pen = this.hitCapsule(-px, 0, 0, -px, 0, barZ, R, G.postRestitution, G.postTangentKeep)
    pen = Math.max(pen, this.hitCapsule(px, 0, 0, px, 0, barZ, R, G.postRestitution, G.postTangentKeep))
    pen = Math.max(pen, this.hitCapsule(-px, 0, barZ, px, 0, barZ, R, G.postRestitution, G.postTangentKeep))
    if (pen > 0) {
      this.touchedFrame = true
      this.lastTouch = LAST_TOUCH_FRAME
      this.spin *= 0.3
      if (pen > 0.6 * (R + B.radiusM)) this.tunnel++
    }
  }

  private collideGoalie() {
    const c = this.caps
    const before = Math.hypot(this.vx, this.vy, this.vz)
    for (let i = 0; i < GOALIE_CAPS; i++) {
      const o = i * CAP
      if (this.hitCapsule(c[o], c[o + 1], c[o + 2], c[o + 3], c[o + 4], c[o + 5], c[o + 6], GK.restitution, GK.tangentKeep) <= 0) continue
      this.touchedGoalie = true
      this.lastTouch = LAST_TOUCH_GOALIE
      this.spin *= 0.2
      if (before < GK.holdSpeed) {
        this.vx = 0; this.vy = 0; this.vz = 0
        this.finish('held', false)
      }
      return
    }
  }

  /** Red dentro de la portería: frena y devuelve poco; la colgante a netHangM, el fondo a ras de suelo a netFloorM. */
  private collideNet(h: number) {
    const r = B.radiusM
    const f = Math.exp(-G.netDragPerS * h)
    this.vx *= f; this.vy *= f; this.vz *= f
    const back = -lerp(G.netFloorM, G.netHangM, clamp(this.bz / G.mouthH, 0, 1)) + r
    if (this.by < back) { this.by = back; if (this.vy < 0) this.vy = -this.vy * G.netRestitution }
    const side = G.mouthHalfW - r
    if (this.bx > side) { this.bx = side; if (this.vx > 0) this.vx = -this.vx * G.netRestitution }
    if (this.bx < -side) { this.bx = -side; if (this.vx < 0) this.vx = -this.vx * G.netRestitution }
    const top = G.mouthH - r
    if (this.bz > top) { this.bz = top; if (this.vz > 0) this.vz = -this.vz * G.netRestitution }
  }

  /** Rechace que se aleja, bola muerta o tope de tiempo. */
  private checkEnd() {
    const maxS = this.finalShot ? D.finalShotMaxS : D.maxDuelS
    const touched = this.lastTouch !== LAST_TOUCH_NONE
    const rebound: SetPieceOutcome = this.lastTouch === LAST_TOUCH_GOALIE ? 'save' : 'post'
    if (this.phase === 'flight' && touched) {
      const d = Math.hypot(this.bx, this.by)
      if (d > D.reboundAwayM && this.bx * this.vx + this.by * this.vy > 0) { this.finish(rebound, true); return }
    }
    if (this.t > maxS) this.finish(touched ? rebound : 'wide', touched)
  }

  private finish(outcome: SetPieceOutcome, inPlay: boolean) {
    this.outcome = outcome
    this.phase = 'done'
    const res = this.result
    res.outcome = outcome
    res.x = this.bx; res.y = this.by
    res.vx = outcome === 'held' ? 0 : this.vx
    res.vy = outcome === 'held' ? 0 : this.vy
    res.inPlay = inPlay
    res.durationS = this.t
    res.shotSpeed = this.shotSpeed
    res.drove = this.drive
    res.touchedGoalie = this.touchedGoalie
    res.touchedFrame = this.touchedFrame
  }
}

function setCap(c: Float64Array, i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number) {
  const o = i * CAP
  c[o] = ax; c[o + 1] = ay; c[o + 2] = az; c[o + 3] = bx; c[o + 4] = by; c[o + 5] = bz; c[o + 6] = r
}
