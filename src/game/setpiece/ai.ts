import {
  SETPIECE_BALL as B, SETPIECE_DUEL as D, SETPIECE_GOAL as G, SETPIECE_GOALIE as GK, SETPIECE_GOALIE_AI, SETPIECE_HUMAN_SIM as H,
  SETPIECE_SHOOTER_AI, type DifficultyLevel,
} from '../constants'
import { diveIndex, type SetPieceSim } from './sim'
import type { DrivePlan, SetPieceKind, ShotInput } from './types'

/**
 * Cerebros del lanzamiento. PROVISIONAL (L-01): aleatorios sencillos para que
 * el lote headless tenga duelos creíbles; L-06 escribe la IA buena (lectura del
 * regate, amagos, efecto según el portero). También la persona simulada del
 * lote. Toda la aleatoriedad sale de `SetPieceRng`, con semilla.
 */

/** mulberry32: el mismo lote con la misma semilla da el mismo resultado. */
export class SetPieceRng {
  private a: number
  constructor(seed: number) { this.a = seed | 0 }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) | 0
    let t = Math.imul(this.a ^ (this.a >>> 15), 1 | this.a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next() }
  chance(p: number): boolean { return this.next() < p }
  sign(): number { return this.next() < 0.5 ? -1 : 1 }
  /** Normal estándar (Box-Muller). */
  normal(): number {
    const u = Math.max(1e-9, this.next())
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.next())
  }
}

export interface ShooterBrain {
  plan(kind: SetPieceKind, finalShot: boolean, rng: SetPieceRng, out: DrivePlan): void
  /** Al llegar a 'aim': rellena el tiro y fija `sim.spinInput` para la ventana en vuelo. */
  shoot(sim: SetPieceSim, rng: SetPieceRng, out: ShotInput): void
}

export interface GoalieBrain {
  begin(sim: SetPieceSim, rng: SetPieceRng): void
  update(sim: SetPieceSim, rng: SetPieceRng): void
}

/** Dónde y a qué altura cruzará la bola el plano del portero (línea recta con gravedad, sin efecto). */
let predX = 0
let predZ = 0
function predictAtGoalie(sim: SetPieceSim) {
  const tau = sim.vy < -0.5 ? Math.max(0, (sim.by - sim.gy) / -sim.vy) : 0
  predX = sim.bx + sim.vx * tau
  predZ = Math.max(0, sim.bz + sim.vz * tau - 0.5 * B.gravity * tau * tau)
}

/** Estirada hacia (x, z) del plano del portero: quieto si le llega al cuerpo. */
function diveToward(sim: SetPieceSim, x: number, z: number): number {
  const off = x - sim.gx
  const dx = Math.abs(off) < 0.22 ? 0 : Math.sign(off)
  const dz = z > 0.55 ? 1 : z < 0.2 && dx !== 0 ? -1 : 0
  return diveIndex(dx, dz)
}

/** Colocación: sobre la recta bola–centro de la portería, a la profundidad elegida, sin pasar de la bola. */
function placeGoalie(sim: SetPieceSim, outDepth: number, gain: number) {
  const ty = Math.max(GK.lineY, Math.min(outDepth, sim.by - 1))
  sim.gTy = ty
  sim.gTx = sim.by > 0.1 ? sim.bx * ty / sim.by * gain : 0
}

function shotFromSide(out: ShotInput, side: number, noise: number, rng: SetPieceRng) {
  out.aimX = side * rng.range(0.5, 0.88) + rng.normal() * noise
  out.aimZ = (rng.chance(0.6) ? rng.range(0.06, 0.35) : rng.range(0.55, 0.9)) + rng.normal() * noise * 0.6
}

/** Lado libre: el contrario al que tapa el portero respecto de la recta del tiro. */
function freeSide(sim: SetPieceSim): number {
  const lineX = sim.by > 0.1 ? sim.bx * sim.gy / sim.by : 0
  return sim.gx > lineX ? -1 : 1
}

export class AiShooter implements ShooterBrain {
  level: DifficultyLevel = 'normal'
  plan(kind: SetPieceKind, finalShot: boolean, rng: SetPieceRng, out: DrivePlan) {
    const p = SETPIECE_SHOOTER_AI[this.level]
    out.drive = !finalShot && rng.chance(p.driveChance)
    out.ty = rng.range(2, 4)
    out.tx = rng.range(-0.8, 0.8)
    out.runUpM = kind === 'direct' ? rng.range(0, D.runUpMaxM) : 0
  }
  shoot(sim: SetPieceSim, rng: SetPieceRng, out: ShotInput) {
    const p = SETPIECE_SHOOTER_AI[this.level]
    const side = rng.chance(p.readGoalieChance) ? freeSide(sim) : rng.sign()
    shotFromSide(out, side, p.aimNoise, rng)
    out.power = rng.range(p.powerMin, p.powerMax)
    out.curve = rng.chance(p.curveChance) ? side * rng.range(0.3, p.curveMax) : 0
    sim.spinInput = out.curve !== 0 && rng.chance(0.5) ? Math.sign(out.curve) * rng.range(0.3, 1) : 0
  }
}

export class HumanShooterSim implements ShooterBrain {
  plan(kind: SetPieceKind, finalShot: boolean, rng: SetPieceRng, out: DrivePlan) {
    out.drive = !finalShot && rng.chance(H.shooterDriveChance)
    out.ty = rng.range(2, 4)
    out.tx = rng.range(-0.8, 0.8)
    out.runUpM = kind === 'direct' ? rng.range(1, D.runUpMaxM) : 0
  }
  shoot(sim: SetPieceSim, rng: SetPieceRng, out: ShotInput) {
    const side = rng.chance(0.5) ? freeSide(sim) : rng.sign()
    shotFromSide(out, side, H.shooterAimNoise, rng)
    out.power = rng.range(H.shooterPowerMin, H.shooterPowerMax)
    out.curve = rng.chance(H.shooterCurveChance) ? rng.range(-1, 1) : 0
    // La persona suele apretar el efecto en vuelo hacia el mismo lado
    sim.spinInput = out.curve !== 0 ? Math.sign(out.curve) * rng.range(0, 1) : 0
  }
}

export class AiGoalie implements GoalieBrain {
  level: DifficultyLevel = 'normal'
  private outDepth = GK.lineY
  private errX = 0
  private errZ = 0
  begin(_sim: SetPieceSim, rng: SetPieceRng) {
    const p = SETPIECE_GOALIE_AI[this.level]
    this.outDepth = rng.chance(p.outChance) ? rng.range(p.outMinM, p.outMaxM) : GK.lineY
    this.errX = rng.normal() * p.readErrM
    this.errZ = rng.normal() * p.heightErrM
  }
  update(sim: SetPieceSim, _rng: SetPieceRng) {
    const p = SETPIECE_GOALIE_AI[this.level]
    if (sim.phase !== 'flight') { placeGoalie(sim, this.outDepth, p.trackGain); return }
    if (sim.diveDir >= 0 || sim.t < sim.hitT + p.readDelayS) return
    predictAtGoalie(sim)
    const x = predX + this.errX, z = predZ + this.errZ
    sim.gTx = Math.max(-G.mouthHalfW, Math.min(G.mouthHalfW, x))
    sim.dive(diveToward(sim, x, z))
  }
}

export class HumanGoalieSim implements GoalieBrain {
  private react = 0.25
  private sideOk = true
  private heightOk = true
  private early = false
  private outDepth = GK.lineY
  begin(_sim: SetPieceSim, rng: SetPieceRng) {
    this.react = rng.range(H.goalieReactMinS, H.goalieReactMaxS)
    this.sideOk = rng.chance(H.goalieSideOk)
    this.heightOk = rng.chance(H.goalieHeightOk)
    this.early = rng.chance(H.goalieEarlyChance)
    this.outDepth = rng.chance(H.goalieOutChance) ? rng.range(0.3, H.goalieOutMaxM) : GK.lineY
  }
  update(sim: SetPieceSim, rng: SetPieceRng) {
    if (sim.diveDir >= 0) return
    // Se tira antes del golpeo, a un lado al azar (lo que el lanzador castiga)
    if (this.early && sim.phase === 'windup') { sim.dive(diveIndex(rng.sign(), rng.chance(0.5) ? 0 : 1)); return }
    if (sim.phase !== 'flight') { placeGoalie(sim, this.outDepth, 0.8); return }
    if (sim.t < sim.hitT + this.react) return
    predictAtGoalie(sim)
    let x = predX, z = predZ
    if (!this.sideOk) x = sim.gx - (x - sim.gx)
    if (!this.heightOk) z = z > 0.55 ? 0.1 : 0.8
    sim.dive(diveToward(sim, x, z))
  }
}
