import * as Phaser from 'phaser'
import { GAME_HEIGHT, GAME_WIDTH, RINK } from '../constants'
import type { TeamColor } from '../types'
import { RINK_CORNER_R, roundedRectWorldPts } from './drawRink'
import { CROWD, DEPTH, FLOOR_STYLE } from './artSpec'
import { project } from './viewTransform'
import { crowdAnimated } from './quality'
import { mulberry32 } from './stands/layout'
import { placeStands, showCheerFrame } from './stands/crowd'

export { ARENA_BOUNDS } from './stands/layout'

type Pt = { x: number, y: number }

/** Pabellón alrededor de la pista: suelo de la pista, gradas y público animado. */
export type Arena = {
  /** excitement 0..1: amplitud y ritmo del vaivén del público. */
  update(time: number, excitement: number): void
  /** El público salta unos segundos (goles, final); con `team`, sobre todo su peña. */
  cheer(time: number, durationMs?: number, team?: TeamColor | null): void
  /** Calidad baja: el público neutro se queda quieto (vuelve a su sitio); las peñas siguen, más calmadas. */
  setCrowdAnimated(on: boolean): void
}

const FLOOR_KEY = 'arena-floor'
/** Un `cheer` sin equipo justo después de uno con equipo no lo borra (el evento de gol puede llegar antes). */
const TEAM_KEEP_MS = 200

const pending = new WeakMap<Phaser.Scene, { team: TeamColor | null, durationMs: number }>()

/**
 * Hace saltar al público de la escena (laboratorio: `cheer=`). Si el pabellón
 * aún no existe, se aplica en su primer fotograma.
 */
export function cheerCrowd(scene: Phaser.Scene, team: TeamColor | null, durationMs: number = CROWD.cheerMs) {
  pending.set(scene, { team, durationMs })
}

export function createArena(scene: Phaser.Scene): Arena {
  paintFloor(scene)
  // Calidad baja al crear: obra con el público neutro horneado y solo las peñas animadas
  const lite = !crowdAnimated()
  const stands = placeStands(scene, lite)
  /** Se mece todo el público (si no, solo las peñas). */
  let full = !lite
  let cheerUntil = 0
  let cheerTeam: TeamColor | null = null
  let teamAt = -Infinity
  let lastTime = 0

  const restNeutral = () => {
    for (const live of stands.blocks) if (live.block.team === null) live.img.y = live.baseY
  }

  const arena: Arena = {
    update(time, excitement) {
      lastTime = time
      const p = pending.get(scene)
      if (p) {
        pending.delete(scene)
        arena.cheer(time, p.durationMs, p.team)
      }
      const left = cheerUntil - time
      const cheering = left > 0
      // El salto se apaga en el último tramo para no cortar en seco
      const fade = cheering ? Math.min(1, left / CROWD.cheerFadeMs) : 0
      const idleAmp = (CROWD.idleAmp + excitement * CROWD.idleExcite) * (full ? 1 : CROWD.liteIdleK)
      const idleFreq = (CROWD.idleFreq + excitement * CROWD.idleFreqExcite) * (full ? 1 : CROWD.liteFreqK)
      for (const live of stands.blocks) {
        const team = live.block.team
        if (!full && team === null) continue
        const mine = cheering && cheerTeam !== null && team === cheerTeam
        showCheerFrame(live, mine)
        let amp = idleAmp
        let freq = idleFreq
        if (cheering) {
          if (mine) { amp = idleAmp + (CROWD.cheerAmpPena - idleAmp) * fade; freq = CROWD.cheerFreq }
          else if (team !== null && cheerTeam !== null) amp = idleAmp * 0.4
          else { amp = idleAmp + (CROWD.cheerAmp - idleAmp) * fade; freq = CROWD.cheerFreq }
        }
        live.img.y = live.baseY - Math.abs(Math.sin(time * freq + live.block.phase)) * amp
      }
      const arms = stands.arms
      if (arms) {
        arms.setVisible(cheering)
        if (cheering) {
          arms.setAlpha(fade)
          arms.y = stands.armsBaseY - Math.abs(Math.sin(time * CROWD.cheerFreq * 0.8)) * CROWD.cheerAmp * 0.6
        }
      }
    },
    cheer(time, durationMs = CROWD.cheerMs, team?: TeamColor | null) {
      cheerUntil = time + durationMs
      if (team !== undefined) {
        cheerTeam = team
        teamAt = time
      } else if (time - teamAt > TEAM_KEEP_MS) cheerTeam = null
    },
    setCrowdAnimated(on) {
      full = on && !lite
      if (!full) restNeutral()
    },
  }

  const onGoal = ({ team }: { team: TeamColor }) => arena.cheer(lastTime, CROWD.cheerMs, team)
  scene.events.on('match:goal', onGoal)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off('match:goal', onGoal)
  })
  return arena
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Pt[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

function rinkScreenOutline() {
  return roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 14)
    .map(p => project(p.x, p.y, 0))
}

// ─── Suelo ────────────────────────────────────────────────────────────────────

/**
 * Pista de hockey patines: suelo sintético azul pintado (no hielo), con
 * degradado casi uniforme, grano, marcas de ruedas y los
 * reflejos de los focos del techo.
 */
function paintFloor(scene: Phaser.Scene) {
  if (!scene.textures.exists(FLOOR_KEY)) {
    const tex = scene.textures.createCanvas(FLOOR_KEY, GAME_WIDTH, GAME_HEIGHT)
    if (!tex) return
    const ctx = tex.getContext()
    const rand = mulberry32(23)
    const outline = rinkScreenOutline()
    const top = project(0, RINK.y).y
    const bottom = project(0, RINK.y + RINK.height).y

    ctx.save()
    tracePath(ctx, outline)
    ctx.clip()

    const grad = ctx.createLinearGradient(0, top, 0, bottom)
    grad.addColorStop(0, FLOOR_STYLE.colorFar)
    grad.addColorStop(0.5, FLOOR_STYLE.colorMid)
    grad.addColorStop(1, FLOOR_STYLE.colorNear)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Grano de la pintura
    for (let i = 0; i < FLOOR_STYLE.grainCount; i++) {
      const x = rand() * GAME_WIDTH
      const y = top + rand() * (bottom - top)
      ctx.fillStyle = rand() < 0.5 ? FLOOR_STYLE.grainLight : FLOOR_STYLE.grainDark
      ctx.fillRect(x, y, 1 + rand() * 1.5, 1)
    }

    // Marcas de ruedas: arcos suaves claros
    ctx.lineWidth = 1.2
    for (let i = 0; i < 90; i++) {
      const c = project(RINK.x + rand() * RINK.width, RINK.y + rand() * RINK.height)
      const r = 30 + rand() * 90
      const a0 = rand() * Math.PI * 2
      ctx.strokeStyle = `rgba(190,215,255,${0.025 + rand() * 0.035})`
      ctx.beginPath()
      ctx.ellipse(c.x, c.y, r, r * 0.55, 0, a0, a0 + 0.6 + rand() * 1.2)
      ctx.stroke()
    }

    // Reflejos de los focos (barniz brillante)
    for (const fy of FLOOR_STYLE.spotsY) {
      for (const fx of FLOOR_STYLE.spotsX) {
        const c = project(RINK.x + RINK.width * fx, RINK.y + RINK.height * fy)
        const r = 120 + fy * 90
        ctx.save()
        ctx.translate(c.x, c.y)
        ctx.scale(1, 0.4)
        const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, r)
        rg.addColorStop(0, `rgba(255,255,255,${FLOOR_STYLE.spotAlpha})`)
        rg.addColorStop(0.35, 'rgba(200,225,255,0.05)')
        rg.addColorStop(1, 'rgba(200,225,255,0)')
        ctx.fillStyle = rg
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
    }

    // Sombra interior junto a los tableros
    for (let k = 0; k < 6; k++) {
      ctx.lineWidth = 6 + k * 9
      ctx.strokeStyle = 'rgba(0,8,26,0.07)'
      tracePath(ctx, outline)
      ctx.stroke()
    }
    ctx.restore()
    tex.refresh()
  }
  scene.add.image(0, 0, FLOOR_KEY).setOrigin(0, 0).setDepth(DEPTH.FLOOR)
}
