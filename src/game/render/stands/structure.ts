import { RINK } from '../../constants'
import { BOARD_W, RINK_CORNER_R, roundedRectWorldPts } from '../rink/geometry'
import { STANDS as S, STANDS_COLORS as SC, WORLD_PX_PER_M as WPM } from '../artSpec'
import { project, type Projected } from '../viewTransform'
import { shade } from './fans'
import {
  ARENA_BOUNDS, M, SECTIONS, aislesFor, inVomitory, mulberry32, rowLength, sectionAt, standPoint, tierO, tierZ, viewOf,
  type Section, type Seat, type StandPt,
} from './layout'

/**
 * Obra de las gradas (WP-68): suelo del pabellón, escalones (huella y
 * contrahuella), asientos, escaleras de los pasillos, peto con cristal y
 * remates (los vomitorios, en `vomitory.ts`). Se pinta en canvas en coordenadas de pantalla (zoom 1);
 * quien llama pone la escala de horneado y el orden (de atrás hacia delante).
 */

type Ctx = CanvasRenderingContext2D

const P: Projected = { x: 0, y: 0, s: 0 }
const Q: StandPt = { x: 0, y: 0, nx: 0, ny: 0 }
const D = S.tierDepthM
const RISE = S.tierRiseM
/** Solape (px de mundo) entre tramos vecinos para que no se vea la junta del antialias. */
const SEAM = 0.6

export const concrete = (c: number, light: number) => shade(c, light, 0)

function segs(sec: Section, u0: number, u1: number) {
  return sec.corner ? Math.max(1, Math.ceil(Math.abs(u1 - u0) * 18)) : 1
}

/** Polígono entre dos filas del tramo: (oA, zA) de u0 a u1 y vuelta por (oB, zB). */
function bandPath(ctx: Ctx, sec: Section, u0: number, u1: number, oA: number, zA: number, oB: number, zB: number) {
  const n = segs(sec, u0, u1)
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    standPoint(sec, u0 + ((u1 - u0) * i) / n, oA, zA, P)
    if (i) ctx.lineTo(P.x, P.y)
    else ctx.moveTo(P.x, P.y)
  }
  for (let i = n; i >= 0; i--) {
    standPoint(sec, u0 + ((u1 - u0) * i) / n, oB, zB, P)
    ctx.lineTo(P.x, P.y)
  }
  ctx.closePath()
}

function linePath(ctx: Ctx, sec: Section, u0: number, u1: number, o: number, z: number) {
  const n = segs(sec, u0, u1)
  for (let i = 0; i <= n; i++) {
    standPoint(sec, u0 + ((u1 - u0) * i) / n, o, z, P)
    if (i) ctx.lineTo(P.x, P.y)
    else ctx.moveTo(P.x, P.y)
  }
}

export function fillBand(ctx: Ctx, color: string, sec: Section, u0: number, u1: number, oA: number, zA: number, oB: number, zB: number) {
  ctx.fillStyle = color
  bandPath(ctx, sec, u0, u1, oA, zA, oB, zB)
  ctx.fill()
}

export function strokeLine(ctx: Ctx, color: string, width: number, sec: Section, u0: number, u1: number, o: number, z: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  linePath(ctx, sec, u0, u1, o, z)
  ctx.stroke()
}

/** ¿Ve la cámara la cara que mira a la pista en este punto del tramo? */
function facesCamera(sec: Section, u: number, oM: number) {
  sectionAt(sec, u, oM, Q)
  return viewOf(Q.x, Q.y, Q.nx, Q.ny).front > 0.02
}

// ─── Suelo del pabellón ──────────────────────────────────────────────────────

/** Contorno de la pista (suelo) en pantalla. */
function rinkOutline() {
  return roundedRectWorldPts(RINK.x, RINK.y, RINK.width, RINK.height, RINK_CORNER_R, 14).map(p => project(p.x, p.y, 0))
}

function trace(ctx: Ctx, pts: { x: number, y: number }[]) {
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

/**
 * Suelo neutro alrededor de la pista: gris oscuro con grano, juntas cada 2 m,
 * la luz de la pista derramándose junto a la valla y sombra al pie de las gradas.
 * El interior de la pista queda transparente (lo tapa su propio suelo).
 */
export function paintVenueFloor(ctx: Ctx) {
  const B = ARENA_BOUNDS
  const rand = mulberry32(41)
  ctx.save()
  ctx.beginPath()
  ctx.rect(B.x, B.y, B.width, B.height)
  trace(ctx, rinkOutline())
  ctx.clip('evenodd')
  ctx.fillStyle = concrete(SC.floor, 1)
  ctx.fillRect(B.x, B.y, B.width, B.height)

  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = SC.floorGrain[i & 1]
    ctx.fillRect(B.x + rand() * B.width, B.y + rand() * B.height, 1 + rand(), 1)
  }

  // Juntas de las losas: rectas del mundo, rectas en pantalla
  ctx.strokeStyle = SC.floorJoint
  ctx.lineWidth = 0.7
  ctx.beginPath()
  const sx = SC.floorJointM * WPM.x
  const sy = SC.floorJointM * WPM.y
  const y0 = RINK.y - 24 * sy, y1 = RINK.y + RINK.height + 7 * sy
  const x0 = RINK.x - 30 * sx, x1 = RINK.x + RINK.width + 30 * sx
  for (let x = RINK.x - 30 * sx; x <= x1; x += sx) {
    project(x, y0, 0, P); ctx.moveTo(P.x, P.y)
    project(x, y1, 0, P); ctx.lineTo(P.x, P.y)
  }
  for (let y = RINK.y - 24 * sy; y <= y1; y += sy) {
    project(x0, y, 0, P); ctx.moveTo(P.x, P.y)
    project(x1, y, 0, P); ctx.lineTo(P.x, P.y)
  }
  ctx.stroke()

  // Luz de la pista que se derrama sobre el suelo junto a la valla
  const o = BOARD_W
  const board = roundedRectWorldPts(RINK.x - o, RINK.y - o, RINK.width + o * 2, RINK.height + o * 2, RINK_CORNER_R + o, 14)
    .map(p => project(p.x, p.y, 0))
  ctx.strokeStyle = SC.floorSpill
  for (const w of [8, 18, 32, 50, 72]) {
    ctx.lineWidth = w
    ctx.beginPath(); trace(ctx, board); ctx.stroke()
  }

  // Sombra al pie de cada grada (la grada tapa la mitad de dentro)
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  for (const w of [4, 9, 16]) {
    ctx.lineWidth = w
    for (const sec of SECTIONS) {
      ctx.beginPath()
      linePath(ctx, sec, 0, 1, tierO(sec.first) - S.parapetThickM, 0)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ─── Escalones ───────────────────────────────────────────────────────────────

/** Pared del fondo del pabellón detrás de la última fila (gradas de cara). */
export function paintBackWall(ctx: Ctx, sec: Section) {
  const last = S.tiers - 1
  fillBand(ctx, concrete(SC.backWall, 1), sec, -0.02, 1.02, tierO(last + 1), tierZ(last), tierO(last + 1), tierZ(last) + 12)
}

/**
 * Un escalón de un tramo: contrahuella (si la cámara la ve), huella con su
 * canto claro y, en los pasillos, la escalera de dos peldaños por fila con el
 * canto amarillo apagado.
 */
export function paintTier(ctx: Ctx, sec: Section, tier: number, light: number) {
  const o = tierO(tier)
  const o2 = tierO(tier + 1)
  const z = tierZ(tier)
  const zPrev = tier === sec.first ? 0 : tierZ(tier - 1)
  const e = SEAM / rowLength(sec, o)
  const chunks = sec.corner ? 6 : 1
  for (let c = 0; c < chunks; c++) {
    const u0 = c / chunks - e
    const u1 = (c + 1) / chunks + e
    if (!sec.near || facesCamera(sec, (u0 + u1) / 2, o)) fillBand(ctx, concrete(SC.riser, light), sec, u0, u1, o, zPrev, o, z)
  }
  fillBand(ctx, concrete(SC.tread, light), sec, -e, 1 + e, o, z, o2, z)
  strokeLine(ctx, concrete(SC.tread, light * 1.3), 0.8, sec, -e, 1 + e, o, z)

  const L = rowLength(sec, o)
  const { centers, half } = aislesFor(sec, o + D / 2)
  const mid = o + D / 2
  for (const c of centers) {
    if (inVomitory(sec, tier, c, L) >= 0) continue
    const a = Math.max(0, c - half)
    const b = Math.min(1, c + half)
    if (b <= a) continue
    fillBand(ctx, concrete(SC.tread, light * 1.1), sec, a, b, o, z, mid, z)
    if (!sec.near) fillBand(ctx, concrete(SC.riser, light * 1.05), sec, a, b, mid, z, mid, z + RISE / 2)
    fillBand(ctx, concrete(SC.tread, light * 1.1), sec, a, b, mid, z + RISE / 2, o2, z + RISE / 2)
    const nose = shade(SC.nosing, light, 0.2)
    strokeLine(ctx, nose, 0.9, sec, a, b, o, z)
    strokeLine(ctx, nose, 0.9, sec, a, b, mid, z + RISE / 2)
  }
}

/** Pasamanos centrales de los pasillos (solo donde se ven de frente: fondo y curvas). */
export function paintAisleRails(ctx: Ctx, sec: Section, light: number) {
  const rail = shade(SC.rail, light, 0.3)
  for (const c of sec.aisles) {
    sectionAt(sec, c, tierO(sec.first), Q)
    if (Math.abs(viewOf(Q.x, Q.y, Q.nx, Q.ny).turn) > 0.55) continue
    ctx.strokeStyle = rail
    ctx.lineWidth = 0.9
    ctx.beginPath()
    let open = false
    for (let t = sec.first; t < S.tiers; t++) {
      if (inVomitory(sec, t, c, rowLength(sec, tierO(t))) >= 0) { open = false; continue }
      for (const [o, z] of [[tierO(t), tierZ(t)], [tierO(t) + D / 2, tierZ(t) + RISE / 2]]) {
        standPoint(sec, c, o, z + S.railM, P)
        if (open) ctx.lineTo(P.x, P.y)
        else ctx.moveTo(P.x, P.y)
        open = true
      }
    }
    for (let t = sec.first; t < S.tiers; t += 2) {
      if (inVomitory(sec, t, c, rowLength(sec, tierO(t))) >= 0) continue
      const o = tierO(t) + D / 4
      standPoint(sec, c, o, tierZ(t), P); ctx.moveTo(P.x, P.y)
      standPoint(sec, c, o, tierZ(t) + S.railM, P); ctx.lineTo(P.x, P.y)
    }
    ctx.stroke()
  }
}

// ─── Asientos ────────────────────────────────────────────────────────────────

/**
 * Asiento de plástico: respaldo y asiento. De espaldas (grada cercana) solo se
 * ve la trasera del respaldo, más oscura, con su canto de arriba.
 */
export function paintSeatShell(ctx: Ctx, seat: Seat, color: number, back: boolean) {
  const { sec, tier, u, light } = seat
  const o = tierO(tier)
  const z = tierZ(tier)
  const du = (S.seatHalfM * M) / rowLength(sec, o + S.seatAtM)
  const ob = o + S.seatBackAtM
  if (back) {
    fillBand(ctx, shade(color, light * 0.62), sec, u - du, u + du, ob, z + S.seatPanM - 0.05, ob, z + S.seatBackTopM)
    strokeLine(ctx, shade(color, light * 0.95), 0.7, sec, u - du, u + du, ob, z + S.seatBackTopM)
    return
  }
  fillBand(ctx, shade(color, light * 0.8), sec, u - du, u + du, ob, z + S.seatPanM, ob, z + S.seatBackTopM)
  strokeLine(ctx, shade(color, light * 1.08), 0.6, sec, u - du, u + du, ob, z + S.seatBackTopM)
  fillBand(ctx, shade(color, light * 1.05), sec, u - du, u + du, o + S.seatAtM - 0.2, z + S.seatPanM, ob, z + S.seatPanM)
  strokeLine(ctx, shade(color, light * 0.5), 0.6, sec, u - du, u + du, o + S.seatAtM - 0.2, z + S.seatPanM)
}

// ─── Peto delantero ──────────────────────────────────────────────────────────

/** Tramos de peto: con primera fila a ras de suelo se abre en cada pasillo. */
function parapetRuns(sec: Section) {
  if (sec.first > 0) return { runs: [[0, 1]], gaps: [] as number[][] }
  const { centers, half } = aislesFor(sec, tierO(sec.first) - S.parapetThickM)
  const all = [0, ...centers.filter(c => c > 0 && c < 1), 1]
  const runs: number[][] = []
  const gaps: number[][] = []
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i] + (i === 0 && !sec.aisles.includes(0) ? 0 : half)
    const b = all[i + 1] - half
    if (b > a) runs.push([a, b])
  }
  for (const c of centers) gaps.push([Math.max(0, c - half), Math.min(1, c + half)])
  return { runs, gaps }
}

/**
 * Peto de la primera fila visto de cara: muro, albardilla clara, cristal con
 * juntas y, en las peñas, la pancarta del equipo. En los huecos de los pasillos,
 * dos peldaños desde el suelo.
 */
export function paintParapetFront(ctx: Ctx, sec: Section, light: number, banner: [number, number] | null) {
  const oF = tierO(sec.first)
  const oP = oF - S.parapetThickM
  const zF = tierZ(sec.first)
  const zTop = zF + S.parapetM
  const { runs, gaps } = parapetRuns(sec)
  const nose = shade(SC.nosing, light, 0.2)
  for (const [a, b] of gaps) {
    const n = 2
    const zs = zF / n
    for (let j = n - 1; j >= 0; j--) {
      const oj = oF - (n - j) * 0.32
      fillBand(ctx, concrete(SC.riser, light), sec, a, b, oj, j * zs, oj, (j + 1) * zs)
      fillBand(ctx, concrete(SC.tread, light * 1.1), sec, a, b, oj, (j + 1) * zs, oj + 0.32, (j + 1) * zs)
      strokeLine(ctx, nose, 0.9, sec, a, b, oj, (j + 1) * zs)
    }
  }
  const L = rowLength(sec, oP)
  // El muro alto del fondo (detrás de banquillos y mesa) va más apagado: que no compita con ellos
  const wall = sec.first > 0 ? light * 0.72 : light
  for (const [a, b] of runs) {
    fillBand(ctx, concrete(SC.parapet, wall), sec, a, b, oP, 0, oP, zTop)
    if (sec.first > 0) {
      strokeLine(ctx, concrete(SC.riser, wall), 0.8, sec, a, b, oP, zF)
      paintLedStrip(ctx, sec, a, b, oP, zTop)
    }
    if (banner) {
      const inset = (0.25 * M) / L
      fillBand(ctx, shade(banner[0], light * 0.95, 0.25), sec, a + inset, b - inset, oP, 0.14, oP, zTop - 0.05)
      fillBand(ctx, shade(banner[1], light * 0.9, 0.25), sec, a + inset, b - inset, oP, zTop * 0.42, oP, zTop * 0.58)
    }
    fillBand(ctx, concrete(SC.coping, light), sec, a, b, oP, zTop, oF, zTop)
    fillBand(ctx, SC.glass, sec, a, b, oP + S.parapetThickM / 2, zTop, oP + S.parapetThickM / 2, zTop + S.glassM)
    strokeLine(ctx, SC.glassEdge, 0.8, sec, a, b, oP + S.parapetThickM / 2, zTop + S.glassM)
    // Juntas del cristal cada 2 m
    const step = (2 * M) / L
    ctx.strokeStyle = SC.glassEdge
    ctx.lineWidth = 0.5
    ctx.beginPath()
    for (let u = a + step; u < b - step / 3; u += step) {
      standPoint(sec, u, oP + S.parapetThickM / 2, zTop, P); ctx.moveTo(P.x, P.y)
      standPoint(sec, u, oP + S.parapetThickM / 2, zTop + S.glassM, P); ctx.lineTo(P.x, P.y)
    }
    ctx.stroke()
  }
}

/**
 * Tira LED del muro alto del fondo (detrás de banquillos y mesa): panel oscuro
 * bajo la albardilla con una línea encendida y su halo, para que ese muro no se
 * lea como una franja negra entre los banquillos y el público.
 */
function paintLedStrip(ctx: Ctx, sec: Section, a: number, b: number, oP: number, zTop: number) {
  const [z0, z1] = S.ledStripZ
  fillBand(ctx, concrete(SC.ledPanel, 1), sec, a, b, oP, zTop - z1, oP, zTop - z0)
  const zm = zTop - (z0 + z1) / 2
  fillBand(ctx, SC.ledGlow, sec, a, b, oP, zm - S.ledGlowM, oP, zm + S.ledGlowM)
  strokeLine(ctx, SC.ledLine, 1, sec, a, b, oP, zm)
  strokeLine(ctx, concrete(SC.coping, 0.55), 0.6, sec, a, b, oP, zTop - z1)
}

/** Peto de la grada cercana visto por detrás: cara trasera y albardilla. */
export function paintParapetBack(ctx: Ctx, sec: Section, light: number) {
  const oF = tierO(sec.first)
  const oP = oF - S.parapetThickM
  const zF = tierZ(sec.first)
  const zTop = zF + S.parapetM
  const { runs, gaps } = parapetRuns(sec)
  for (const [a, b] of gaps) fillBand(ctx, concrete(SC.tread, light), sec, a, b, oF - 0.64, zF / 2, oF, zF / 2)
  for (const [a, b] of runs) {
    fillBand(ctx, concrete(SC.parapet, light * 0.9), sec, a, b, oF, zF, oF, zTop)
    fillBand(ctx, concrete(SC.coping, light), sec, a, b, oP, zTop, oF, zTop)
  }
}

/**
 * Remates del fondo: donde la curva (con todas sus filas) se junta con la recta
 * del fondo, que empieza más atrás, queda a la vista el costado escalonado.
 */
export function paintFarCaps(ctx: Ctx, light: number) {
  const far = SECTIONS.find(s => s.id === 'far')!
  ctx.fillStyle = concrete(SC.riser, light * 0.85)
  for (const u of [0, 1]) {
    ctx.beginPath()
    standPoint(far, u, tierO(0) - S.parapetThickM, 0, P); ctx.moveTo(P.x, P.y)
    standPoint(far, u, tierO(0) - S.parapetThickM, tierZ(0) + S.parapetM, P); ctx.lineTo(P.x, P.y)
    standPoint(far, u, tierO(0), tierZ(0) + S.parapetM, P); ctx.lineTo(P.x, P.y)
    for (let t = 0; t < far.first; t++) {
      standPoint(far, u, tierO(t), tierZ(t), P); ctx.lineTo(P.x, P.y)
      standPoint(far, u, tierO(t + 1), tierZ(t), P); ctx.lineTo(P.x, P.y)
    }
    standPoint(far, u, tierO(far.first), 0, P); ctx.lineTo(P.x, P.y)
    ctx.closePath()
    ctx.fill()
  }
}

export type Box = { minX: number, minY: number, maxX: number, maxY: number }

export function grow(box: Box, sec: Section, u: number, o: number, z: number) {
  standPoint(sec, u, o, z, P)
  box.minX = Math.min(box.minX, P.x); box.maxX = Math.max(box.maxX, P.x)
  box.minY = Math.min(box.minY, P.y); box.maxY = Math.max(box.maxY, P.y)
}

export const emptyBox = (): Box => ({ minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })

/** Caja en pantalla (zoom 1) del peto de un tramo, con sus peldaños de acceso. */
export function parapetBox(sec: Section): Box {
  const box = emptyBox()
  const oF = tierO(sec.first)
  const zTop = tierZ(sec.first) + S.parapetM + S.glassM
  for (let i = 0; i <= 24; i++) {
    const u = i / 24
    grow(box, sec, u, oF - S.parapetThickM - 0.7, 0)
    grow(box, sec, u, oF - S.parapetThickM, zTop)
    grow(box, sec, u, oF, zTop)
  }
  return box
}

/**
 * Grada cercana: más allá de la última fila (ya detrás de la cámara) sigue el
 * pasillo de arriba, para que el borde de la pantalla no quede vacío.
 */
export function paintNearConcourse(ctx: Ctx, sec: Section, light: number) {
  const last = S.tiers - 1
  fillBand(ctx, concrete(SC.tread, light * 0.8), sec, -0.02, 1.02, tierO(last + 1), tierZ(last), tierO(last + 14), tierZ(last))
}
