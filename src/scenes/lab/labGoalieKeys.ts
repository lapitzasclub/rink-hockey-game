import * as Phaser from 'phaser'
import { GAME_HEIGHT, GOALIE_HUMAN_MAX_Y, GOALIE_SELECT_RANGE } from '../../game/constants'
import { codesFor, type BindAction } from '../../game/input/keyBindings'
import { getControllablePlayers } from '../../game/systems/playerHelpers'
import type { Player } from '../../game/types'
import { getGoalLineX } from '../../game/utils'
import { driveBlueRestarts } from './labSmoke'

/**
 * Prueba del portero seleccionable con teclado (E-03): con `?lab=match&goalieKeys=1` (sin auto)
 * simula 4 min a paso fijo y pulsa teclas reales (eventos de teclado en window, por el mismo
 * camino que el humano: KeyboardPlugin y las teclas asignadas) e imprime `[gkeys] …`:
 * 1. con la bola cerca de la portería azul, «Pase · cambio» debe pasar el control al portero;
 * 2. arriba y abajo lo mueven dentro de su zona;
 * 3. al soltar la bola (pase) o al volver a pulsar cambio, el control vuelve a un jugador de campo.
 */

type KView = Phaser.Scene & {
  players: Player[]
  controlledPlayerIndex: number
  ballCarrierId: string | null
  ball: { x: number, y: number }
  activeFoulRestart: unknown
  activeBully: unknown
  activeKickoff: unknown
  restartAt: number
  simNow: number
}

function sendKey(type: 'keydown' | 'keyup', action: BindAction) {
  const code = codesFor(action)[0]
  const ev = new KeyboardEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(ev, 'keyCode', { get: () => code })
  Object.defineProperty(ev, 'which', { get: () => code })
  window.dispatchEvent(ev)
}

export function startGoalieKeyTest(match: Phaser.Scene) {
  const s = match as KView
  const log = (msg: string, extra: object = {}) => console.log('[gkeys] ' + JSON.stringify({ t: Math.round(s.simNow), msg, ...extra }))
  let phase = 'wait'
  let at = 0
  let y0 = 0
  let yUp = 0
  let beatAt = 0
  const controlled = () => {
    const list = getControllablePlayers(s.players)
    return list[s.controlledPlayerIndex % list.length]
  }
  const goalie = () => s.players.find(p => p.team === 'blue' && p.role === 'goalie')!
  // Pulsación corta: se suelta a los pocos pasos de simulación
  let pendingUp: BindAction | null = null
  let upAt = 0
  const tap = (action: BindAction) => {
    sendKey('keydown', action)
    pendingUp = action
    upAt = s.simNow + 70
  }

  const step = () => {
    if (!s.players?.length) return
    const now = s.simNow
    if (pendingUp && now >= upAt) { sendKey('keyup', pendingUp); pendingUp = null }
    const live = !s.activeFoulRestart && !s.activeBully && !s.activeKickoff && s.restartAt <= 0
    const g = goalie()
    const cy = GAME_HEIGHT / 2
    const near = Math.hypot(s.ball.x - getGoalLineX(g.side), s.ball.y - cy) < GOALIE_SELECT_RANGE
    if (now >= beatAt) { beatAt = now + 5000; log('latido', { phase, live, ball: [Math.round(s.ball.x), Math.round(s.ball.y)], c: controlled().id }) }
    switch (phase) {
      case 'wait':
        if (live && near && s.ballCarrierId !== g.id && controlled().role !== 'goalie') {
          log('cambio pulsado cerca de la portería', { antes: controlled().id })
          tap('pass')
          phase = 'checkSwitch'
          at = now
        }
        break
      case 'checkSwitch':
        if (now - at < 300) break
        log(controlled() === g ? 'OK control en el portero' : 'FALLO no pasó al portero', { ahora: controlled().id })
        if (controlled() !== g) { phase = 'wait'; break }
        y0 = g.pos.y
        sendKey('keydown', 'up')
        phase = 'up'
        at = now
        break
      case 'up':
        if (controlled() !== g) { log('soltado antes de mover (ritual o pase)', { ahora: controlled().id }); phase = 'wait'; break }
        if (now - at < 500) break
        sendKey('keyup', 'up')
        yUp = g.pos.y
        sendKey('keydown', 'down')
        phase = 'down'
        at = now
        break
      case 'down':
        if (controlled() !== g) { sendKey('keyup', 'down'); log('soltado durante la prueba', { ahora: controlled().id }); phase = 'wait'; break }
        if (now - at < 1500) break
        sendKey('keyup', 'down')
        log('movimiento con teclado', {
          dyArriba: Math.round(yUp - y0), dyAbajo: Math.round(g.pos.y - yUp),
          dentroZona: Math.abs(g.pos.y - cy) <= GOALIE_HUMAN_MAX_Y + 0.5, x: Math.round(g.pos.x),
        })
        phase = 'hold'
        at = now
        break
      case 'hold':
        // Si para y se queda la bola: pase con la tecla y el control vuelve al campo
        if (s.ballCarrierId === g.id && now - at > 200 && controlled() === g) {
          log('portero con la bola: pase pulsado')
          tap('pass')
          phase = 'checkRelease'
          at = now
        } else if (controlled() !== g) {
          log('control devuelto sin pulsar (ritual o soltó)', { ahora: controlled().id })
          phase = 'switchBack'
          at = now
        } else if (now - at > 8000) {
          log('sin parada en 8 s: cambio pulsado para volver')
          tap('pass')
          phase = 'checkRelease'
          at = now
        }
        break
      case 'checkRelease':
        if (now - at < 400) break
        log(controlled() !== g ? 'OK control de vuelta al campo' : 'FALLO sigue en el portero', { ahora: controlled().id, carrier: s.ballCarrierId })
        phase = 'switchBack'
        at = now
        break
      case 'switchBack':
        if (now - at > 3000) { phase = 'wait'; at = now }
        break
    }
  }
  match.events.on(Phaser.Scenes.Events.POST_UPDATE, step)
  // Los saques de falta azules los saca el piloto de restarts del humo (el humano no está)
  driveBlueRestarts(match)

  // Simulación acelerada como en el humo. El gestor de teclado procesa cada evento al llegar,
  // pero solo vacía su cola en POST_STEP del juego, que con el bucle parado no llega: se vacía
  // aquí, o cada pulsación nueva reprocesaría las viejas (y «recién pulsado» saltaría a cada paso)
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    const game = match.game
    game.loop.stop()
    const STEP = 1000 / 60
    let now = game.loop.time
    let steps = 0
    const manager = match.input.manager as unknown as { keyboard: { queue: KeyboardEvent[] } | null }
    const chunk = () => {
      for (let i = 0; i < 300; i++) {
        now += STEP
        match.sys.step(now, STEP)
        if (manager.keyboard) manager.keyboard.queue.length = 0
      }
      if ((steps += 300) < 60 * 240) window.setTimeout(chunk, 0)
    }
    window.setTimeout(chunk, 0)
  })
}
