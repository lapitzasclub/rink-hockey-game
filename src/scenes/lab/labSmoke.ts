import * as Phaser from 'phaser'
import { autopilot } from '../../game/systems/playerControl'
import { createMatchStats, type MatchView } from '../../game/systems/matchStats'
import { startHumanSim, type HumanKind } from './humanSim'

/**
 * Partido de humo (WP-64): IA contra IA sin humano. Observa la escena `match` en solo
 * lectura (salvo el pulso de pase del sacador azul en saques, que sustituye a la tecla)
 * y cuenta estadísticas con `matchStats` (compartido con `?stats=1`). Imprime
 * `[smoke] {json}` al cumplirse `smokeMs` de juego y una línea parcial cada 30 s.
 * Uso: `?lab=match&mode=reglamento&auto=1&smokeMs=120000`. Con `human=touch|pad` (B-02) el
 * controlado del azul lo lleva una persona simulada (humanSim) sin piloto automático, y ella
 * también saca las faltas del azul; el JSON lo registra en `human`.
 */

/** Ganchos opcionales (WP-66): `onStep` tras cada paso de juego; `onDone` al terminar (sin informe de humo). */
export interface SmokeHooks {
  onStep: (ms: number, stop: () => void) => void
  onDone: () => void
}

/**
 * Pulso de pase del sacador azul en los saques de falta: sustituye a la tecla que
 * pulsaría el humano cuando la IA juega por los dos equipos. Devuelve cómo pararlo.
 */
export function driveBlueRestarts(match: Phaser.Scene) {
  const s = match as MatchView
  const drive = () => {
    const f = s.activeFoulRestart
    const taker = f && s.players?.find(p => p.id === f.takerPlayerId)
    const press = !!(taker && taker.team === 'blue' && s.simNow >= f!.readyAt)
    // Hacia la portería rival: el azul ataca a la derecha en la 1.ª parte y a la izquierda tras el descanso
    s.joystickInput.x = press ? (taker!.side === 'right' ? -1 : 1) : 0
    s.joystickInput.y = 0
    s.joystickInput.pass = press
  }
  match.events.on(Phaser.Scenes.Events.UPDATE, drive)
  return () => { match.events.off(Phaser.Scenes.Events.UPDATE, drive) }
}

export function startSmoke(match: Phaser.Scene, mode: string, smokeMs: number, hooks?: SmokeHooks, human: HumanKind | null = null) {
  const s = match as MatchView
  autopilot.on = !human
  const stats = createMatchStats(match, mode)
  let nextPartial = 30000
  let done = false
  let errors = 0
  const onErr = () => { errors++ }
  window.addEventListener('error', onErr)
  window.addEventListener('unhandledrejection', onErr)
  const origError = console.error
  console.error = (...a: unknown[]) => { errors++; origError.apply(console, a) }

  const sim = human ? startHumanSim(match, human) : null
  const snapshot = (final: boolean) => ({ ...stats.snapshot(), consoleErrors: errors, final, ...(sim ? { human, humanActs: sim.acts } : {}) })

  const observe = (delta: number) => {
    if (done || !stats.step(delta)) return
    const ms = stats.elapsedMs()
    hooks?.onStep(ms, () => finish())
    if (done) return
    if (!hooks && ms >= nextPartial && ms < smokeMs) {
      nextPartial += 30000
      console.log('[smoke] ' + JSON.stringify(snapshot(false)))
    }
    if (ms >= smokeMs || s.matchEnded) finish()
  }

  const finish = () => {
    if (done) return
    done = true
    autopilot.on = false
    if (!hooks) console.log('[smoke] ' + JSON.stringify(snapshot(true)))
    stopDrive()
    match.events.off(Phaser.Scenes.Events.POST_UPDATE, post)
    console.error = origError
    window.removeEventListener('error', onErr)
    hooks?.onDone()
  }
  const post = (_t: number, delta: number) => observe(delta)
  const stopDrive = sim ? sim.stop : driveBlueRestarts(match)
  match.events.on(Phaser.Scenes.Events.POST_UPDATE, post)

  // Simulación acelerada: el bucle de Phaser se detiene y la escena avanza a pasos fijos sin
  // renderizar (el virtual-time de Chrome headless no da tiempo de juego fiable con Vite dev).
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    const game = match.game
    game.loop.stop()
    const STEP = 1000 / 60
    let now = game.loop.time
    const chunk = () => {
      for (let i = 0; i < 300 && !done; i++) {
        now += STEP
        match.sys.step(now, STEP)
      }
      if (!done) window.setTimeout(chunk, 0)
    }
    window.setTimeout(chunk, 0)
  })
}
