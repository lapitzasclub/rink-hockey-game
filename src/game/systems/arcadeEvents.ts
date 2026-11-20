import * as Phaser from 'phaser'
import {
  ARCADE_EVENT_FIRST_MS,
  ARCADE_EVENT_ICE_BALL_GLIDE,
  ARCADE_EVENT_ICE_GRIP,
  ARCADE_EVENT_INTERVAL_MAX_MS,
  ARCADE_EVENT_INTERVAL_MIN_MS,
  ARCADE_EVENT_MS,
} from '../constants'
import type { ArcadeFx } from '../render/arcadeFx'
import { announce } from '../audio/announcer'
import { playEventStart } from '../audio/sounds'
import { ballMods } from './ball'
import { skateMods } from './movement'

export type MatchEventKind = 'double' | 'ice' | 'rain'

const EVENT_INFO: Record<MatchEventKind, { title: string, sub: string, color: string, status: string, call: string }> = {
  double: { title: '¡GOL DOBLE!', sub: 'CADA GOL VALE 2', color: '#ffe36a', status: 'GOL DOBLE', call: '¡Gol doble! ¡Cada gol vale dos!' },
  ice: { title: '¡PISTA DE HIELO!', sub: 'A PATINAR SIN FRENOS', color: '#a8e4ff', status: 'HIELO', call: '¡Pista de hielo! ¡Cuidado que resbala!' },
  rain: { title: '¡LLUVIA DE POWERUPS!', sub: 'A POR ELLOS', color: '#ff4fd8', status: 'LLUVIA', call: '¡Lluvia de powerups!' },
}

/** Vuelve a la física normal (fuera del juego vivo, al acabar el evento y al salir de la escena). */
export function resetArcadeMods() {
  skateMods.grip = 1
  ballMods.frictionScale = 1
}

/**
 * Eventos de partido del arcade: cada cierto tiempo de juego vivo se activa uno
 * (gol doble, pista de hielo o lluvia de powerups) durante ARCADE_EVENT_MS.
 * El tiempo solo corre con la bola en juego, así los parones no se comen el evento.
 */
export class ArcadeEvents {
  private liveMs = 0
  private nextAt = ARCADE_EVENT_FIRST_MS
  private active: { kind: MatchEventKind, until: number } | null = null
  private bag: MatchEventKind[] = []

  private readonly fx: ArcadeFx
  private readonly announcerOn: boolean

  constructor(fx: ArcadeFx, announcerOn: boolean) {
    this.fx = fx
    this.announcerOn = announcerOn
  }

  reset() {
    this.liveMs = 0
    this.nextAt = ARCADE_EVENT_FIRST_MS
    this.active = null
    this.bag = []
    this.fx.setScreenTint(null)
    resetArcadeMods()
  }

  is(kind: MatchEventKind) {
    return this.active?.kind === kind
  }

  /** Avanza un paso de juego vivo y aplica los modificadores del evento en curso. */
  step(dtMs: number) {
    this.liveMs += dtMs
    if (this.active && this.liveMs >= this.active.until) {
      this.active = null
      this.fx.setScreenTint(null)
      this.nextAt = this.liveMs + Phaser.Math.Between(ARCADE_EVENT_INTERVAL_MIN_MS, ARCADE_EVENT_INTERVAL_MAX_MS)
    }
    if (!this.active && this.liveMs >= this.nextAt) this.begin(this.draw())
    if (this.is('ice')) {
      skateMods.grip = ARCADE_EVENT_ICE_GRIP
      ballMods.frictionScale = ARCADE_EVENT_ICE_BALL_GLIDE
    }
  }

  /** Saca eventos de una bolsa barajada: no se repite ninguno hasta salir los tres. */
  private draw(): MatchEventKind {
    if (!this.bag.length) this.bag = Phaser.Utils.Array.Shuffle<MatchEventKind>(['double', 'ice', 'rain'])
    return this.bag.pop()!
  }

  private begin(kind: MatchEventKind) {
    const info = EVENT_INFO[kind]
    this.active = { kind, until: this.liveMs + ARCADE_EVENT_MS }
    playEventStart()
    this.fx.showBanner(info.title, info.color, `${info.sub} · ${Math.round(ARCADE_EVENT_MS / 1000)} s`, 1500)
    if (kind === 'ice') this.fx.setScreenTint(0x8fd8ff)
    else if (kind === 'double') this.fx.setScreenTint(0xffd84a)
    if (this.announcerOn) announce(info.call, true)
  }

  /** Texto del evento para el HUD (vacío si no hay ninguno). */
  statusLine() {
    if (!this.active) return ''
    return `★ ${EVENT_INFO[this.active.kind].status} ${Math.ceil((this.active.until - this.liveMs) / 1000)}s`
  }
}
