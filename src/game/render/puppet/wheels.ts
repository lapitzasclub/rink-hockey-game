/**
 * Giro de las ruedas de los patines (E-18): acumula la distancia que rueda cada
 * jugador y la pasa a ángulo de rueda en `pose.wheels`, que el rig convierte en
 * una de las fases horneadas del patín. Estado solo de pintado (como la fase de
 * zancada): con dt = 0 (lab, pausa) la rueda no avanza.
 */
import type { Player } from '../../types'
import { SKATE } from './gearSpec'
import type { PoseContext, PuppetPose } from './pose'
import { FIGURE_PX } from './textures'

interface WheelState { spin: number; blur: boolean }

const states = new WeakMap<Player, WheelState>()
/** Radio de la rueda en px de mundo a escala 1. */
const WHEEL_PX = SKATE.wheelR * FIGURE_PX
/** Tope del ángulo acumulado: múltiplo de π para no saltar de fase al recortarlo. */
const WRAP = Math.PI * 64
/** Por debajo de esta fracción del umbral la rueda deja de verse corrida (sin parpadeo en el borde). */
const BLUR_OFF = 0.8
/** Cadencia de referencia para decidir el emborronado cuando dt = 0. */
const NOMINAL_DT = 1000 / 60

function stateOf(p: Player): WheelState {
  let st = states.get(p)
  if (!st) {
    // Fase inicial propia por id: en el saque no todas las ruedas marcan igual
    let h = 0
    for (let i = 0; i < p.id.length; i++) h = (h * 31 + p.id.charCodeAt(i)) | 0
    st = { spin: ((h >>> 0) % 97) / 97 * Math.PI, blur: false }
    states.set(p, st)
  }
  return st
}

/**
 * Avanza el giro con la velocidad del jugador. El patinador rueda con toda su
 * marcha (sus patines siguen la trayectoria; hacia atrás, al revés); el portero
 * solo con lo que avanza, porque de lado arrastra los patines.
 */
export function spinWheels(pose: PuppetPose, ctx: PoseContext) {
  const st = stateOf(ctx.player)
  const speed = Math.hypot(ctx.velForward, ctx.velRight)
  const roll = ctx.kind === 'goalie' ? ctx.velForward : ctx.velForward < -0.2 * speed ? -speed : speed
  const rate = roll / WHEEL_PX
  st.spin = (st.spin + (rate * ctx.dt) / 1000) % WRAP
  // El umbral es por fotograma: a menos fps la marca salta más y se emborrona antes
  const step = Math.abs(rate) * (ctx.dt > 0 ? ctx.dt : NOMINAL_DT) / 1000
  const limit = (SKATE.blurRate * NOMINAL_DT) / 1000
  st.blur = st.blur ? step > limit * BLUR_OFF : step > limit
  pose.wheels.spin = st.spin
  pose.wheels.blur = st.blur
}
