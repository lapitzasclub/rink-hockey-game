import * as Phaser from 'phaser'
import { worldToScreen } from '../../game/render/viewTransform'
import type { LabParams } from './labParams'
import type { SmokeHooks } from './labSmoke'

/**
 * Capturas por evento (WP-66): bloqueo de la cámara principal del partido, `follow=` y `at=`.
 * Lee por nombre campos privados de MatchScene/Officials (solo lab, solo lectura).
 */

/** Tiempo máximo de juego esperando el evento antes de congelar igualmente. */
const AT_TIMEOUT_MS = 180000
/** Desplazamiento vertical (px de pantalla) para encuadrar el torso y no los pies. */
const FOLLOW_LIFT = 24

type Team = 'blue' | 'red'
interface Pos { x: number, y: number }
type MatchView = Phaser.Scene & {
  labCameraLock: boolean
  ball: Pos
  ballVelocity: Pos
  ballCarrierId: string | null
  players: Array<{ id: string, team: Team, role: string, pos: Pos, suspendedUntil?: number }>
  blueScore: number
  redScore: number
  lastTouch: Team
  ruleState: { teamFouls: Record<Team, number> }
  activeFoulRestart: unknown
  officials?: { refs?: Array<{ x: number, y: number, gesture: unknown }> }
}

/** ¿Pide esta URL tocar la cámara principal del partido? */
export const wantsCameraLock = (p: LabParams) => p.zoom !== null || p.cx !== null || p.cy !== null || p.follow !== null

/** Posición en pantalla del objeto de `follow`, o null si no hay (el árbitro cae a la bola). */
function followPoint(s: MatchView, follow: string | null): Pos | null {
  if (!follow) return null
  let w: Pos | null = null
  if (follow === 'referee') {
    const refs = s.officials?.refs
    if (refs?.length) {
      const near = (r: Pos) => Math.hypot(r.x - s.ball.x, r.y - s.ball.y)
      const r = refs.find(f => f.gesture) ?? refs.reduce((a, b) => (near(a) < near(b) ? a : b))
      w = { x: r.x, y: r.y }
    }
  } else if (follow === 'goalie-blue' || follow === 'goalie-red') {
    const g = s.players?.find(p => p.role === 'goalie' && p.team === follow.slice(7))
    if (g) w = g.pos
  }
  w ??= s.ball
  const p = worldToScreen(w.x, w.y)
  return { x: p.x, y: p.y - FOLLOW_LIFT }
}

/** Coloca la cámara principal según zoom/cx/cy/follow; `useFollow` solo al congelar. */
function placeCamera(s: MatchView, p: LabParams, useFollow: boolean) {
  const cam = s.cameras.main
  if (p.zoom !== null) cam.setZoom(p.zoom)
  const target = useFollow ? followPoint(s, p.follow) : null
  if (target) { cam.centerOn(target.x, target.y); return }
  if (p.cx !== null || p.cy !== null) {
    const w = worldToScreen(p.cx ?? 640, p.cy ?? 360)
    cam.centerOn(p.cx !== null ? w.x : cam.midPoint.x, p.cy !== null ? w.y : cam.midPoint.y)
  }
}

/** Bloquea la cámara al crearse el partido y la recoloca tras cada paso (arcade la mueve en saques). */
export function lockMatchCamera(match: Phaser.Scene, p: LabParams) {
  const s = match as MatchView
  match.events.once(Phaser.Scenes.Events.CREATE, () => {
    s.labCameraLock = true
    placeCamera(s, p, false)
    match.events.on(Phaser.Scenes.Events.POST_UPDATE, () => { if (s.labCameraLock) placeCamera(s, p, false) })
  })
}

/** Congela el partido: centra en `follow` y pausa la escena. */
export function freezeMatch(match: Phaser.Scene, p: LabParams) {
  const s = match as MatchView
  if (p.follow) {
    s.labCameraLock = true
    placeCamera(s, p, true)
  }
  match.game.scene.pause('match')
}

/**
 * Ganchos para el paso fijo del humo: detectan el evento `at`, dejan pasar `after` ms
 * y congelan. Tras detener el bucle manual se reanuda el de Phaser para que se renderice.
 */
export function atHooks(match: Phaser.Scene, p: LabParams): SmokeHooks {
  const s = match as MatchView
  const at = p.at ?? ''
  const atMs = /^\d+(\.\d+)?$/.test(at) ? Number(at) : null
  const prev = { goals: 0, fouls: 0, foul: false, susp: new Map<string, number>(), carrierGk: false, speed: 0 }
  let hitMs: number | null = null

  const detect = (ms: number): boolean => {
    const goals = s.blueScore + s.redScore
    const fouls = s.ruleState.teamFouls.blue + s.ruleState.teamFouls.red
    const foulNow = !!s.activeFoulRestart
    const carrier = s.ballCarrierId ? s.players.find(q => q.id === s.ballCarrierId) : undefined
    const gk = carrier?.role === 'goalie' && carrier.team !== s.lastTouch
    let carded = false
    for (const q of s.players) {
      const su = q.suspendedUntil ?? 0
      if (su > (prev.susp.get(q.id) ?? 0) && su > s.time.now) carded = true
      prev.susp.set(q.id, su)
    }
    const hit = atMs !== null ? ms >= atMs
      : at === 'goal' ? goals > prev.goals
      : at === 'foul' ? fouls > prev.fouls || (foulNow && !prev.foul)
      : at === 'card' ? carded
      : at === 'save' ? gk && !prev.carrierGk && prev.speed > 150
      : false
    prev.goals = goals; prev.fouls = fouls; prev.foul = foulNow; prev.carrierGk = !!gk
    prev.speed = Math.hypot(s.ballVelocity.x, s.ballVelocity.y)
    return hit
  }

  return {
    onStep: (ms, stop) => {
      if (hitMs === null) {
        if (detect(ms)) { hitMs = ms; console.log(`[at] ${at} t=${Math.round(ms)}`) }
        else if (ms >= AT_TIMEOUT_MS) { console.log('[at] timeout'); stop() }
      }
      if (hitMs !== null && ms >= hitMs + p.after) stop()
    },
    onDone: () => {
      freezeMatch(match, p)
      const g = match.game
      g.loop.start(g.step.bind(g))
    },
  }
}
