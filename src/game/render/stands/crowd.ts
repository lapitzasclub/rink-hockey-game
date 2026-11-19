import * as Phaser from 'phaser'
import { RINK } from '../../constants'
import type { TeamColor } from '../../types'
import { CROWD, DEPTH, STANDS as S, STANDS_COLORS as SC } from '../artSpec'
import { teamKit } from '../puppet/kit'
import { bakeResolution } from '../quality'
import { RINK_CORNER_R } from '../rink/geometry'
import { project } from '../viewTransform'
import { fanExtent, makeLook, paintFan, type FanLook, type FanPose } from './fans'
import { ARENA_BOUNDS, SECTIONS, layoutSeats, mulberry32, standPoint, tierLight, tierO, tierZ, type Section, type Seat } from './layout'
import { GUTTER, MAX_TEX, packInto, shelfPack, type Slot } from './pack'
import * as ST from './structure'
import * as VO from './vomitory'

/**
 * Gradas y público horneados (WP-68). Una o dos texturas por resolución y
 * equipación, para que todo el pabellón vaya en el mismo lote:
 * - obra: suelo del pabellón y gradas que se ven de cara, en cuatro trozos
 *   alrededor de la pista; el hueco de la pista no se ve y guarda marcos sueltos;
 * - marcos sueltos (en ese hueco y, si no caben, en un atlas): los tres tramos de
 *   la grada cercana (de espaldas, por delante de la valla cercana), el público de
 *   cara en bloques (tramo × bloque entre pasillos × banda de filas × trozo de
 *   fila), las poses de gol de las peñas, los petos con su cristal y los brazos
 *   en alto de la grada cercana.
 * Cada bloque es una Image que se mece entera: el vaivén cuesta una `y` por bloque.
 * En calidad baja (`lite`, al crear) el público neutro va en la obra y solo las
 * peñas se mueven, en una banda grande por bloque entre pasillos: pocos objetos.
 */

type Ctx = CanvasRenderingContext2D
type Box = { minX: number, minY: number, maxX: number, maxY: number }

const KEY_PREFIX = 'stands-'
/** Solape (px de textura) entre trozos vecinos de la obra: la junta no se ve con el filtrado. */
const PIECE_OVERLAP = 2

interface Fan {
  seat: Seat
  look: FanLook | null
  seat3: number
  arms: boolean
}

/** Grupo animado: su marco de calma y, en las peñas, el de gol. */
interface Block {
  depth: number
  team: TeamColor | null
  phase: number
  calm: Frame
  cheer: Frame | null
}

interface Frame extends Slot {
  name: string
  /** Textura donde quedó (la de la obra, si cupo en el hueco de la pista, o el atlas) y su resolución. */
  key: string
  res: number
  /** Va a la resolución de la obra (la grada cercana), no a la del público. */
  full: boolean
  box: Box
  paint: (ctx: Ctx) => void
}

interface Kits { blue: [number, number], red: [number, number] }

const growBox = (b: Box, x0: number, y0: number, x1: number, y1: number) => {
  if (x0 < b.minX) b.minX = x0
  if (y0 < b.minY) b.minY = y0
  if (x1 > b.maxX) b.maxX = x1
  if (y1 > b.maxY) b.maxY = y1
}
const newBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })

function poseOf(fan: Fan, cheer: boolean, armsOnly = false): FanPose {
  return { turn: fan.seat.turn, back: fan.seat.front < 0, cheer: cheer && fan.seat.pena !== null, armsOnly }
}

function fanBox(box: Box, fan: Fan, pose: FanPose) {
  const [l, t, r, b] = fanExtent(pose)
  const { x, y, k, lean } = fan.seat
  // La cizalla corre la cabeza hacia fuera y los pies (por debajo de la cadera) hacia dentro
  const st = -lean * t * k, sb = -lean * b * k
  growBox(box, x + l * k + Math.min(0, st, sb) - 1.5, y + t * k - 1.5, x + r * k + Math.max(0, st, sb) + 1.5, y + b * k + 1.5)
}

/**
 * Espectador con la inclinación de perspectiva de su sitio (WP-70): se cizalla
 * sobre la cadera, x += lean·(y de la cadera − y), igual que vallas y grada.
 */
function paintLeaned(ctx: Ctx, f: Fan, pose: FanPose) {
  const s = f.seat
  if (!f.look) return
  ctx.save()
  ctx.transform(1, 0, -s.lean, 1, s.lean * s.y, 0)
  paintFan(ctx, s.x, s.y, s.k, f.look, s.light, pose)
  ctx.restore()
}

function paintFans(ctx: Ctx, fans: Fan[], cheer: boolean, armsOnly = false) {
  for (const f of fans) paintLeaned(ctx, f, poseOf(f, cheer, armsOnly))
}

/** Color entero oscurecido (los asientos de la peña: del color del club, sin competir con sus camisetas). */
function darken(c: number, f: number) {
  return (Math.round(((c >> 16) & 0xff) * f) << 16) | (Math.round(((c >> 8) & 0xff) * f) << 8) | Math.round((c & 0xff) * f)
}

/** Asientos con su espectador (o vacíos), siempre los mismos. */
function buildFans(kits: Kits): Fan[] {
  const r = mulberry32(7)
  const seats = layoutSeats(SC.lightFront, SC.lightBack, SC.lightNear)
  return seats.map((seat) => {
    const t = seat.tier / (S.tiers - 1)
    const empty = seat.pena ? CROWD.penaEmpty : CROWD.emptyFront + (CROWD.emptyBack - CROWD.emptyFront) * t
    const kit = seat.pena ? kits[seat.pena] : [0, 0]
    const look = r() < empty ? null : makeLook(r, seat.pena, kit[0], kit[1])
    const seat3 = seat.pena ? darken(kit[0], CROWD.penaSeatK) : SC.seats[(seat.secIndex * 2 + seat.block) % SC.seats.length]
    const arms = seat.sec.near && seat.tier < seat.sec.first + CROWD.armsRows && r() < CROWD.armsRate
    return { seat, look, seat3, arms }
  }).sort((a, b) => a.seat.y - b.seat.y)
}

/**
 * Bloque animado de un asiento: tramo × bloque entre pasillos × banda de filas ×
 * trozo de fila. En `lite` solo se animan las peñas, en una banda grande por
 * bloque entre pasillos.
 */
function groupOf(seat: Seat, lite: boolean) {
  if (lite) return { key: `${seat.secIndex}:${seat.block}`, band: 0 }
  return { key: `${seat.secIndex}:${seat.block}:${seat.band}:${seat.chunk}`, band: seat.band }
}

// ─── Obra ────────────────────────────────────────────────────────────────────

const FRONT_ORDER = ['far', 'fl', 'fr', 'left', 'right'] as const
const sec = (id: string) => SECTIONS.find(s => s.id === id)!
const frontSections = () => FRONT_ORDER.map(sec)
const nearSections = () => SECTIONS.filter(s => s.near)

function paintFrontSection(ctx: Ctx, s: Section, fans: Fan[]) {
  ST.paintBackWall(ctx, s)
  const mine = fans.filter(f => f.seat.sec === s)
  for (let tier = S.tiers - 1; tier >= s.first; tier--) {
    const light = tierLight(s, tier, SC.lightFront, SC.lightBack, SC.lightNear)
    ST.paintTier(ctx, s, tier, light)
    for (const f of mine) if (f.seat.tier === tier) ST.paintSeatShell(ctx, f.seat, f.seat3, false)
    s.vomitories.forEach((_, k) => { if (tier === s.vomTiers[0]) VO.paintVomitory(ctx, s, k, light) })
  }
  ST.paintAisleRails(ctx, s, SC.lightBack)
}

function paintParapet(ctx: Ctx, s: Section, kits: Kits) {
  ST.paintParapetFront(ctx, s, SC.lightFront, s.pena ? kits[s.pena] : null)
}

/** Tramo de la grada cercana de espaldas: de la fila de delante (la más alta en pantalla) a la de atrás. */
function paintNearSection(ctx: Ctx, s: Section, fans: Fan[]) {
  ST.paintParapetBack(ctx, s, SC.lightNear)
  const mine = fans.filter(f => f.seat.sec === s)
  for (let tier = s.first; tier < S.tiers; tier++) {
    ST.paintTier(ctx, s, tier, tierLight(s, tier, SC.lightFront, SC.lightBack, SC.lightNear))
    for (const f of mine) {
      if (f.seat.tier !== tier) continue
      const front = f.seat.front > 0
      if (front) ST.paintSeatShell(ctx, f.seat, f.seat3, false)
      paintLeaned(ctx, f, poseOf(f, false))
      if (!front) ST.paintSeatShell(ctx, f.seat, f.seat3, true)
    }
  }
  ST.paintNearConcourse(ctx, s, SC.lightNear)
}

/**
 * Cajas en pantalla de un tramo de la grada cercana (hasta el borde de abajo del
 * pabellón). Las curvas son un cuarto de anillo: su caja entera sería medio
 * vacío, así que se parten en franjas horizontales, cada una con el ancho de lo
 * que cae en ella (la de abajo, con el pasillo de detrás, conserva el ancho total).
 * Las franjas se solapan `PIECE_OVERLAP` px de textura, como los trozos de la obra.
 */
function nearBoxes(s: Section, res: number): Box[] {
  const B = ARENA_BOUNDS
  const pts: Box[] = []
  const all = newBox()
  const p = { x: 0, y: 0, s: 0 }
  const nO = 12
  for (let i = 0; i <= 32; i++) {
    for (let j = 0; j <= nO; j++) {
      const t = j / nO
      const o = tierO(0) - 1 + (tierO(S.tiers) - tierO(0) + 1) * t
      for (const z of [t * tierZ(S.tiers), t * (tierZ(S.tiers) + 2)]) {
        standPoint(s, i / 32, o, z, p)
        const r = { minX: p.x - 20, minY: p.y - 40, maxX: p.x + 20, maxY: p.y + 4 }
        pts.push(r)
        growBox(all, r.minX, r.minY, r.maxX, r.maxY)
      }
    }
  }
  const clip = (b: Box): Box => ({
    minX: Math.max(B.x, b.minX), minY: Math.max(B.y, b.minY),
    maxX: Math.min(B.x + B.width, b.maxX), maxY: Math.min(B.y + B.height, b.maxY),
  })
  all.maxY = B.y + B.height
  const n = s.corner ? S.nearCornerBands : 1
  if (n === 1) return [clip(all)]
  const top = Math.max(B.y, all.minY)
  const h = (all.maxY - top) / n
  const ov = PIECE_OVERLAP / res
  const out: Box[] = []
  for (let k = 0; k < n; k++) {
    const y0 = top + h * k - (k ? ov : 0)
    const y1 = k === n - 1 ? all.maxY : top + h * (k + 1) + ov
    const band = newBox()
    if (k === n - 1) growBox(band, all.minX, y0, all.maxX, y1)
    else for (const r of pts) if (r.maxY > y0 && r.minY < y1) growBox(band, r.minX, y0, r.maxX, y1)
    if (band.maxX > band.minX) out.push(clip(band))
  }
  return out
}

/** Línea de abajo de la obra: el frente de la grada cercana (por debajo lo tapa ella). */
function structureBottom() {
  const p = { x: 0, y: 0, s: 0 }
  let y = -Infinity
  for (const s of nearSections()) {
    for (let i = 0; i <= 32; i++) y = Math.max(y, standPoint(s, i / 32, tierO(0), tierZ(0), p).y)
  }
  return Math.min(ARENA_BOUNDS.y + ARENA_BOUNDS.height, y + 24)
}

/** Rectángulo de pantalla que queda dentro de la pista: la obra no lo guarda. */
function rinkHole() {
  const tl = project(RINK.x, RINK.y + RINK_CORNER_R, 0)
  const tr = project(RINK.x + RINK.width, RINK.y + RINK_CORNER_R, 0)
  const bl = project(RINK.x, RINK.y + RINK.height - RINK_CORNER_R, 0)
  return { x0: tl.x + 4, x1: tr.x - 4, y0: tl.y + 4, y1: bl.y - 4 }
}

// ─── Texturas ────────────────────────────────────────────────────────────────

/** Trozo de la obra de cara: marco de su textura y esquina en pantalla. */
interface Placed { frame: string, x: number, y: number }

interface Built {
  /** Textura de la obra de cara; guarda también, en el hueco de la pista, marcos de `Frame`. */
  key: string
  res: number
  obra: Placed[]
  near: Frame[]
  blocks: Block[]
  overlays: Frame[]
  arms: Frame | null
}

const builtCache = new Map<string, Built>()

function buildTextures(scene: Phaser.Scene, lite: boolean, kits: Kits): Built {
  const B = ARENA_BOUNDS
  const res = Math.min(bakeResolution(true), S.maxRes, MAX_TEX / B.width)
  const sig = `${Math.round(res * 100)}-${lite ? 'l' : 'a'}-${kits.blue.join('.')}-${kits.red.join('.')}`
  const hit = builtCache.get(sig)
  if (hit && scene.textures.exists(hit.key)) return hit
  const t0 = performance.now()
  for (const key of scene.textures.getTextureKeys()) if (key.startsWith(KEY_PREFIX)) scene.textures.remove(key)
  builtCache.clear()

  const fans = buildFans(kits)
  const front = frontSections()
  const frontFans = fans.filter(f => !f.seat.sec.near)
  const nearFans = fans.filter(f => f.seat.sec.near)

  // Obra de cara
  const key = `${KEY_PREFIX}o-${sig}`
  const tex = scene.textures.createCanvas(key, Math.ceil(B.width * res), Math.ceil((structureBottom() - B.y) * res))!
  const ctx = tex.getContext()
  ctx.setTransform(res, 0, 0, res, -B.x * res, -B.y * res)
  ST.paintVenueFloor(ctx)
  for (const s of front) {
    paintFrontSection(ctx, s, fans)
    if (s.id === 'fr') ST.paintFarCaps(ctx, SC.lightFront)
  }
  // En `lite` el público neutro, con sus petos y barandillas, va en la obra; solo las peñas se mueven
  const animFans = lite ? frontFans.filter(f => f.seat.pena !== null) : frontFans
  const overSecs = lite ? front.filter(s => s.pena !== null) : front
  if (lite) {
    paintFans(ctx, frontFans.filter(f => f.seat.pena === null), false)
    for (const s of front) {
      if (overSecs.includes(s)) continue
      paintParapet(ctx, s, kits)
      s.vomitories.forEach((_, k) => VO.paintVomitoryRail(ctx, s, k, SC.lightBack))
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0)

  // Se dibuja en cuatro trozos alrededor de la pista; su hueco se vacía y guarda marcos
  const W = tex.width, H = tex.height
  const r = rinkHole()
  const hx0 = Math.ceil((r.x0 - B.x) * res), hx1 = Math.floor((r.x1 - B.x) * res)
  const hy0 = Math.ceil((r.y0 - B.y) * res), hy1 = Math.min(H, Math.floor((r.y1 - B.y) * res))
  const O = PIECE_OVERLAP
  const obra: Placed[] = []
  const cut = (frame: string, x0: number, y0: number, x1: number, y1: number) => {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1)
    if (x1 <= x0 || y1 <= y0) return
    tex.add(frame, 0, x0, y0, x1 - x0, y1 - y0)
    obra.push({ frame, x: B.x + x0 / res, y: B.y + y0 / res })
  }
  cut('top', 0, 0, W, hy0 + O)
  cut('left', 0, hy0 - O, hx0 + O, H)
  cut('right', hx1 - O, hy0 - O, W, H)
  cut('mid', hx0 - O, hy1 - O, hx1 + O, H)
  const m = O + GUTTER
  const hole = { x: hx0 + m, y: hy0 + m, w: hx1 - hx0 - 2 * m, h: hy1 - hy0 - 2 * m }
  ctx.clearRect(hole.x, hole.y, hole.w, hole.h)

  const built: Built = { key, res, obra, near: [], blocks: [], overlays: [], arms: null }
  const aKey = buildFrames(scene, built, { animFans, overSecs, nearFans, kits, lite }, hole, `${KEY_PREFIX}a-${sig}`)
  tex.refresh()
  builtCache.set(sig, built)
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('lab')) {
    const all = [key, ...(aKey ? [aKey] : [])].map((k) => scene.textures.get(k).source[0])
    console.info(`[stands] res ${res.toFixed(2)} · asientos ${fans.length} · público ${fans.filter(f => f.look).length} · bloques ${built.blocks.length}`
      + ` · texturas ${(all.reduce((a, t) => a + t.width * t.height, 0) / 1e6).toFixed(2)} Mpx (${all.map(t => `${t.width}×${t.height}`).join(', ')})`
      + ` · pintado ${Math.round(performance.now() - t0)} ms`)
  }
  return built
}

interface FramesInput { animFans: Fan[], overSecs: Section[], nearFans: Fan[], kits: Kits, lite: boolean }

/**
 * Marcos sueltos: la grada cercana (a la resolución de la obra), los bloques del
 * público, las poses de gol de las peñas, los petos de `overSecs` y los brazos en
 * alto de la grada cercana (algo por debajo). Llenan primero el hueco de la pista
 * en la textura de la obra; lo que no cabe va a un atlas propio, cuya clave devuelve.
 */
function buildFrames(scene: Phaser.Scene, built: Built, inp: FramesInput, hole: { x: number, y: number, w: number, h: number }, aKey: string): string | null {
  const { animFans, overSecs, nearFans, kits, lite } = inp
  const frames: Frame[] = []
  const frame = (name: string, box: Box, paint: (ctx: Ctx) => void, full = false): Frame => {
    const f = { name, key: '', res: 0, full, box, paint, w: 0, h: 0, ax: 0, ay: 0 }
    frames.push(f)
    return f
  }
  for (const s of nearSections()) {
    nearBoxes(s, built.res).forEach((box, k) => built.near.push(frame(`n${s.id}${k}`, box, ctx => paintNearSection(ctx, s, nearFans), S.nearFullRes)))
  }
  const groups = new Map<string, { fans: Fan[], band: number }>()
  for (const f of animFans) {
    if (!f.look) continue
    const { key, band } = groupOf(f.seat, lite)
    let g = groups.get(key)
    if (!g) groups.set(key, g = { fans: [], band })
    g.fans.push(f)
  }
  const rnd = mulberry32(99)
  const nBands = Math.ceil(S.tiers / S.bandTiers)
  for (const [key, { fans: g, band }] of groups) {
    const calmBox = newBox()
    for (const f of g) fanBox(calmBox, f, poseOf(f, false))
    const team = g.find(f => f.seat.pena)?.seat.pena ?? null
    const calm = frame(`c${key}`, calmBox, ctx => paintFans(ctx, g, false))
    let cheer: Frame | null = null
    if (team) {
      const cheerBox = newBox()
      for (const f of g) fanBox(cheerBox, f, poseOf(f, true))
      cheer = frame(`g${key}`, cheerBox, ctx => paintFans(ctx, g, true))
    }
    // Las filas de delante tapan a las de detrás
    const depth = DEPTH.STANDS_FAR + 1 + (nBands - 1 - band)
    built.blocks.push({ depth, team, phase: rnd() * Math.PI * 2, calm, cheer })
  }
  for (const s of overSecs) {
    built.overlays.push(frame(`p${s.id}`, pad(ST.parapetBox(s)), ctx => paintParapet(ctx, s, kits)))
    s.vomitories.forEach((_, k) => {
      built.overlays.push(frame(`v${s.id}${k}`, pad(VO.vomitoryRailBox(s, k)), ctx => VO.paintVomitoryRail(ctx, s, k, SC.lightBack)))
    })
  }
  const armFans = nearFans.filter(f => f.arms && f.look)
  if (armFans.length) {
    const box = newBox()
    for (const f of armFans) fanBox(box, f, poseOf(f, false, true))
    built.arms = frame('arms', box, ctx => paintFans(ctx, armFans, false, true))
  }

  const sizeAt = (rr: number) => {
    for (const f of frames) {
      f.res = f.full ? built.res : rr
      f.w = Math.ceil((f.box.maxX - f.box.minX) * f.res)
      f.h = Math.ceil((f.box.maxY - f.box.minY) * f.res)
    }
    const rest = packInto(frames, hole.x, hole.y, hole.w, hole.h)
    for (const f of frames) f.key = built.key
    for (const f of rest) f.key = aKey
    return rest.length ? shelfPack(rest) : { W: 0, H: 0 }
  }
  let rr = built.res * S.atlasResK
  let size = sizeAt(rr)
  while (!size && rr > 0.5) size = sizeAt(rr *= 0.85)
  if (!size) throw new Error('[stands] el público no cabe en ninguna textura')
  const aTex = size.W ? scene.textures.createCanvas(aKey, size.W, size.H)! : null
  const oTex = scene.textures.get(built.key) as Phaser.Textures.CanvasTexture
  for (const f of frames) {
    const tex = f.key === aKey ? aTex! : oTex
    const ctx = tex.getContext()
    ctx.save()
    ctx.beginPath()
    ctx.rect(f.ax, f.ay, f.w, f.h)
    ctx.clip()
    ctx.setTransform(f.res, 0, 0, f.res, f.ax - f.box.minX * f.res, f.ay - f.box.minY * f.res)
    f.paint(ctx)
    ctx.restore()
    tex.add(f.name, 0, f.ax, f.ay, f.w, f.h)
  }
  aTex?.refresh()
  return aTex ? aKey : null
}

const pad = (b: Box): Box => ({ minX: b.minX - 2, minY: b.minY - 2, maxX: b.maxX + 2, maxY: b.maxY + 2 })

// ─── Escena ──────────────────────────────────────────────────────────────────

/** Imagen de un grupo y su y de reposo. */
interface LiveBlock { img: Phaser.GameObjects.Image, block: Block, baseY: number, showingCheer: boolean }

export interface StandsHandle {
  blocks: LiveBlock[]
  arms: Phaser.GameObjects.Image | null
  armsBaseY: number
}

/** Coloca las gradas en la escena. `lite`: calidad baja, solo se mueven las peñas. */
export function placeStands(scene: Phaser.Scene, lite: boolean): StandsHandle {
  const t0 = performance.now()
  const n0 = scene.sys.displayList.length
  const handle = placeAll(scene, lite)
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('lab')) {
    console.info(`[stands] objetos ${scene.sys.displayList.length - n0} · montaje ${Math.round(performance.now() - t0)} ms`)
  }
  return handle
}

function placeAll(scene: Phaser.Scene, lite: boolean): StandsHandle {
  const kit = (t: TeamColor): [number, number] => { const k = teamKit(t); return [k.jersey, k.shorts] }
  const built = buildTextures(scene, lite, { blue: kit('blue'), red: kit('red') })
  const inv = 1 / built.res
  for (const p of built.obra) scene.add.image(p.x, p.y, built.key, p.frame).setOrigin(0, 0).setScale(inv).setDepth(DEPTH.STANDS_FAR)
  const handle: StandsHandle = { blocks: [], arms: null, armsBaseY: 0 }
  const place = (f: Frame, depth: number) =>
    scene.add.image(f.box.minX, f.box.minY, f.key, f.name).setOrigin(0, 0).setScale(1 / f.res).setDepth(depth)
  for (const f of built.near) place(f, DEPTH.STANDS_NEAR)
  for (const block of built.blocks) {
    const img = place(block.calm, block.depth)
    handle.blocks.push({ img, block, baseY: block.calm.box.minY, showingCheer: false })
  }
  for (const f of built.overlays) place(f, DEPTH.STANDS_FAR + 8)
  if (built.arms) {
    handle.arms = place(built.arms, DEPTH.STANDS_NEAR + 1).setVisible(false)
    handle.armsBaseY = built.arms.box.minY
  }
  return handle
}

/** Cambia un grupo de peña entre su marco de calma y el de gol. */
export function showCheerFrame(live: LiveBlock, on: boolean) {
  const { block, img } = live
  if (live.showingCheer === on || !block.cheer) return
  const f = on ? block.cheer : block.calm
  img.setFrame(f.name)
  img.x = f.box.minX
  live.baseY = f.box.minY
  live.showingCheer = on
}
