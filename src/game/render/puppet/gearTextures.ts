/**
 * Marcos de atlas del equipamiento de cerca del patinador (E-18): patín quad con
 * sus fases de giro de rueda, espinillera, rodillera y guante. Como el resto del
 * rig, se pintan una vez al crear la figura; el giro de las ruedas es solo
 * cambiar de marco (`PuppetRig.apply`).
 */
import { RIG_FLOOR_FORESHORTEN, RIG_GEAR, RIG_PROPORTIONS } from '../artSpec'
import type { FrameRef, PuppetAtlas } from './atlas'
import { GLOVE, KNEE_PAD, SHIN_GUARD, SKATE } from './gearSpec'
import {
  capsulePath, detailLine, ellipsePath, fillShaded, hex, paintShape, paintUnion, polyPath, strokeOutline, tone,
} from './paint'
import { rigDims, type RigDims } from './skeleton'
import { FIGURE_PX, VIEWS, WHITE } from './textures'

type P2 = [number, number]
const PX = FIGURE_PX
const M = 1.6
const L = RIG_PROPORTIONS.limb
const F = RIG_FLOOR_FORESHORTEN
const TAU = Math.PI * 2

/** Proyección del marco del pie (x = derecha, y = arriba, z = punta) para la vista `v`. */
function footView(v: number) {
  const yaw = (v * Math.PI) / 4
  const fx = Math.sin(yaw)
  const fz = Math.cos(yaw)
  const pr = (x: number, y: number, z: number): P2 => [(x * -fz + z * fx) * PX, (-y + (x * fx + z * fz) * F) * PX]
  const depth = (x: number, z: number) => x * fx + z * fz
  return { fx, fz, pr, depth }
}
type FootView = ReturnType<typeof footView>

/** Envolvente convexa (cadena monótona); solo al hornear. */
function hull(pts: P2[]): P2[] {
  const s = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: P2[]) => {
    const out: P2[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(s), ...half(s.slice().reverse())]
}

/**
 * Rueda: cilindro de eje lateral con su banda de rodadura y la cara que da a
 * cámara. `mark` = ángulo de la marca que gira (null = rueda corrida a toda velocidad).
 * Vista de frente, la marca recorre la banda; de lado, gira en la cara.
 */
function paintWheel(ctx: CanvasRenderingContext2D, fv: FootView, cx: number, cz: number, mark: number | null) {
  const S = SKATE
  const C = S.colors
  const R = S.wheelR
  const hw = S.wheelHalfW
  const rim = (x: number, r: number, t: number): P2 => fv.pr(x, R + r * Math.cos(t), cz + r * Math.sin(t))
  const ring = (x: number, r: number) => Array.from({ length: 20 }, (_, k) => rim(x, r, (k / 20) * TAU))
  const body = polyPath(hull([...ring(cx - hw, R), ...ring(cx + hw, R)]))
  const size = R * PX
  paintShape(ctx, body, C.tread, size, true)
  const side = Math.abs(fv.fx)
  if (side > 0.2) {
    const x = cx + (fv.fx >= 0 ? hw : -hw)
    const face = polyPath(ring(x, R * 0.97))
    fillShaded(ctx, face, C.wheel, size * side)
    ctx.lineWidth = 0.35
    ctx.strokeStyle = hex(tone(C.tread, 0.72))
    ctx.stroke(face)
    if (mark !== null) {
      const [a, b] = [rim(x, R * 0.8, mark), rim(x, R * 0.8, mark + Math.PI)]
      detailLine(ctx, a[0], a[1], b[0], b[1], C.mark, Math.max(0.45, size * 0.3))
    } else {
      // Corrida: la marca se emborrona en anillos
      for (const [r, al] of [[0.62, 0.55], [0.84, 0.3]]) {
        ctx.strokeStyle = hex(C.mark, al)
        ctx.lineWidth = size * 0.2
        ctx.stroke(polyPath(ring(x, R * r)))
      }
    }
    const hub = polyPath(ring(x, R * 0.34))
    ctx.fillStyle = hex(C.hub)
    ctx.fill(hub)
    ctx.fillStyle = hex(tone(C.hub, 1.4))
    const hi = rim(x, R * 0.12, -Math.PI * 0.3)
    ctx.fill(ellipsePath(hi[0], hi[1], size * 0.12, size * 0.12))
  }
  if (Math.abs(fv.fz) > 0.3 && mark !== null) {
    // Banda de rodadura: la marca pasa por la parte que mira a cámara (arriba y delante)
    ctx.save()
    ctx.clip(body)
    for (const t of [mark, mark + Math.PI]) {
      if (Math.sin(t) * fv.fz + Math.cos(t) * 0.6 < 0.15) continue
      const a = fv.pr(cx - hw, R + R * Math.cos(t), cz + R * Math.sin(t))
      const b = fv.pr(cx + hw, R + R * Math.cos(t), cz + R * Math.sin(t))
      detailLine(ctx, a[0], a[1], b[0], b[1], C.mark, Math.max(0.5, size * 0.32))
    }
    ctx.restore()
  }
}

/** Bota alta con volumen: silueta única, ribete de suela, brillo de la piel y cordones. */
function paintBoot(ctx: CanvasRenderingContext2D, fv: FootView) {
  const C = SKATE.colors
  const sole = 2 * SKATE.wheelR + 0.012
  const ankleY = rigDims('skater').ankleY
  const shaftA: [number, number, number] = [0, ankleY + 0.045, 0]
  const shaftB: [number, number, number] = [0, sole + 0.02, -0.03]
  const toe: [number, number, number] = [0, sole + 0.012, 0.085]
  const [ra, rb, rt] = [0.034 * L, 0.032 * L, 0.024 * L]
  const a = fv.pr(...shaftA)
  const b = fv.pr(...shaftB)
  const t = fv.pr(...toe)
  const boot = new Path2D()
  boot.addPath(capsulePath(a[0], a[1], b[0], b[1], ra * PX, rb * PX))
  boot.addPath(capsulePath(b[0], b[1], t[0], t[1], 0.03 * L * PX, rt * PX))
  const size = rb * PX
  paintUnion(ctx, boot, C.boot, size)
  ctx.save()
  ctx.clip(boot)
  // Suela: franja baja de la bota sobre la placa
  const s0 = fv.pr(0, 0.036, -0.06)
  const s1 = fv.pr(0, 0.034, 0.115)
  ctx.fillStyle = hex(C.welt)
  ctx.fill(capsulePath(s0[0], s0[1], s1[0], s1[1], 0.03 * PX, 0.03 * PX))
  // Brillo de la piel a la luz (arriba a la izquierda) en la caña y la puntera
  const g = ra * PX * 0.45
  detailLine(ctx, a[0] - g, a[1] - g * 0.2, b[0] - g, b[1] - g * 0.6, C.gloss, Math.max(0.6, size * 0.28))
  ctx.fillStyle = hex(C.gloss)
  ctx.fill(ellipsePath(t[0] - rt * PX * 0.35, t[1] - rt * PX * 0.45, rt * PX * 0.32, rt * PX * 0.22))
  if (fv.fz > -0.35) {
    // Cordones: cruces sobre el empeine y por delante de la caña
    const lace = (x: number, y: number, z: number) => {
      const p = fv.pr(x - 0.011, y, z)
      const q = fv.pr(x + 0.011, y, z)
      detailLine(ctx, p[0], p[1], q[0], q[1], C.lace, 0.45)
    }
    for (const u of [0.22, 0.42, 0.62]) {
      const y = shaftB[1] + (toe[1] - shaftB[1]) * u + (0.03 + (0.024 - 0.03) * u) * L * 0.8
      lace(0, y, shaftB[2] + (toe[2] - shaftB[2]) * u)
    }
    for (const u of [0.25, 0.55]) lace(0, shaftA[1] + (shaftB[1] - shaftA[1]) * u, shaftA[2] + (shaftB[2] - shaftA[2]) * u + ra * 0.9)
  } else {
    // De espaldas: costura del contrafuerte
    detailLine(ctx, a[0], a[1], b[0], b[1] + rb * PX * 0.4, C.gloss, 0.5)
  }
  ctx.restore()
}

/** Pieza del patín con su profundidad (para pintarlas de atrás adelante). */
interface Piece { d: number; paint: () => void }

function paintSkate(ctx: CanvasRenderingContext2D, fv: FootView, spin: number | null) {
  const S = SKATE
  const C = S.colors
  const R = S.wheelR
  const pieces: Piece[] = []
  const cap = (a: [number, number, number], b: [number, number, number], ra: number, rb: number, c: number, bias: number, thin = true) => {
    pieces.push({
      d: fv.depth((a[0] + b[0]) / 2, (a[2] + b[2]) / 2) + bias,
      paint: () => {
        const p = fv.pr(...a)
        const q = fv.pr(...b)
        paintShape(ctx, capsulePath(p[0], p[1], q[0], q[1], ra * PX, rb * PX), c, Math.min(ra, rb) * PX, thin)
      },
    })
  }
  S.axleZ.forEach((cz, k) => {
    cap([-S.wheelX, R, cz], [S.wheelX, R, cz], 0.0045, 0.0045, C.truck, 0)
    cap([0, 2 * R, cz - 0.004], [0, R, cz], 0.0068, 0.0055, C.truck, 0.0002)
    for (const sd of [-1, 1]) {
      const x = sd * S.wheelX
      // Desfase fijo entre ruedas: las cuatro marcas no van alineadas
      const m = spin === null ? null : spin + k * 0.6 + (sd < 0 ? 0.25 : 0)
      pieces.push({ d: fv.depth(x, cz), paint: () => paintWheel(ctx, fv, x, cz, m) })
    }
  })
  cap([0, 2 * R + 0.002, -0.045], [0, 2 * R + 0.002, 0.08], 0.0085, 0.0085, RIG_GEAR.plate, 0.001)
  // Freno delantero (taco): cono de goma inclinado hacia delante y su cara de apoyo más oscura
  cap([0, 2 * R - 0.002, 0.084], [0, R * 0.5, 0.108], 0.0105, 0.0135, C.toeStop, 0.002)
  cap([0, R * 0.66, 0.104], [0, R * 0.48, 0.109], 0.012, 0.0128, C.toeFace, 0.0021)
  pieces.push({ d: fv.depth(0, -0.01) + 0.003, paint: () => paintBoot(ctx, fv) })
  pieces.sort((a, b) => a.d - b.d)
  for (const p of pieces) p.paint()
}

/** Zapatilla de calle (oficiales y banquillo). */
function paintShoe(ctx: CanvasRenderingContext2D, fv: FootView) {
  const a = fv.pr(0, 0.025, -0.02)
  const b = fv.pr(0, 0.02, 0.08)
  paintShape(ctx, capsulePath(a[0], a[1], b[0], b[1], 0.03 * L * PX, 0.026 * L * PX), RIG_GEAR.shoe, 0.026 * L * PX)
}

/**
 * Marcos del calzado: `[variante][vista]`. El patín tiene `SKATE.spinFrames` fases de
 * giro en media vuelta y, al final, la rueda corrida; la zapatilla, una sola variante.
 */
export function skateFrames(atlas: PuppetAtlas, footwear: 'skate' | 'shoe'): FrameRef[][] {
  const ext = 0.15 * PX
  const box = { left: -ext, right: ext, top: -(rigDims('skater').ankleY + 0.1) * PX, bottom: 0.08 * PX }
  const views = Array.from({ length: VIEWS }, (_, v) => v)
  if (footwear === 'shoe') return [views.map(v => atlas.ensure(`shoe-${v}`, box, ctx => paintShoe(ctx, footView(v))))]
  const n = SKATE.spinFrames
  return Array.from({ length: n + 1 }, (_, k) => views.map(v => atlas.ensure(`skate-q-${v}-${k}`, box, ctx => {
    paintSkate(ctx, footView(v), k < n ? (k / n) * Math.PI : null)
  })))
}

/** Vista del cuerpo: eje adelante en pantalla (`fx`) y cuánto mira a cámara (`fz`). */
function bodyView(v: number) {
  const yaw = (v * Math.PI) / 4
  return { fx: Math.sin(yaw), fz: Math.cos(yaw) }
}

/**
 * Espinillera bajo la media (pieza blanca que tiñe la media): abombada por
 * delante y con el gemelo por detrás según la vista; ancla en la rodilla, a lo largo de +y.
 */
export function shinFrame(atlas: PuppetAtlas, d: RigDims, v: number): FrameRef {
  const G = SHIN_GUARD
  const { fx, fz } = bodyView(v)
  const len = d.shin * PX
  const [ra, rb] = [G.ra * L * PX, G.rb * L * PX]
  const bump = (t: number, c: number, w: number) => Math.max(0, 1 - ((t - c) / w) ** 2)
  const half = (t: number, side: number) => {
    const guard = G.guard * PX * bump(t, 0.45, 0.5)
    const calf = G.calf * PX * bump(t, 0.28, 0.3)
    const lateral = Math.abs(fx) * (side * fx > 0 ? guard : calf)
    return ra + (rb - ra) * t + lateral + (fz > 0 ? fz * guard * 0.45 : -fz * calf * 0.6)
  }
  const n = 12
  const pts: P2[] = []
  for (let k = 0; k <= n; k++) pts.push([half(k / n, 1), (k / n) * len])
  const capR = (half(1, 1) + half(1, -1)) / 2
  const capX = (half(1, 1) - half(1, -1)) / 2
  for (let k = 1; k < 8; k++) pts.push([capX + capR * Math.cos((k / 8) * Math.PI), len + capR * 0.8 * Math.sin((k / 8) * Math.PI)])
  for (let k = n; k >= 0; k--) pts.push([-half(k / n, -1), (k / n) * len])
  const topR = (half(0, 1) + half(0, -1)) / 2
  const topX = (half(0, 1) - half(0, -1)) / 2
  for (let k = 1; k < 8; k++) pts.push([topX - topR * Math.cos((k / 8) * Math.PI), -topR * 0.8 * Math.sin((k / 8) * Math.PI)])
  const w = ra + (G.guard + G.calf) * PX + M
  return atlas.ensure(`shin-${v}`, { left: -w, right: w, top: -ra - M, bottom: len + rb + M }, ctx => {
    const path = polyPath(pts)
    paintShape(ctx, path, WHITE, rb)
    ctx.save()
    ctx.clip(path)
    if (fz > -0.25) {
      // Cantos de la espinillera: la placa se marca bajo la media
      const cx = fx * ra * 0.45
      const hw = ra * Math.max(0.3, fz) * 0.6
      for (const s of [-1, 1]) detailLine(ctx, cx + s * hw, len * 0.14, cx + s * hw * 0.85, len * 0.84, tone(WHITE, 0.84), 0.45)
    } else {
      detailLine(ctx, -fx * ra * 0.4, len * 0.08, -fx * rb * 0.4, len * 0.9, tone(WHITE, 0.82), 0.4)
    }
    // Arruga de la media sobre la bota
    detailLine(ctx, -rb, len * 0.9, rb, len * 0.92, tone(WHITE, 0.8), 0.45)
    ctx.restore()
  })
}

/**
 * Rodillera de concha dura sobre la rodilla, con su cinta. De frente y de lado la
 * concha (que avanza hacia la punta de la rodilla); de espaldas, las cinchas y las alas.
 */
export function kneePadFrame(atlas: PuppetAtlas, v: number): FrameRef {
  const K = KNEE_PAD
  const C = K.colors
  const { fx, fz } = bodyView(v)
  const [rx, ry, leg] = [K.rx * PX, K.ry * PX, K.legHalf * PX]
  const sx = fx * K.shift * PX
  const w = rx * (1 - 0.28 * Math.abs(fx))
  const ext = Math.max(Math.abs(sx) + w * 1.1, leg * 1.2) + M
  return atlas.ensure(`kneepad-${v}`, { left: -ext, right: ext, top: -ry - M, bottom: ry + M }, ctx => {
    const strap = (y: number, h: number, x0: number, x1: number) => {
      const p = new Path2D()
      p.roundRect(x0, y, x1 - x0, h, h / 2)
      paintShape(ctx, p, C.strap, h, true)
    }
    if (fz > -0.3) {
      strap(ry * 0.3, ry * 0.32, Math.min(sx - w * 1.08, -leg), Math.max(sx + w * 1.08, leg))
      const shell = ellipsePath(sx, 0, w, ry)
      paintShape(ctx, shell, C.shell, w)
      ctx.save()
      ctx.clip(shell)
      const capX = sx + fx * 0.25 * w
      ctx.fillStyle = hex(C.cap)
      ctx.fill(ellipsePath(capX, -ry * 0.12, w * 0.56, ry * 0.5))
      ctx.strokeStyle = hex(C.shine)
      ctx.lineWidth = Math.max(0.45, w * 0.14)
      ctx.beginPath()
      ctx.ellipse(capX, -ry * 0.12, w * 0.4, ry * 0.36, 0, Math.PI * 1.05, Math.PI * 1.45)
      ctx.stroke()
      // Costura del ribete acolchado
      ctx.strokeStyle = hex(tone(C.shell, 1.35))
      ctx.lineWidth = 0.35
      ctx.stroke(ellipsePath(sx, 0, w * 0.82, ry * 0.84))
      ctx.restore()
      return
    }
    // De espaldas: las alas de la concha asoman a los lados de la pierna
    ctx.save()
    ctx.beginPath()
    ctx.rect(-ext, -ry - M, ext - leg * 0.8, 2 * ry + 2 * M)
    ctx.rect(leg * 0.8, -ry - M, ext, 2 * ry + 2 * M)
    ctx.clip()
    paintShape(ctx, ellipsePath(sx, 0, leg * 1.18, ry * 0.9), C.shell, leg)
    ctx.restore()
    strap(-ry * 0.45, ry * 0.26, -leg * 1.02, leg * 1.02)
    strap(ry * 0.3, ry * 0.3, -leg * 1.02, leg * 1.02)
  })
}

/**
 * Guante acolchado (blanco que tiñe el color de guantes): puño de manguito hacia
 * el codo (−y), mano con los dedos en rollos y pulgar del lado `thumb`. El rig lo
 * gira con el antebrazo.
 */
export function gloveFrame(atlas: PuppetAtlas, thumb: 1 | -1): FrameRef {
  const G = GLOVE
  const [co, ci, cl] = [G.cuffOut * PX, G.cuffIn * PX, G.cuffLen * PX]
  const [hy, hx, hr] = [G.handY * PX, G.handRx * PX, G.handRy * PX]
  const tr = G.thumbR * PX
  const ext = Math.max(co, hx + tr * 0.6) + M
  return atlas.ensure(`glove-${thumb}`, { left: -ext, right: ext, top: -cl - M - 0.5, bottom: hy + hr + M }, ctx => {
    const cuff = polyPath([[-co, -cl], [co, -cl], [ci, -hr * 0.1], [-ci, -hr * 0.1]])
    paintShape(ctx, cuff, WHITE, ci)
    ctx.save()
    ctx.clip(cuff)
    detailLine(ctx, -co, -cl * 0.55, co, -cl * 0.55, tone(WHITE, 0.8), 0.45)
    ctx.restore()
    paintShape(ctx, ellipsePath(thumb * hx * 0.85, hy * 0.25, tr, tr * 1.15), WHITE, tr)
    const hand = ellipsePath(0, hy, hx, hr)
    paintShape(ctx, hand, WHITE, hx)
    ctx.save()
    ctx.clip(hand)
    // Rollos de los dedos
    for (const f of [0.05, 0.5]) detailLine(ctx, -hx, hy + hr * f, hx, hy + hr * f, tone(WHITE, 0.72), 0.5)
    ctx.restore()
    strokeOutline(ctx, hand, hx)
  })
}
