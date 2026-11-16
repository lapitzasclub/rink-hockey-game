/**
 * Piezas dibujables de un prototipo (WP-20): del esqueleto proyectado salen
 * cápsulas, polígonos convexos y elipses en px de pantalla a escala 1,
 * ordenadas por profundidad. Los pintores de cada estilo solo las rellenan.
 */
import {
  add, dirToScreen, lerp3, makeView, mul, sub, toScreen, v3,
  type P2, type Proportions, type Skeleton, type V3, type View,
} from './rig'

export type Part =
  | { k: 'cap'; a: P2; b: P2; ra: number; rb: number; c: number; d: number }
  | { k: 'poly'; pts: P2[]; c: number; d: number }
  | { k: 'ell'; x: number; y: number; rx: number; ry: number; c: number; d: number }
  | { k: 'num'; x: number; y: number; size: number; text: string; c: number; d: number }
  | { k: 'shadow'; x: number; y: number; rx: number; ry: number; d: number }
  | HeadPart

export interface HeadPart {
  k: 'head'
  x: number; y: number; r: number; aspect: number
  skin: number; hair: number; helmet: number | null; cage: boolean
  /** Dirección de la cara en pantalla: x lateral, z hacia cámara. */
  fx: number; fz: number
  eyes: P2[]
  ear: P2 | null
  d: number
}

/** Colores de una figura. `helmet` null = sin casco (variante D4). */
export interface Kit {
  jersey: number; shorts: number; socks: number; gloves: number
  helmet: number | null; number: string; numColor: number
  skin: number; hair: number
  trim?: number
}

export const GEAR = {
  boot: 0x24272e,
  plate: 0x9aa4ae,
  wheel: 0xeee6cf,
  toeStop: 0xd2a86e,
  kneePad: 0x22252b,
  shaft: 0xcf9a5c,
  blade: 0x1b1d22,
  pad: 0xf2eee5,
  cage: 0xc3cad2,
  refShirt: 0x2e323a,
  refPants: 0x15171b,
  fluor: 0xd8ff2b,
} as const

const UP = v3(0, 1, 0)
const SIDE = v3(1, 0, 0)

/** Envolvente convexa (cadena monótona) de puntos de pantalla. */
function hull(pts: P2[]): P2[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  const cross = (o: P2, a: P2, b: P2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: P2[] = []
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: P2[] = []
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1))
}

/** Acumulador de piezas para una vista y una unidad (px por altura de figura). */
class PartList {
  readonly parts: Part[] = []
  readonly view: View
  private readonly unit: number
  private readonly limb: number
  constructor(view: View, unit: number, limb: number) {
    this.view = view
    this.unit = unit
    this.limb = limb
  }

  pt(p: V3): P2 {
    return toScreen(this.view, p, this.unit)
  }

  /** Cápsula entre dos puntos; los radios van en unidades de figura y escalan con `limb`. */
  cap(a: V3, b: V3, ra: number, rb: number, c: number, bias = 0, thick = true) {
    const pa = this.pt(a)
    const pb = this.pt(b)
    const m = (thick ? this.limb : 1) * this.unit
    this.parts.push({ k: 'cap', a: pa, b: pb, ra: ra * m, rb: rb * m, c, d: (pa.d + pb.d) / 2 + bias })
  }

  /** Tronco de prisma de `a` a `b`; secciones (ancho lateral, fondo) en cada extremo. */
  prism(a: V3, b: V3, wa: number, da: number, wb: number, db: number, c: number, bias = 0) {
    const pts: P2[] = []
    for (const [o, w, dd] of [[a, wa, da], [b, wb, db]] as const) {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) pts.push(this.pt(add(o, v3(sx * w, 0, sz * dd))))
    }
    const pa = this.pt(a)
    const pb = this.pt(b)
    this.parts.push({ k: 'poly', pts: hull(pts), c, d: (pa.d + pb.d) / 2 + bias })
  }

  /** Caja a lo largo de `a`→`b` con dos semiejes de sección arbitrarios. */
  box(a: V3, b: V3, u: V3, w: V3, c: number, bias = 0) {
    const pts: P2[] = []
    for (const o of [a, b]) for (const su of [-1, 1]) for (const sw of [-1, 1]) {
      pts.push(this.pt(add(o, add(mul(u, su), mul(w, sw)))))
    }
    const pa = this.pt(a)
    const pb = this.pt(b)
    this.parts.push({ k: 'poly', pts: hull(pts), c, d: (pa.d + pb.d) / 2 + bias })
  }

  /** Rueda: disco en el plano avance-vertical del pie, visto de canto o de lado según la vista. */
  wheel(center: V3, foot: V3, r: number, c: number) {
    const p = this.pt(center)
    const side = Math.abs(dirToScreen(this.view, foot).x)
    this.parts.push({
      k: 'ell', x: p.x, y: p.y, rx: Math.max(r * side, 0.014) * this.unit, ry: r * this.unit, c, d: p.d,
    })
  }

  blob(center: V3, r: number, c: number, bias = 0, ry = r) {
    const p = this.pt(center)
    const m = this.limb * this.unit
    this.parts.push({ k: 'ell', x: p.x, y: p.y, rx: r * m, ry: ry * m, c, d: p.d + bias })
  }

  shadow(center: V3, rx: number) {
    const p = this.pt(center)
    this.parts.push({ k: 'shadow', x: p.x, y: p.y, rx: rx * this.unit, ry: rx * 0.32 * this.unit, d: -99 })
  }

  number(center: V3, size: number, text: string, c: number, bias: number) {
    const p = this.pt(center)
    this.parts.push({ k: 'num', x: p.x, y: p.y, size: size * this.unit, text, c, d: p.d + bias })
  }

  head(s: Skeleton, kit: Kit, cage: boolean, aspect: number) {
    const p = this.pt(s.headC)
    const f = dirToScreen(this.view, v3(0, 0, 1))
    const r = s.headR
    const eyes: P2[] = []
    for (const side of [-1, 1]) {
      const local = v3(side * 0.34 * r, 0.02 * r, 0.93 * r)
      if (dirToScreen(this.view, local).z > 0.25 * r) eyes.push(this.pt(add(s.headC, local)))
    }
    const rz = this.view.rz
    const ear = Math.abs(rz) > 0.35 && f.z > -0.7
      ? this.pt(add(s.headC, v3(Math.sign(rz) * 0.92 * r, -0.05 * r, -0.05 * r)))
      : null
    this.parts.push({
      k: 'head', x: p.x, y: p.y, r: r * this.unit, aspect,
      skin: kit.skin, hair: kit.hair, helmet: kit.helmet, cage,
      fx: f.x, fz: f.z, eyes, ear, d: p.d + 0.02,
    })
  }

  sorted(): Part[] {
    return this.parts.map((p, i) => ({ p, i })).sort((a, b) => a.p.d - b.p.d || a.i - b.i).map(e => e.p)
  }
}

function skates(L: PartList, s: Skeleton, P: Proportions) {
  const wr = P.skate * 0.36
  for (let i = 0; i < 2; i++) {
    const a = s.ankle[i]
    const f = s.footDir[i]
    const lat = v3(f.z, 0, -f.x)
    const ground = v3(a.x, 0, a.z)
    const sole = 2 * wr + 0.012
    const at = (along: number, y: number) => add(add(ground, mul(f, along)), v3(0, y, 0))
    for (const along of [-0.03, 0.065]) {
      for (const sd of [-1, 1]) L.wheel(add(at(along, wr), mul(lat, sd * 0.026)), f, wr, GEAR.wheel)
    }
    L.cap(at(-0.04, 2 * wr), at(0.075, 2 * wr), 0.008, 0.008, GEAR.plate, 0.001, false)
    L.blob(at(0.1, wr * 0.95), wr * 0.55, GEAR.toeStop, 0.002)
    L.cap(add(a, v3(0, 0.045, 0)), at(-0.03, sole + 0.02), 0.034, 0.032, GEAR.boot, 0.003)
    L.cap(at(-0.03, sole + 0.02), at(0.085, sole + 0.012), 0.03, 0.024, GEAR.boot, 0.003)
  }
}

function stick(L: PartList, s: Skeleton) {
  if (!s.stick) return
  const { top, heel, toe } = s.stick
  const mid = lerp3(top, heel, 0.5)
  L.cap(top, mid, 0.011, 0.011, GEAR.shaft, 0, false)
  L.cap(mid, heel, 0.011, 0.011, GEAR.shaft, 0, false)
  L.cap(heel, toe, 0.017, 0.013, GEAR.blade, 0.001, false)
}

function armsParts(L: PartList, s: Skeleton, sleeve: number, fore: number, glove: number, gloveR: number) {
  for (let i = 0; i < 2; i++) {
    L.cap(s.sh[i], s.el[i], 0.036, 0.031, sleeve)
    L.cap(s.el[i], s.hand[i], 0.031, 0.027, fore, 0.001)
    L.blob(s.hand[i], gloveR, glove, 0.003)
  }
}

function skaterParts(L: PartList, s: Skeleton, kit: Kit, P: Proportions) {
  L.shadow(v3(0, 0, 0.02), 0.2)
  skates(L, s, P)
  for (let i = 0; i < 2; i++) {
    L.cap(s.ankle[i], s.knee[i], 0.032, 0.036, kit.socks)
    L.cap(s.knee[i], s.hip[i], 0.04, 0.046, kit.socks)
    L.blob(s.knee[i], 0.044, GEAR.kneePad, 0.004, 0.05)
    L.cap(s.hip[i], lerp3(s.hip[i], s.knee[i], 0.55), 0.058, 0.052, kit.shorts, 0.002)
  }
  const k = s.k
  L.prism(add(s.pelvis, v3(0, -0.04 * k, 0)), add(s.pelvis, v3(0, 0.03 * k, 0)), 0.12 * k, 0.07 * k, 0.12 * k, 0.07 * k, kit.shorts)
  torso(L, s, kit.jersey, 0.115, 0.14)
  numbers(L, s, kit)
  L.cap(s.neck, add(s.neck, v3(0, 0.03, 0)), 0.028, 0.028, kit.skin, -0.01)
  armsParts(L, s, kit.jersey, kit.jersey, kit.gloves, 0.044)
  stick(L, s)
  L.head(s, kit, false, 1)
}

function torso(L: PartList, s: Skeleton, c: number, wHip: number, wSh: number, depth = 0.075, bias = 0) {
  const k = s.k
  const axis = sub(s.shoulderC, s.pelvis)
  const base = add(s.pelvis, mul(axis, 0.05))
  const topP = add(s.shoulderC, mul(UP, 0.01))
  L.prism(base, topP, wHip * k, depth * k, wSh * k, depth * k, c, bias)
}

function numbers(L: PartList, s: Skeleton, kit: Kit) {
  const f = dirToScreen(L.view, v3(0, 0, 1))
  const mid = lerp3(s.pelvis, s.shoulderC, 0.55)
  if (f.z < -0.3) L.number(add(mid, v3(0, 0, -0.09 * s.k)), 0.12, kit.number, kit.numColor, 0.2)
  else if (f.z > 0.45) L.number(add(lerp3(s.pelvis, s.shoulderC, 0.75), v3(0.05 * s.k, 0, 0.09 * s.k)), 0.055, kit.number, kit.numColor, 0.2)
}

function goalieParts(L: PartList, s: Skeleton, kit: Kit) {
  L.shadow(v3(0, 0, 0), 0.42)
  const k = s.k
  for (let i = 0; i < 2; i++) {
    const kn = s.knee[i]
    const an = s.ankle[i]
    const along = sub(an, kn)
    const perp = mul(v3(-along.z, 0, along.x), 0.035 / Math.hypot(along.x, along.z))
    L.cap(an, add(an, mul(s.footDir[i], 0.09)), 0.03, 0.026, GEAR.boot, -0.02, false)
    L.box(add(kn, v3(0, 0.015, 0)), add(an, v3(0, 0.015, 0)), mul(UP, 0.065), perp, GEAR.pad)
    L.cap(add(kn, v3(0, 0.03, 0.04)), add(an, v3(0, 0.03, 0.04)), 0.012, 0.012, kit.trim ?? kit.jersey, 0.001, false)
    L.cap(s.hip[i], kn, 0.07, 0.065, kit.shorts, 0.03)
  }
  torso(L, s, kit.jersey, 0.13, 0.19, 0.12, 0.05)
  for (const sh of s.sh) L.blob(add(sh, v3(0, 0, 0.04)), 0.07, kit.jersey, 0.06)
  L.cap(s.neck, add(s.neck, v3(0, 0.03, 0)), 0.03, 0.03, kit.skin, -0.01)
  armsParts(L, s, kit.jersey, kit.jersey, GEAR.pad, 0.05)
  L.blob(add(s.hand[0], v3(-0.02, 0.02, 0.02)), 0.075, GEAR.pad, 0.08, 0.085)
  L.blob(add(s.hand[0], v3(-0.02, 0.02, 0.03)), 0.04, kit.trim ?? kit.jersey, 0.081, 0.05)
  L.box(add(s.hand[1], v3(0, -0.04, 0.03)), add(s.hand[1], v3(0, 0.07, 0.03)), mul(SIDE, 0.045 * k), v3(0, 0, 0.015), GEAR.pad, 0.08)
  stick(L, s)
  L.head(s, { ...kit, helmet: GEAR.pad }, true, 1.04)
}

function refParts(L: PartList, s: Skeleton, kit: Kit) {
  L.shadow(v3(0, 0, 0), 0.17)
  for (let i = 0; i < 2; i++) {
    const a = s.ankle[i]
    const f = s.footDir[i]
    L.cap(v3(a.x, 0.025, a.z - 0.02), add(v3(a.x, 0.02, a.z), mul(f, 0.08)), 0.03, 0.026, GEAR.boot, 0.003)
    L.cap(a, s.knee[i], 0.036, 0.04, GEAR.refPants)
    L.cap(s.knee[i], s.hip[i], 0.042, 0.05, GEAR.refPants)
  }
  const k = s.k
  L.prism(add(s.pelvis, v3(0, -0.04 * k, 0)), add(s.pelvis, v3(0, 0.03 * k, 0)), 0.11 * k, 0.07 * k, 0.11 * k, 0.07 * k, GEAR.refPants)
  torso(L, s, GEAR.refShirt, 0.11, 0.13)
  L.cap(s.sh[0], s.sh[1], 0.012, 0.012, GEAR.fluor, 0.06, false)
  L.cap(s.neck, add(s.neck, v3(0, 0.03, 0)), 0.03, 0.03, kit.skin, -0.01)
  for (let i = 0; i < 2; i++) {
    const cuff = lerp3(s.sh[i], s.el[i], 0.8)
    L.cap(s.sh[i], cuff, 0.036, 0.033, GEAR.refShirt)
    L.cap(lerp3(s.sh[i], s.el[i], 0.72), cuff, 0.035, 0.035, GEAR.fluor, 0.001)
    L.cap(cuff, s.el[i], 0.025, 0.024, kit.skin)
    L.cap(s.el[i], s.hand[i], 0.024, 0.022, kit.skin, 0.001)
    L.blob(s.hand[i], 0.026, kit.skin, 0.002)
  }
  L.head(s, { ...kit, helmet: null }, false, 1)
}

/** Piezas ordenadas de lejos a cerca para una figura vista con `yaw`. */
export function buildParts(s: Skeleton, kit: Kit, P: Proportions, yaw: number, unit: number): Part[] {
  const view = makeView(yaw)
  const L = new PartList(view, unit, P.limb)
  if (s.kind === 'skater') skaterParts(L, s, kit, P)
  else if (s.kind === 'goalie') goalieParts(L, s, kit)
  else refParts(L, s, kit)
  const parts = L.sorted()
  for (const p of parts) if (p.k === 'head') p.aspect *= P.headAspect
  return parts
}
