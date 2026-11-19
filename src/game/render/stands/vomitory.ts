import { STANDS as S, STANDS_COLORS as SC } from '../artSpec'
import type { Projected } from '../viewTransform'
import { shade } from './fans'
import { CAMERA_FLOOR, M, rowLength, sectionAt, standPoint, tierO, tierZ, type Section, type StandPt } from './layout'
import { concrete, emptyBox, fillBand, grow, strokeLine, type Box } from './structure'

/**
 * Vomitorios de las gradas (WP-68): el foso al nivel de la fila de delante, la
 * boca del túnel con su marco y dintel de hormigón, un poco de luz al fondo del
 * pasillo y el cartel de salida, las paredes laterales escalonadas con su
 * barandilla y el cristal sobre la boca. Apagado: no debe leerse más que la pista.
 */

type Ctx = CanvasRenderingContext2D

const P: Projected = { x: 0, y: 0, s: 0 }
const Q: StandPt = { x: 0, y: 0, nx: 0, ny: 0 }

function vomitoryBox(sec: Section, k: number) {
  const [v0, v1] = sec.vomTiers
  const uv = sec.vomitories[k]
  const hv = (S.vomitoryM * M) / 2 / rowLength(sec, tierO(v0))
  return { uv, hv, v0, v1, zf: tierZ(v0 - 1), oF: tierO(v0), oB: tierO(v1 + 1), zTop: tierZ(v1 + 1) }
}

/** Arista superior de una pared lateral (escalonada) a `dz` sobre los escalones. */
function wallTop(ctx: Ctx, sec: Section, u: number, v0: number, v1: number, dz: number) {
  for (let t = v0; t <= v1; t++) {
    standPoint(sec, u, tierO(t), tierZ(t) + dz, P)
    if (t === v0) ctx.moveTo(P.x, P.y)
    else ctx.lineTo(P.x, P.y)
    standPoint(sec, u, tierO(t + 1), tierZ(t) + dz, P); ctx.lineTo(P.x, P.y)
  }
}

/**
 * Vomitorio `k` del tramo: foso, pared del fondo con la boca enmarcada, túnel
 * con luz tenue y cartel de salida, y la pared lateral que ve la cámara.
 */
export function paintVomitory(ctx: Ctx, sec: Section, k: number, light: number) {
  const { uv, hv, v0, v1, zf, oF, oB, zTop } = vomitoryBox(sec, k)
  const mouth = S.vomitoryMouthM
  const hm = hv * S.vomitoryMouthK
  const frame = (S.vomitoryFrameM * M) / rowLength(sec, oB)
  fillBand(ctx, concrete(SC.tread, light * 0.9), sec, uv - hv, uv + hv, oF, zf, oB, zf)
  fillBand(ctx, concrete(SC.riser, light * 0.95), sec, uv - hv, uv + hv, oB, zf, oB, zTop)
  // Marco y dintel, algo más claros que la pared
  fillBand(ctx, concrete(SC.coping, light * 0.62), sec, uv - hm - frame, uv + hm + frame, oB, zf, oB, zf + mouth + S.vomitoryFrameM)
  // Túnel: oscuro arriba, el pasillo del fondo y el suelo con algo de luz
  fillBand(ctx, concrete(SC.tunnel, 1), sec, uv - hm, uv + hm, oB, zf, oB, zf + mouth)
  fillBand(ctx, concrete(SC.tunnelGlow, 1), sec, uv - hm * 0.55, uv + hm * 0.55, oB, zf, oB, zf + mouth * 0.72)
  fillBand(ctx, concrete(SC.tunnelGlow, 1.25), sec, uv - hm, uv + hm, oB, zf, oB, zf + 0.12)
  strokeLine(ctx, concrete(SC.coping, light * 0.9), 0.8, sec, uv - hm - frame, uv + hm + frame, oB, zf + mouth + S.vomitoryFrameM)
  strokeLine(ctx, concrete(SC.tunnel, 0.6), 0.7, sec, uv - hm, uv + hm, oB, zf + mouth)
  // Cartel de salida colgado del dintel, con su halo
  const sign = (S.exitSignM[0] * M) / 2 / rowLength(sec, oB)
  const sz1 = zf + mouth - 0.06
  const sz0 = sz1 - S.exitSignM[1]
  fillBand(ctx, SC.exitGlow, sec, uv - sign * 1.6, uv + sign * 1.6, oB, sz0 - 0.08, oB, sz1 + 0.02)
  fillBand(ctx, shade(SC.exitSign, 0.95, 0), sec, uv - sign, uv + sign, oB, sz0, oB, sz1)
  fillBand(ctx, shade(0xe8f4ea, 0.85, 0), sec, uv - sign * 0.55, uv + sign * 0.55, oB, sz0 + 0.06, oB, sz1 - 0.07)

  // Pared lateral: la que mira hacia la cámara
  sectionAt(sec, uv, oF, Q)
  const toCam = sec.dx * (CAMERA_FLOOR.x - Q.x) + sec.dy * (CAMERA_FLOOR.y - Q.y)
  const ue = toCam > 0 ? uv - hv : uv + hv
  const uo = toCam > 0 ? uv + hv : uv - hv
  ctx.fillStyle = concrete(SC.tread, light * 0.8)
  ctx.beginPath()
  standPoint(sec, ue, oF, zf, P); ctx.moveTo(P.x, P.y)
  for (let t = v0; t <= v1; t++) {
    standPoint(sec, ue, tierO(t), tierZ(t), P); ctx.lineTo(P.x, P.y)
    standPoint(sec, ue, tierO(t + 1), tierZ(t), P); ctx.lineTo(P.x, P.y)
  }
  standPoint(sec, ue, oB, zf, P); ctx.lineTo(P.x, P.y)
  ctx.closePath()
  ctx.fill()
  // Cantos de las dos paredes y su barandilla, con un poste por escalón
  ctx.strokeStyle = concrete(SC.coping, light)
  ctx.lineWidth = 0.9
  for (const u of [ue, uo]) {
    ctx.beginPath()
    wallTop(ctx, sec, u, v0, v1, 0)
    ctx.stroke()
  }
  ctx.strokeStyle = shade(SC.rail, light * 0.85, 0.3)
  ctx.lineWidth = 0.8
  ctx.beginPath()
  for (const u of [ue, uo]) {
    wallTop(ctx, sec, u, v0, v1, S.vomitoryRailM)
    for (let t = v0; t <= v1; t++) {
      const o = tierO(t) + S.tierDepthM / 2
      standPoint(sec, u, o, tierZ(t), P); ctx.moveTo(P.x, P.y)
      standPoint(sec, u, o, tierZ(t) + S.vomitoryRailM, P); ctx.lineTo(P.x, P.y)
    }
  }
  ctx.stroke()
}

/** Barandilla de cristal sobre la boca del vomitorio (va por delante de la fila de detrás). */
export function paintVomitoryRail(ctx: Ctx, sec: Section, k: number, light: number) {
  const { uv, hv, oB, zTop } = vomitoryBox(sec, k)
  fillBand(ctx, SC.glass, sec, uv - hv, uv + hv, oB, zTop, oB, zTop + S.railM)
  strokeLine(ctx, shade(SC.rail, light, 0.3), 1, sec, uv - hv, uv + hv, oB, zTop + S.railM)
  ctx.beginPath()
  for (const u of [uv - hv, uv + hv]) {
    standPoint(sec, u, oB, zTop, P); ctx.moveTo(P.x, P.y)
    standPoint(sec, u, oB, zTop + S.railM, P); ctx.lineTo(P.x, P.y)
  }
  ctx.stroke()
}

/** Caja en pantalla (zoom 1) de la barandilla del vomitorio `k`. */
export function vomitoryRailBox(sec: Section, k: number): Box {
  const box = emptyBox()
  const { uv, hv, oB, zTop } = vomitoryBox(sec, k)
  for (const u of [uv - hv, uv, uv + hv]) {
    grow(box, sec, u, oB, zTop)
    grow(box, sec, u, oB, zTop + S.railM)
  }
  return box
}
