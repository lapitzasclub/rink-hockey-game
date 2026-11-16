import * as Phaser from 'phaser'
import { DEPTH, FIGURE_EXAG, PLAYER_HEIGHT_M, PX_PER_M } from '../../game/render/artSpec'
import { buildParts, type Kit } from './style/parts'
import { paintPixel } from './style/paintPixel'
import { paintVector } from './style/paintVector'
import { goalieSkeleton, refSkeleton, skaterSkeleton, type FigureKind, type Proportions } from './style/rig'

/**
 * Prototipos de estilo del WP-20 (SPEC §4): los estilos A, B y C dibujados
 * en filas sobre la pista a s = 1, con un recuadro ×3 por estilo. Desechable
 * salvo el estilo ganador; sin animación ni rig real.
 */

type StyleId = 'A' | 'B' | 'C'

const STYLES: Record<StyleId, { title: string; props: Proportions }> = {
  A: { title: 'A · Cartoon limpio  1:4,5 · plano + 1 sombra', props: { heads: 4.5, limb: 1.2, skate: 0.08, headAspect: 1.06 } },
  B: { title: 'B · Pixel-art HD  1:5 · rejilla nativa, nearest', props: { heads: 5, limb: 1.1, skate: 0.075, headAspect: 1 } },
  C: { title: 'C · Semirrealista TV  1:6,5 · degradado suave', props: { heads: 6.5, limb: 0.9, skate: 0.06, headAspect: 0.9 } },
}

/** Altura de pie en px a s = 1: la misma que el jugador real en el centro. */
const FIGURE_H = PLAYER_HEIGHT_M * PX_PER_M * FIGURE_EXAG
const INSET_SCALE = 3

const SKINS = [0xf1c7a1, 0xc98d62, 0x8d5a3b, 0xe2ab80]
const HAIRS = [0x2a1b12, 0x6b4426, 0xd8b46a, 0x121212]

const TEAM = {
  blue: { jersey: 0x3399ff, shorts: 0x15316a, socks: 0x15316a, gloves: 0x15316a, numColor: 0xffffff, trim: 0x15316a },
  red: { jersey: 0xff3333, shorts: 0xf2efe9, socks: 0xf2efe9, gloves: 0x8a1420, numColor: 0xffffff, trim: 0x8a1420 },
} as const

interface Fig {
  kind: FigureKind
  team: keyof typeof TEAM
  yaw: number
  helmet: boolean
  hand: 'L' | 'R'
  look: number
  num: string
  caption: string
}

const Q = 0.8
const FIGS: Fig[] = [
  { kind: 'skater', team: 'blue', yaw: 0, helmet: true, hand: 'R', look: 0, num: '7', caption: 'casco\nfrente' },
  { kind: 'skater', team: 'blue', yaw: Q, helmet: true, hand: 'R', look: 1, num: '10', caption: 'casco\n3/4' },
  { kind: 'skater', team: 'blue', yaw: Math.PI, helmet: true, hand: 'R', look: 2, num: '7', caption: 'casco\nespalda' },
  { kind: 'skater', team: 'blue', yaw: Q, helmet: false, hand: 'R', look: 2, num: '4', caption: 'sin\n3/4' },
  { kind: 'skater', team: 'red', yaw: 0, helmet: false, hand: 'L', look: 3, num: '9', caption: 'sin\nfrente' },
  { kind: 'skater', team: 'red', yaw: -Q, helmet: false, hand: 'R', look: 0, num: '11', caption: 'sin\n3/4' },
  { kind: 'skater', team: 'red', yaw: Math.PI, helmet: false, hand: 'R', look: 1, num: '9', caption: 'sin\nespalda' },
  { kind: 'skater', team: 'red', yaw: -Q, helmet: true, hand: 'R', look: 2, num: '5', caption: 'casco\n3/4' },
  { kind: 'goalie', team: 'blue', yaw: 0, helmet: true, hand: 'R', look: 1, num: '1', caption: 'portero\nrodillas' },
  { kind: 'ref', team: 'blue', yaw: 0.6, helmet: false, hand: 'R', look: 0, num: '', caption: 'árbitro\na pie' },
]
/** Posición x de cada figura en las filas (grupos azul, rojo y portero+árbitro). */
const FIG_X = [210, 252, 294, 336, 394, 436, 478, 520, 582, 640]
/** Figuras ampliadas: casco frente a sin casco (D4) y el portero. */
const INSET_FIGS = [1, 5, 8]
const INSET_X = [770, 895, 1020]
const ROW_FEET_Y: Record<StyleId, number> = { A: 238, B: 410, C: 582 }
const PANEL = { x: 700, w: 395, above: 158, below: 12, feetLift: 16 } as const

const TEXT_STYLE = { fontFamily: '"Courier New", Courier, monospace', color: '#ffffff', stroke: '#06101a' }

function kitOf(f: Fig): Kit {
  const t = TEAM[f.team]
  return {
    ...t,
    helmet: f.helmet ? t.jersey : null,
    number: f.num,
    skin: SKINS[f.look % SKINS.length],
    hair: HAIRS[f.look % HAIRS.length],
  }
}

function skeletonOf(f: Fig, p: Proportions) {
  if (f.kind === 'goalie') return goalieSkeleton(p)
  if (f.kind === 'ref') return refSkeleton(p)
  return skaterSkeleton(p, f.hand)
}

/** Genera (una vez) la textura de una figura y devuelve su origen relativo en los pies. */
function figureTexture(scene: Phaser.Scene, style: StyleId, i: number, scale: number) {
  const key = `wp20-${style}-${i}-${scale}`
  const w = Math.ceil(FIGURE_H * 1.25 * scale)
  const h = Math.ceil(FIGURE_H * 1.3 * scale)
  const ox = Math.round(w / 2)
  const oy = h - Math.ceil(FIGURE_H * 0.26 * scale)
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w, h)
    if (!tex) throw new Error(`no se pudo crear ${key}`)
    const f = FIGS[i]
    const P = STYLES[style].props
    const parts = buildParts(skeletonOf(f, P), kitOf(f), P, f.yaw, FIGURE_H)
    if (style === 'B') {
      const img = tex.context.createImageData(w, h)
      paintPixel(img, parts, ox, oy)
      tex.context.putImageData(img, 0, 0)
      tex.refresh()
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST)
    } else {
      paintVector(tex.context, parts, ox, oy, scale, style)
      tex.refresh()
    }
  }
  return { key, origin: [ox / w, oy / h] as const }
}

function placeFigure(scene: Phaser.Scene, style: StyleId, i: number, x: number, y: number, scale: number, depth: number) {
  // B se pinta a escala 1 y se amplía con nearest; A y C se repintan a la escala pedida
  const texScale = style === 'B' ? 1 : scale
  const t = figureTexture(scene, style, i, texScale)
  scene.add.image(x, y, t.key).setOrigin(t.origin[0], t.origin[1]).setScale(scale / texScale).setDepth(depth)
}

function drawRow(scene: Phaser.Scene, style: StyleId) {
  const feet = ROW_FEET_Y[style]
  scene.add.text(FIG_X[0] - 24, feet - 84, STYLES[style].title, { ...TEXT_STYLE, fontSize: '15px', fontStyle: 'bold', strokeThickness: 4 })
    .setDepth(60)
  FIGS.forEach((_, i) => placeFigure(scene, style, i, FIG_X[i], feet, 1, DEPTH.FX))
  if (style === 'A') {
    FIGS.forEach((f, i) => {
      scene.add.text(FIG_X[i], feet + 9, f.caption, { ...TEXT_STYLE, fontSize: '8px', strokeThickness: 3, align: 'center' })
        .setOrigin(0.5, 0).setDepth(60)
    })
  }

  const top = feet - PANEL.above
  const panel = scene.add.graphics().setDepth(DEPTH.UI)
  panel.fillStyle(0x06101a, 0.55).fillRoundedRect(PANEL.x, top, PANEL.w, PANEL.above + PANEL.below, 8)
  panel.lineStyle(1, 0xffffff, 0.25).strokeRoundedRect(PANEL.x, top, PANEL.w, PANEL.above + PANEL.below, 8)
  scene.add.text(PANEL.x + 8, top + 5, `${style} ×${INSET_SCALE}`, { ...TEXT_STYLE, fontSize: '13px', fontStyle: 'bold', strokeThickness: 3 })
    .setDepth(60)
  INSET_FIGS.forEach((fi, j) => placeFigure(scene, style, fi, INSET_X[j], feet - PANEL.feetLift, INSET_SCALE, DEPTH.UI + 1))
}

/** Dibuja las tres filas de estilo con sus recuadros ampliados. */
export function createStylePrototypes(scene: Phaser.Scene) {
  for (const style of ['A', 'B', 'C'] as const) drawRow(scene, style)
}
