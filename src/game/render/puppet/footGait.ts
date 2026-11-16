/**
 * Locomoción a pie (WP-50): andar y correr de las figuras `official`. No es la
 * de patines (`locomotion.ts`): los pies se levantan y avanzan alternados,
 * las rodillas se doblan al elevar el pie y los brazos se balancean en
 * contrafase con las piernas. El dueño avanza la fase por distancia recorrida, de modo
 * que el pie de apoyo no resbala. Solo escribe pelvis, tronco, pies, polos de
 * rodilla y manos libres; los gestos de brazo los pone encima el orquestador.
 */
import { REFEREES } from '../artSpec'
import { standingPose } from './locomotion'
import { resetPose, type PuppetPose } from './pose'
import { rigDims } from './skeleton'

const DIMS = rigDims('official')
const R = REFEREES
/** Fracción de la longitud de la pierna que se permite estirar. */
const REACH = 0.985

const mix = (pair: readonly [number, number], t: number) => pair[0] + (pair[1] - pair[0]) * t

/**
 * Pone la pose de pie y la mueve con el paso.
 * - `phase`: fase del ciclo completo de zancada (rad).
 * - `amp`: 0 = parado, 1 = en marcha (mezcla la zancada con la postura quieta).
 * - `run`: 0 = andar, 1 = correr.
 */
export function footGait(pose: PuppetPose, phase: number, amp: number, run: number) {
  resetPose(pose)
  standingPose(pose, DIMS)
  const a = amp * mix(R.stepA, run)
  const lift = amp * mix(R.footLift, run)
  const swing = amp * mix(R.armSwing, run)
  const base = pose.pelvis.y
  const dip = amp * (0.012 + 0.02 * run) * Math.sin(phase) ** 2
  let maxY = base - dip
  const reach = (DIMS.thigh + DIMS.shin) * REACH

  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1
    const ph = phase + i * Math.PI
    const s = Math.sin(ph)
    const f = pose.feet[i]
    // z avanza con sin(ph); mientras avanza (cos > 0) el pie va en el aire
    f.z = 0.01 + a * s
    f.y = lift * Math.max(0, Math.cos(ph))
    f.yaw = side * 0.06
    // Brazo del mismo lado en contrafase con su pierna
    const h = pose.hands[i]
    h.z = 0.03 - swing * s
    h.y = 0.3 + run * amp * 0.14
    h.x = side * (0.15 - 0.02 * run * amp)
    pose.elbowPole[i].y = -0.3 + run * amp * 0.3
    // La cadera no sube más de lo que alcanza la pierna con el pie adelantado o atrasado
    const dx = f.x - side * DIMS.hipHalf
    const dz = f.z - pose.pelvis.z
    maxY = Math.min(maxY, f.y + DIMS.ankleY + Math.sqrt(Math.max(0, reach * reach - dx * dx - dz * dz)))
  }
  pose.pelvis.y = maxY
  pose.trunk.pitch = 0.06 + amp * run * 0.16
  pose.trunk.twist = amp * Math.sin(phase) * (0.05 + 0.09 * run)
}
