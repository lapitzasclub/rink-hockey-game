/**
 * Marcos de atlas de las piezas del rig (WP-30). Las de un color (miembros,
 * tronco del jugador, guantes, piel) se pintan en blanco con su sombra y se
 * tiñen por equipo; las de varios colores (cabeza, patín, equipamiento del
 * portero, dorsal) se pintan con su color final. Las dependientes de la vista
 * se generan para las 8 direcciones (0 = de frente, 2 = derecha, 4 = espalda).
 */
import { FIGURE_EXAG, PLAYER_HEIGHT_M, PX_PER_M, RIG_FLOOR_FORESHORTEN, RIG_GEAR, RIG_PROPORTIONS, STICK_BLADE } from '../artSpec'
import type { FrameRef, PuppetAtlas } from './atlas'
import type { RigKit } from './kit'
import {
  capsulePath, detailLine, ellipsePath, hex, paintHead, paintNumber, paintShape, polyPath, strokeOutline, tone, type HeadSpec,
} from './paint'
import type { RigDims } from './skeleton'

/** px de pantalla a s = 1 por unidad de figura. */
export const FIGURE_PX = PLAYER_HEIGHT_M * PX_PER_M * FIGURE_EXAG
export const VIEWS = 8
export const WHITE = 0xffffff
const M = 1.6
const F = RIG_FLOOR_FORESHORTEN

const viewYaw = (v: number) => (v * Math.PI) / 4

/** Cápsula vertical de largo `len` (unidades de figura); ancla en el centro del extremo superior. */
export function capsuleFrame(atlas: PuppetAtlas, name: string, len: number, ra: number, rb: number, c = WHITE, thin = false): FrameRef {
  const [a, b, l] = [ra * FIGURE_PX, rb * FIGURE_PX, len * FIGURE_PX]
  const r = Math.max(a, b)
  return atlas.ensure(`cap-${name}`, { left: -r - M, right: r + M, top: -a - M, bottom: l + b + M }, ctx => {
    paintShape(ctx, capsulePath(0, 0, 0, l, a, b), c, Math.min(a, b), thin)
  })
}

/**
 * Pala curva («cuchara», SPEC §7) del talón (ancla) a la punta, a lo largo de +y:
 * se ensancha hacia la punta y se curva hacia la cara de golpeo. El suelo se ve
 * en pantalla reflejado (escorzo), así que basta un marco por mano (`side` 1 = diestro).
 */
export function bladeFrame(atlas: PuppetAtlas, side: 0 | 1): FrameRef {
  const B = STICK_BLADE
  const [l, ra, rb, bow] = [B.len * FIGURE_PX, B.heelR * FIGURE_PX, B.toeR * FIGURE_PX, B.bow * FIGURE_PX * (side === 1 ? 1 : -1)]
  const n = 10
  const pts: [number, number][] = []
  const edge = (k: number, sign: number) => {
    // Línea media x = bow·u², con su normal; el ancho crece del talón a la punta
    const u = k / n
    const tx = 2 * bow * u
    const tl = Math.hypot(tx, l) || 1
    const r = ra + (rb - ra) * u
    pts.push([bow * u * u + (sign * l * r) / tl, l * u - (sign * tx * r) / tl])
  }
  for (let k = 0; k <= n; k++) edge(k, 1)
  // Punta redonda: media vuelta de la normal a la contraria pasando por la tangente
  const tl = Math.hypot(2 * bow, l)
  const [nx, ny, tx, ty] = [l / tl, -2 * bow / tl, 2 * bow / tl, l / tl]
  for (let k = 1; k < 6; k++) {
    const a = (k / 6) * Math.PI
    pts.push([bow + rb * (nx * Math.cos(a) + tx * Math.sin(a)), l + rb * (ny * Math.cos(a) + ty * Math.sin(a))])
  }
  for (let k = n; k >= 0; k--) edge(k, -1)
  const m = Math.abs(bow) + rb + M
  return atlas.ensure(`blade-${side}`, { left: -m, right: m, top: -ra - M, bottom: l + rb + M }, ctx => {
    paintShape(ctx, polyPath(pts), RIG_GEAR.blade, ra, true)
  })
}

/** Elipse centrada en el ancla. */
export function blobFrame(atlas: PuppetAtlas, name: string, rx: number, ry: number, c = WHITE, thin = false): FrameRef {
  const [x, y] = [rx * FIGURE_PX, ry * FIGURE_PX]
  return atlas.ensure(`blob-${name}`, { left: -x - M, right: x + M, top: -y - M, bottom: y + M }, ctx => {
    paintShape(ctx, ellipsePath(0, 0, x, y), c, Math.min(x, y), thin)
  })
}

/** Sombra de contacto: elipse oscura con núcleo más denso (SPEC §4). Radio 16 px. */
export function shadowFrame(atlas: PuppetAtlas): FrameRef {
  return atlas.ensure('shadow', { left: -17, right: 17, top: -17, bottom: 17 }, ctx => {
    ctx.fillStyle = hex(0x000000, 0.24)
    ctx.fill(ellipsePath(0, 0, 16, 16))
    ctx.fillStyle = hex(0x000000, 0.3)
    ctx.fill(ellipsePath(0, 0, 9, 9.5))
  })
}

/** Medidas del tronco: semiancho en cadera y hombros y semifondo, en unidades de figura. */
function torsoSize(d: RigDims) {
  return d.kind === 'goalie'
    ? { hip: 0.13 * d.k, sh: 0.19 * d.k, depth: 0.12 * d.k }
    : { hip: 0.115 * d.k, sh: 0.14 * d.k, depth: 0.075 * d.k }
}

/** Largo nominal del tronco (hombros → base) para estirar el marco. */
export const torsoLen = (d: RigDims) => d.trunk * 0.95 + 0.01

/**
 * Tronco visto desde la vista `v`: secciones elípticas en hombros (arriba,
 * ancla) y cadera, unidas por los laterales. El portero lleva peto marcado; la
 * camiseta teñida, cuello, costuras y los pliegues del nivel `fold` (E-18).
 */
export function torsoFrame(atlas: PuppetAtlas, d: RigDims, v: number, kit: RigKit | null, fold = 0): FrameRef {
  const t = torsoSize(d)
  const yaw = viewYaw(v)
  const c = Math.abs(Math.cos(yaw))
  const s = Math.abs(Math.sin(yaw))
  const len = torsoLen(d) * FIGURE_PX
  const wt = (t.sh * c + t.depth * s) * FIGURE_PX
  const wb = (t.hip * c + t.depth * s) * FIGURE_PX
  const ht = (t.sh * s + t.depth * c) * F * FIGURE_PX
  const hb = (t.hip * s + t.depth * c) * F * FIGURE_PX
  const goalie = d.kind === 'goalie' && kit
  const vest = !goalie && kit?.vest !== undefined ? kit : null
  const name = goalie ? `torso-goalie-${kit.id}-${v}` : vest ? `torso-vest-${vest.id}-${v}` : `torso-${d.kind}-${v}-f${fold}`
  const w = Math.max(wt, wb)
  return atlas.ensure(name, { left: -w - M, right: w + M, top: -ht - M, bottom: len + hb + M }, ctx => {
    const p = new Path2D()
    p.ellipse(0, 0, wt, Math.max(0.5, ht), 0, Math.PI, Math.PI * 2)
    p.lineTo(wb, len)
    p.ellipse(0, len, wb, Math.max(0.5, hb), 0, 0, Math.PI)
    p.closePath()
    const col = goalie ? kit.jersey : vest ? vest.jersey : WHITE
    paintShape(ctx, p, col, Math.min(wt, wb))
    if (vest) {
      paintVest(ctx, p, vest.vest!, t, yaw, len, w, ht, hb)
      strokeOutline(ctx, p, Math.min(wt, wb))
      return
    }
    if (!goalie) {
      paintJersey(ctx, p, t, yaw, len, wt, wb, ht, hb, fold)
      strokeOutline(ctx, p, Math.min(wt, wb))
      return
    }
    // Peto bajo la camiseta: placas horizontales y cintura en el segundo color
    ctx.save()
    ctx.clip(p)
    const seam = tone(col, 0.72)
    for (const f of [0.3, 0.52, 0.72]) detailLine(ctx, -w, len * f, w, len * f + 0.6, seam, 0.7)
    ctx.fillStyle = hex(kit.trim)
    ctx.fillRect(-w - 1, len * 0.86, 2 * w + 2, len)
    ctx.restore()
    strokeOutline(ctx, p, Math.min(wt, wb))
  })
}

/**
 * Canesú y paneles laterales del árbitro sobre el tronco ya pintado. Cada
 * lateral cae en pantalla en −lado·semiancho·cos(yaw) y se ensancha con el
 * fondo del tronco al verse de perfil; el que queda detrás del cuerpo no se pinta.
 */
function paintVest(
  ctx: CanvasRenderingContext2D, p: Path2D, c: number, t: ReturnType<typeof torsoSize>,
  yaw: number, len: number, w: number, ht: number, hb: number,
) {
  const sy = Math.sin(yaw)
  const cy = Math.cos(yaw)
  ctx.save()
  ctx.clip(p)
  ctx.fillStyle = hex(c)
  ctx.fillRect(-w - 2, -ht - 2, 2 * w + 4, ht + 2 + len * 0.26)
  for (const side of [-1, 1]) {
    if (side * sy < -0.2) continue
    // Paneles anchos y algo hacia dentro: a zoom 1 tienen que leerse como bandas, no como un filo
    const top = -side * t.sh * cy * 0.88 * FIGURE_PX
    const bot = -side * t.hip * cy * 0.88 * FIGURE_PX
    const half = Math.max(t.depth * Math.abs(sy), 0.3 * t.sh) * FIGURE_PX
    ctx.beginPath()
    ctx.moveTo(top - half, 0)
    ctx.lineTo(top + half, 0)
    ctx.lineTo(bot + half, len + hb)
    ctx.lineTo(bot - half, len + hb)
    ctx.closePath()
    ctx.fill()
  }
  // Sombra suave bajo el canesú: separa el amarillo del gris
  detailLine(ctx, -w, len * 0.26 + 0.6, w, len * 0.26 + 0.6, tone(c, 0.55), 0.8)
  ctx.restore()
}

/**
 * Camiseta teñida (E-18): cuello, costuras laterales, bajo y pliegues que se
 * marcan al inclinar el tronco (`fold` 0–2): de frente, arrugas en la tripa; de
 * lado, del pecho hacia el costado. La espalda queda limpia para el dorsal.
 */
function paintJersey(
  ctx: CanvasRenderingContext2D, p: Path2D, t: ReturnType<typeof torsoSize>,
  yaw: number, len: number, wt: number, wb: number, ht: number, hb: number, fold: number,
) {
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const P = FIGURE_PX
  const line = (c: number, w: number) => { ctx.strokeStyle = hex(c); ctx.lineWidth = w; ctx.lineCap = 'round' }
  ctx.save()
  ctx.clip(p)
  // Cuello: anillo alrededor del arranque del cuello (la cabeza tapa la mitad de atrás)
  const nrx = 0.042 * P
  line(tone(WHITE, 0.62), 0.8)
  ctx.beginPath()
  ctx.ellipse(fx * t.depth * 0.3 * P, Math.max(0.3, ht * 0.25), nrx, Math.max(0.9, nrx * 0.45 + ht * 0.3), 0, 0, Math.PI * 2)
  ctx.stroke()
  // Costuras laterales: el costado que mira a cámara
  line(tone(WHITE, 0.8), 0.45)
  for (const s of [-1, 1]) {
    if (s * fx < 0.2) continue
    ctx.beginPath()
    ctx.moveTo(-s * fz * t.sh * P * 0.92, ht * 0.4)
    ctx.lineTo(-s * fz * t.hip * P * 0.92, len + hb)
    ctx.stroke()
  }
  // Bajo de la camiseta
  line(tone(WHITE, 0.78), 0.55)
  ctx.beginPath()
  ctx.ellipse(0, len - 1.1, wb, Math.max(0.5, hb), 0, Math.PI * 0.05, Math.PI * 0.95)
  ctx.stroke()
  if (fold > 0) {
    const rows = fold === 1 ? [0.64] : [0.56, 0.73]
    line(tone(WHITE, fold > 1 ? 0.7 : 0.77), 0.6)
    const sag = 0.8 + 0.5 * fold
    for (const f of rows) {
      const y = len * f
      const w = wt + (wb - wt) * f
      ctx.beginPath()
      if (fz > 0.2) {
        // Arruga de la tripa: curva hacia abajo, centrada en el frente del tronco
        const cx = fx * w * 0.3
        const hw = w * 0.55 * Math.max(0.45, fz)
        ctx.moveTo(cx - hw, y)
        ctx.quadraticCurveTo(cx, y + 2 * sag, cx + hw, y)
      } else if (Math.abs(fx) > 0.5) {
        // De lado: del pecho (delante) hacia el costado
        const sx = Math.sign(fx)
        ctx.moveTo(sx * w, y - 0.5)
        ctx.quadraticCurveTo(sx * w * 0.7, y + sag, sx * w * 0.2, y + 1.6 * sag)
      }
      ctx.stroke()
    }
    if (fz < -0.2 && fold === 2) {
      // Espalda estirada al ir muy inclinado: el bajo tira hacia arriba
      line(tone(WHITE, 0.86), 0.5)
      ctx.beginPath()
      ctx.moveTo(-wb * 0.6, len * 0.88)
      ctx.quadraticCurveTo(0, len * 0.88 - 1.4, wb * 0.6, len * 0.88)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Cabeza con casco (o sin él) para una vista; ancla en el centro de la cabeza. */
export function headFrame(atlas: PuppetAtlas, d: RigDims, v: number, kit: RigKit): FrameRef {
  const r = d.headR * FIGURE_PX
  const aspect = RIG_PROPORTIONS.headAspect
  const yaw = viewYaw(v)
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const rx = -fz
  const rz = fx
  const proj = (x: number, y: number, z: number): [number, number] =>
    [(x * rx + z * fx) * r, (-y + (x * rz + z * fz) * F) * r]
  const eyes: [number, number][] = []
  for (const side of [-1, 1]) {
    if (side * 0.34 * rz + 0.93 * fz > 0.25) eyes.push(proj(side * 0.34, 0.02, 0.93))
  }
  const ear = Math.abs(rz) > 0.35 && fz > -0.7 ? proj(Math.sign(rz) * 0.92, -0.05, -0.05) : null
  const spec: HeadSpec = {
    r, aspect, skin: kit.skin, hair: kit.hair, helmet: kit.helmet, cage: kit.cage, fx, fz, eyes, ear,
  }
  const w = r * aspect * 1.3
  return atlas.ensure(`head-${kit.skin}-${kit.hair}-${kit.helmet ?? 'none'}-${kit.cage ? 1 : 0}-${v}`, { left: -w - M, right: w + M, top: -1.25 * r - M, bottom: 1.25 * r + M }, ctx => {
    paintHead(ctx, spec)
  })
}

/** Largo nominal de la espinillera del portero (de sobre la rodilla al tobillo). */
export const padLen = (d: RigDims) => d.shin * 1.12

/** Espinillera de portero: bloque ancho y acolchado con franja de equipo; de espaldas se ven las correas. */
export function padFrame(atlas: PuppetAtlas, d: RigDims, v: number, kit: RigKit): FrameRef {
  const yaw = viewYaw(v)
  const c = Math.abs(Math.cos(yaw))
  const front = Math.cos(yaw) > -0.3
  const w = (0.075 * c + 0.045 * Math.abs(Math.sin(yaw))) * FIGURE_PX
  const len = padLen(d) * FIGURE_PX
  const top = 0.03 * FIGURE_PX
  return atlas.ensure(`pad-${kit.id}-${v}`, { left: -w - M, right: w + M, top: -top - M, bottom: len + top + M }, ctx => {
    const p = new Path2D()
    p.roundRect(-w, -top, 2 * w, len + 2 * top, Math.min(w, 2.2))
    paintShape(ctx, p, RIG_GEAR.pad, w)
    ctx.save()
    ctx.clip(p)
    if (front) {
      for (const f of [0.16, 0.4, 0.62, 0.84]) detailLine(ctx, -w, len * f, w, len * f, tone(RIG_GEAR.pad, 0.78), 0.55)
      ctx.fillStyle = hex(kit.trim)
      ctx.fillRect(-w * 0.22 * c - 0.4, -top, w * 0.44 * c + 0.8, len + 2 * top)
    } else {
      for (const f of [0.25, 0.6]) detailLine(ctx, -w, len * f, w, len * f, RIG_GEAR.boot, 1.1)
    }
    ctx.restore()
  })
}

/** Manopla (mano libre del portero): bolsillo con red en T y puño; de espaldas, el dorso en el color de equipo. */
export function mittFrame(atlas: PuppetAtlas, v: number, kit: RigKit, inner: number): FrameRef {
  const yaw = viewYaw(v)
  const fz = Math.cos(yaw)
  const wx = 0.082 * Math.max(0.5, Math.abs(fz)) * FIGURE_PX
  const hy = 0.09 * FIGURE_PX
  // Lado del pulgar en pantalla: hacia el centro del cuerpo
  const thumb = -Math.cos(yaw) * inner
  return atlas.ensure(`mitt-${kit.id}-${inner}-${v}`, { left: -wx * 1.6 - M, right: wx * 1.6 + M, top: -hy - M, bottom: hy * 1.3 + M }, ctx => {
    paintShape(ctx, ellipsePath(thumb * wx * 0.85, hy * 0.2, wx * 0.45, hy * 0.5), fz > -0.3 ? RIG_GEAR.pad : kit.trim, wx * 0.4)
    const body = ellipsePath(0, 0, wx, hy)
    paintShape(ctx, body, fz > -0.3 ? RIG_GEAR.pad : kit.trim, wx)
    if (fz > -0.3) {
      ctx.save()
      ctx.clip(body)
      ctx.fillStyle = hex(tone(RIG_GEAR.pad, 0.8))
      ctx.fill(ellipsePath(thumb * wx * 0.1, hy * 0.15, wx * 0.55, hy * 0.5))
      detailLine(ctx, thumb * wx * 0.35, -hy, thumb * wx * 0.35, -hy * 0.2, RIG_GEAR.blade, 0.8)
      detailLine(ctx, thumb * wx * 0.05, -hy * 0.55, thumb * wx * 0.7, -hy * 0.55, RIG_GEAR.blade, 0.6)
      ctx.restore()
    }
    const cuff = new Path2D()
    cuff.roundRect(-wx * 0.75, hy * 0.7, wx * 1.5, hy * 0.55, 1)
    paintShape(ctx, cuff, kit.trim, hy * 0.25)
  })
}

/** Guante de stick del portero con su escudo (blocker) en el dorso. */
export function blockerFrame(atlas: PuppetAtlas, v: number, kit: RigKit): FrameRef {
  const yaw = viewYaw(v)
  const fz = Math.cos(yaw)
  const wx = 0.06 * Math.max(0.3, Math.abs(fz)) * FIGURE_PX
  const hy = 0.075 * FIGURE_PX
  return atlas.ensure(`blocker-${kit.id}-${v}`, { left: -wx - M, right: wx + M, top: -hy - M, bottom: hy + M }, ctx => {
    const p = new Path2D()
    p.roundRect(-wx, -hy, 2 * wx, 2 * hy, Math.min(wx, 1.5))
    paintShape(ctx, p, fz > -0.3 ? RIG_GEAR.pad : kit.trim, wx)
    if (fz > -0.3 && wx > 1.5) {
      ctx.strokeStyle = hex(kit.trim)
      ctx.lineWidth = 0.7
      ctx.strokeRect(-wx + 1.1, -hy + 1.1, 2 * wx - 2.2, 2 * hy - 2.2)
    }
  })
}

/** Dorsal (SPEC §5): grande a la espalda, pequeño en el pecho. */
export function numberFrame(atlas: PuppetAtlas, text: string, size: number, c: number): FrameRef {
  const px = size * FIGURE_PX
  const w = px * 0.42 * text.length + 1.8
  const h = px * 0.62 + 1.5
  return atlas.ensure(`num-${text}-${size}-${c}`, { left: -w, right: w, top: -h, bottom: h }, ctx => {
    paintNumber(ctx, text, px, c)
  })
}
