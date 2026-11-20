import { DIFFICULTY_LEVELS, type DifficultyLevel } from '../../game/constants'
import { AiGoalie, AiShooter, HumanGoalieSim, HumanShooterSim, SetPieceRng, type GoalieBrain, type ShooterBrain } from '../../game/setpiece/ai'
import { SETPIECE_DT, SetPieceSim } from '../../game/setpiece/sim'
import type { DrivePlan, ShotInput } from '../../game/setpiece/types'
import type { LabParams } from './labParams'

/**
 * Lote headless de lanzamientos (L-01): `?lab=setpiece&batch=N&kind=&human=&diffRed=&seed=&final=1`.
 * Juega N duelos sueltos con `setpiece/sim.ts` sin pintar, por trozos para no
 * colgar el navegador, e imprime una línea `[smoke-agg] {json}` que lee
 * `tools/bal-compare.mjs` (cada métrica como media ± IC 95 %).
 *
 * impossiblePct: goles que entran aunque el portero reaccione en el acto. Cada
 * gol se repite desde el golpeo con el portero donde estaba, sin estirada previa,
 * probando las 9 órdenes (quieto y 8 direcciones) en el instante del golpeo; si
 * ninguna lo para, era imparable (solo cuenta el retraso físico de la estirada).
 */

const CHUNK = 25
const MAX_STEPS = 60 * 12

interface Tally {
  n: number
  goal: number; save: number; post: number; wide: number; held: number
  rebound: number; impossible: number; drove: number
  speedSum: number; speedSq: number; speedN: number
  secSum: number; secSq: number
  tunnel: number
}

const prop = (k: number, n: number) => {
  const p = n > 0 ? k / n : 0
  return { mean: 100 * p, ci95: 100 * 1.96 * Math.sqrt(p * (1 - p) / Math.max(1, n)) }
}
const meanCi = (sum: number, sq: number, n: number) => {
  const m = n > 0 ? sum / n : 0
  const v = n > 1 ? Math.max(0, (sq - n * m * m) / (n - 1)) : 0
  return { mean: m, ci95: 1.96 * Math.sqrt(v / Math.max(1, n)) }
}

/** ¿Lo habría parado un portero que reacciona en el instante del golpeo? */
function savableByPerfect(atHit: SetPieceSim, probe: SetPieceSim): boolean {
  for (let dir = 0; dir < 9; dir++) {
    probe.copyFrom(atHit)
    probe.diveDir = -1
    probe.gvx = 0; probe.gvy = 0
    probe.gTx = probe.gx; probe.gTy = probe.gy
    probe.dive(dir)
    for (let i = 0; i < MAX_STEPS && probe.outcome === null; i++) probe.step(SETPIECE_DT)
    if (probe.outcome !== 'goal') return true
  }
  return false
}

/** Desvío lateral del efecto máximo (golpeo y entrada en vuelo a tope) en un tiro raso desde 7,40 m, sin portería. */
function curveMaxDeviation(sim: SetPieceSim): number {
  let worst = 0
  for (const power of [0, 0.5, 1]) {
    sim.resetFreeShot(0, 7.4)
    sim.frameOn = false
    sim.launch({ aimX: 0, aimZ: 0.1, power, curve: 1 }, false)
    sim.spinInput = 1
    for (let i = 0; i < 120 && Number.isNaN(sim.crossX); i++) sim.step(SETPIECE_DT)
    worst = Math.max(worst, Math.abs(sim.crossX))
  }
  return worst
}

export function runSetPieceBatch(params: LabParams) {
  let consoleErrors = 0
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => { consoleErrors++; origError(...args) }
  window.addEventListener('error', () => { consoleErrors++ })

  const n = Math.max(1, Math.floor(params.batch ?? 200))
  const levelIdx = Math.max(0, Math.min(3, Math.round(params.diffRed ?? 1)))
  const level: DifficultyLevel = DIFFICULTY_LEVELS[levelIdx]
  const human = params.spHuman
  const rng = new SetPieceRng(params.seed ?? 20261120)
  const aiShooter = new AiShooter(); aiShooter.level = level
  const aiGoalie = new AiGoalie(); aiGoalie.level = level
  const shooter: ShooterBrain = human === 'shooter' ? new HumanShooterSim() : aiShooter
  const goalie: GoalieBrain = human === 'goalie' ? new HumanGoalieSim() : aiGoalie
  const sim = new SetPieceSim()
  const atHit = new SetPieceSim()
  const probe = new SetPieceSim()
  const plan: DrivePlan = { drive: false, tx: 0, ty: 0, runUpM: 0 }
  const shot: ShotInput = { aimX: 0, aimZ: 0, power: 0, curve: 0 }
  const tally: Tally = {
    n: 0, goal: 0, save: 0, post: 0, wide: 0, held: 0, rebound: 0, impossible: 0, drove: 0,
    speedSum: 0, speedSq: 0, speedN: 0, secSum: 0, secSq: 0, tunnel: 0,
  }

  const playOne = () => {
    shooter.plan(params.kind, params.finalShot, rng, plan)
    sim.reset(params.kind, params.finalShot, plan)
    goalie.begin(sim, rng)
    let shotAt = false
    for (let i = 0; i < MAX_STEPS && sim.outcome === null; i++) {
      goalie.update(sim, rng)
      sim.step(SETPIECE_DT)
      if (sim.phase === 'aim') {
        shooter.shoot(sim, rng, shot)
        sim.launch(shot)
        atHit.copyFrom(sim)
        shotAt = true
      }
    }
    const res = sim.result
    tally.n++
    tally[res.outcome]++
    if ((res.outcome === 'save' || res.outcome === 'post') && res.inPlay) tally.rebound++
    if (res.drove) tally.drove++
    if (shotAt) { tally.speedSum += res.shotSpeed; tally.speedSq += res.shotSpeed * res.shotSpeed; tally.speedN++ }
    tally.secSum += res.durationS; tally.secSq += res.durationS * res.durationS
    tally.tunnel += sim.tunnel
    if (res.outcome === 'goal' && shotAt && !savableByPerfect(atHit, probe)) tally.impossible++
  }

  const finish = () => {
    const t = tally
    const agg = {
      mode: 'setpiece',
      extra: window.location.search.replace(/^\?/, ''),
      runs: t.n,
      kind: params.kind, human, level, finalShot: params.finalShot,
      goalPct: prop(t.goal, t.n), savePct: prop(t.save, t.n), postPct: prop(t.post, t.n),
      widePct: prop(t.wide, t.n), heldPct: prop(t.held, t.n), reboundPct: prop(t.rebound, t.n),
      impossiblePct: prop(t.impossible, t.n), driveShare: prop(t.drove, t.n),
      avgShotSpeed: meanCi(t.speedSum, t.speedSq, t.speedN), avgDuelSec: meanCi(t.secSum, t.secSq, t.n),
      tunnelCount: t.tunnel,
      curveMaxDev: Number(curveMaxDeviation(probe).toFixed(3)),
      consoleErrors,
    }
    console.log(`[smoke-agg] ${JSON.stringify(agg)}`)
  }

  const chunk = () => {
    try {
      const end = Math.min(n, tally.n + CHUNK)
      while (tally.n < end) playOne()
    } catch (e) {
      console.error('[sp-batch]', e)
      tally.n = n
    }
    if (tally.n < n) window.setTimeout(chunk, 0)
    else finish()
  }
  window.setTimeout(chunk, 0)
}
