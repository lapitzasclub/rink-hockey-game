import * as Phaser from 'phaser'
import { RINK } from '../constants'
import { CAMERA, PX_PER_M, SETPIECE_CAMERA, SETPIECE_FOLLOW as FW } from '../render/artSpec'
import { createPlayer } from '../entities/createPlayer'
import { project as projectMatch } from '../render/viewTransform'
import type { Ball, Player } from '../types'
import type { MatchDuel } from './duel'
import { MIRROR_AT, SetPieceBallView, inFrame, placeFigure, type FigureState } from './figure'
import { SetPieceStage } from './stage'
import { SetPieceView } from './view'

/**
 * Escena cercana de los lanzamientos dentro del partido (L-02). No tiene lógica
 * de juego ni `update`: `MatchScene.renderFrame` la mueve con `frame()` leyendo el
 * duelo (`setpiece/duel.ts`) y los jugadores ya interpolados. Va debajo de
 * 'match': la transición acerca la cámara del partido al punto, funde su alfa
 * a 0 sobre esta escena (que en ese instante usa la cámara equivalente a la del
 * partido, misma forma estenopeica) y después orbita hasta la cámara de
 * seguimiento detrás del lanzador. La vuelta es el mismo camino al revés y el
 * partido no se detiene en ningún momento.
 */

const P = SETPIECE_CAMERA
const KEY = 'setpiece'
type Mode = 'off' | 'enter' | 'close' | 'exit'

// Cámara del partido (`render/viewTransform.ts`) en sus propias unidades
const CX = RINK.x + RINK.width / 2
const CAM_Y = RINK.y + RINK.height + CAMERA.distance
const THETA = (CAMERA.tiltDeg * Math.PI) / 180
const Y0 = (() => {
  const d = CAM_Y - RINK.y
  return CAMERA.farEdgeY + (CAMERA.focal * (d * Math.sin(THETA) - CAMERA.height * Math.cos(THETA))) / (d * Math.cos(THETA) + CAMERA.height * Math.sin(THETA))
})()

/** Altura (m) a la que se mide la profundidad de una figura para el fundido cercano. */
const NEAR_Z = 0.9
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (a: number, b: number, v: number) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t) }
const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const lerpAngle = (a: number, b: number, t: number) => a + wrapPi(b - a) * t

/** Pose completa de la cámara cercana: ojo, rumbo, picado y lente. */
class Pose {
  ex = 0; ey = 0; ez = 0; heading = 0; tilt = 0; f = 0; cx = 0; y0 = 0
  read(v: SetPieceView) {
    this.ex = v.eyeX; this.ey = v.eyeY; this.ez = v.eyeZ
    this.heading = v.heading(); this.tilt = v.tilt
    this.f = v.f; this.cx = v.cx; this.y0 = v.y0
  }
  apply(v: SetPieceView) {
    v.setPose(this.ex, this.ey, this.ez, this.heading, this.tilt).setLens(this.f, this.cx, this.y0)
  }
}

export class SetPieceScene extends Phaser.Scene {
  static readonly KEY = KEY
  private readonly view = new SetPieceView()
  private stage!: SetPieceStage
  private ballView!: SetPieceBallView
  private proxy!: Ball
  private readonly mirrors = new Map<string, Player>()
  private readonly seenAt = new Map<string, number>()
  private frameNo = 0
  private mode: Mode = 'off'
  private t0 = 0
  private lastVt = 0
  private duelAt = -1
  /** Cámara del partido al empezar (se devuelve al acabar). */
  private z0 = 1
  private mx0 = 0
  private my0 = 0
  /** Punto (m) alrededor del que orbita la transición. */
  private pvX = 0
  private pvY = 0
  /** Muelle del seguimiento: ojo y mira actuales [0..5] y objetivo [6..11]; velocidades aparte. */
  private readonly spring = new Float64Array(12)
  private readonly vel = new Float64Array(6)
  private shotVt = -1
  private readonly pM = new Pose()
  private readonly pF = new Pose()
  private readonly pt = { x: 0, y: 0, s: 0 }
  private readonly v2 = { x: 0, y: 0 }
  private readonly st: FigureState = { x: 0, y: 0, fx: 0, fy: 0, vx: 0, vy: 0 }

  constructor() {
    super({ key: KEY })
  }

  create() {
    this.cameras.main.setBackgroundColor(P.colors.backdrop)
    this.stage = new SetPieceStage(this)
    this.ballView = new SetPieceBallView(this)
    this.proxy = { x: 0, y: 0, visual: this.add.image(0, 0, 'puck-pixel').setVisible(false) }
    this.sys.setVisible(false)
  }

  /** Lista para usar (creada y con WebGL, que necesita el Mesh2D del decorado). */
  get ready(): boolean {
    return !!this.stage
  }

  /** ¿Lleva la escena la cámara del partido este fotograma? */
  get owns(): boolean {
    return this.mode !== 'off'
  }

  /**
   * Pinta un fotograma. Arranca la entrada si hay un duelo nuevo y la vuelta cuando
   * acaba; mueve la cámara principal del partido mientras dura. Devuelve si el
   * partido queda tapado del todo (entonces no hace falta posarlo).
   */
  frame(vt: number, cam: Phaser.Cameras.Scene2D.Camera, duel: MatchDuel, players: readonly Player[], ball: Ball, ballZ: number, carrierId: string | null): boolean {
    if (!this.stage) return false
    if (duel.active && duel.startedAt !== this.duelAt) this.begin(vt, cam, duel, ball)
    else if (!duel.active && (this.mode === 'enter' || this.mode === 'close')) this.end(vt, duel, ball)
    if (this.mode === 'off') return false
    const dt = Math.min(0.1, Math.max(0, vt - this.lastVt) / 1000)
    this.lastVt = vt

    // Progreso: 0 = partido, 1 = cámara de seguimiento (la vuelta lo recorre al revés)
    let u: number
    if (this.mode === 'exit') {
      u = 1 - (vt - this.t0) / FW.exitMs
      if (u <= 0) { this.finish(cam); return false }
    } else {
      u = Math.min(1, (vt - this.t0) / FW.enterMs)
      if (u >= 1) this.mode = 'close'
    }
    const zoomK = smooth(0, FW.fadeTo, u)
    const alpha = 1 - smooth(FW.fadeFrom, FW.fadeTo, u)
    const orbit = smooth(FW.fadeTo, 1, u)

    // Cámara del partido: se acerca al punto mientras se funde
    projectMatch(duel.worldXOf(this.pvX, this.pvY), duel.worldYOf(this.pvX, this.pvY), FW.zoomLiftM * PX_PER_M, this.pt)
    const z = this.z0 * Math.exp(Math.log(FW.zoom) * zoomK)
    cam.setZoom(z)
    cam.centerOn(lerp(this.mx0, this.pt.x, zoomK), lerp(this.my0, this.pt.y, zoomK))
    cam.setAlpha(alpha)
    cam.setVisible(alpha > 0.002)

    const { width, height } = this.scale.gameSize
    const main = this.cameras.main
    if (main.width !== width || main.height !== height) main.setSize(width, height)

    // Pose equivalente a la del partido y pose de seguimiento; la cercana orbita entre las dos
    // centerOn deja midPoint sin recortar a los límites; el centro real sale del scroll
    this.matchPose(z, cam.scrollX + cam.width / 2, cam.scrollY + cam.height / 2, width, height, duel)
    this.pM.read(this.view)
    this.followPose(vt, dt, duel, ball, width, height)
    this.pF.read(this.view)
    if (orbit <= 0) this.pM.apply(this.view)
    else if (orbit >= 1) this.pF.apply(this.view)
    else this.blendPose(orbit)

    this.paint(vt, duel, players, ball, ballZ, carrierId, orbit, width, height)
    return alpha <= 0.002
  }

  private begin(vt: number, cam: Phaser.Cameras.Scene2D.Camera, duel: MatchDuel, ball: Ball) {
    this.duelAt = duel.startedAt
    this.mode = 'enter'
    this.t0 = vt
    this.lastVt = vt
    this.z0 = cam.zoom
    this.mx0 = cam.midPoint.x
    this.my0 = cam.midPoint.y
    duel.toScene(ball.x, ball.y, this.v2)
    this.pvX = this.v2.x
    this.pvY = this.v2.y
    this.shotVt = -1
    this.followTarget(duel, ball)
    this.spring.copyWithin(0, 6, 12)
    this.vel.fill(0)
    this.sys.setVisible(true)
    this.stage.setPena(duel.goalie?.team ?? null)
    this.stage.setVisible(true)
  }

  private end(vt: number, duel: MatchDuel, ball: Ball) {
    // Si aún entraba, la vuelta arranca desde el mismo punto del camino
    const u = this.mode === 'enter' ? Math.min(1, (vt - this.t0) / FW.enterMs) : 1
    this.mode = 'exit'
    this.t0 = vt - (1 - u) * FW.exitMs
    duel.toScene(ball.x, ball.y, this.v2)
    this.pvX = this.v2.x
    this.pvY = this.v2.y
  }

  private finish(cam: Phaser.Cameras.Scene2D.Camera) {
    this.mode = 'off'
    cam.setZoom(this.z0)
    cam.centerOn(this.mx0, this.my0)
    cam.setAlpha(1)
    cam.setVisible(true)
    this.sys.setVisible(false)
  }

  /** Cámara cercana equivalente a la del partido con su zoom y centro actuales. */
  private matchPose(z: number, mx: number, my: number, w: number, h: number, duel: MatchDuel) {
    duel.toScene(CX, CAM_Y, this.v2)
    this.view.setPose(this.v2.x, this.v2.y, CAMERA.height / PX_PER_M, Math.atan2(-duel.dir, 0), THETA)
      .setLens(z * CAMERA.focal, w / 2 + z * (CX - mx), h / 2 + z * (Y0 - my))
  }

  /** Objetivo del seguimiento (en `spring[6..11]`): detrás del ancla, al lado contrario del stick. */
  private followTarget(duel: MatchDuel, ball: Ball) {
    const taker = duel.taker!
    duel.toScene(taker.pos.x, taker.pos.y, this.v2)
    let ax = this.v2.x, ay = this.v2.y
    if (this.shotVt >= 0) {
      duel.toScene(ball.x, ball.y, this.v2)
      const w = FW.ballWeight * clamp01((this.lastVt - this.shotVt) / (FW.ballBlendS * 1000))
      ax = lerp(ax, this.v2.x, w)
      ay = lerp(ay, this.v2.y, w)
    }
    const d = Math.max(1.5, Math.hypot(ax, ay))
    const ux = ax / d, uy = ay / d
    const side = taker.rig.stickSide === 1 ? 1 : -1
    const s = this.spring
    s[6] = ax + ux * FW.back - uy * side * FW.side
    s[7] = ay + uy * FW.back + ux * side * FW.side
    s[8] = FW.height
    // Mira entre el ancla y la boca: con la cámara a tres cuartos caben lanzador, bola y portería
    s[9] = lerp(ax, P.targetX, FW.look)
    s[10] = lerp(ay, P.targetY, FW.look)
    s[11] = lerp(FW.anchorZ, P.targetZ, FW.look)
  }

  /** Muelle críticamente amortiguado (solución exacta por paso) hacia el objetivo. */
  private followPose(vt: number, dt: number, duel: MatchDuel, ball: Ball, w: number, h: number) {
    if (this.shotVt < 0 && duel.sim.hitT >= 0) this.shotVt = vt
    this.followTarget(duel, ball)
    const s = this.spring
    const om = FW.omega, e = Math.exp(-om * dt)
    for (let i = 0; i < 6; i++) {
      const x0 = s[i] - s[6 + i], v0 = this.vel[i]
      const k = (v0 + om * x0) * dt
      s[i] = s[6 + i] + (x0 + k) * e
      this.vel[i] = (v0 - om * k) * e
    }
    this.view.setCamera(s[0], s[1], s[2], s[3], s[4], s[5]).setLens(P.focal, w / 2, h * P.aimY)
  }

  /**
   * Órbita entre la pose del partido y la de seguimiento alrededor del punto:
   * distancia en logaritmo, ángulos y lente; luego se corrige el punto principal
   * para que el pivote recorra en pantalla la recta entre sus dos sitios.
   */
  private blendPose(b: number) {
    const A = this.pM, B = this.pF, v = this.view
    const pz = FW.zoomLiftM
    const ax = A.ex - this.pvX, ay = A.ey - this.pvY, az = A.ez - pz
    const bx = B.ex - this.pvX, by = B.ey - this.pvY, bz = B.ez - pz
    const ra = Math.hypot(ax, ay, az), rb = Math.hypot(bx, by, bz)
    const r = Math.exp(lerp(Math.log(ra), Math.log(rb), b))
    const phi = lerpAngle(Math.atan2(ax, ay), Math.atan2(bx, by), b)
    const el = lerp(Math.asin(az / ra), Math.asin(bz / rb), b)
    // Dónde cae el pivote con cada pose
    A.apply(v); v.project(this.pvX, this.pvY, pz, this.pt)
    const sax = this.pt.x, say = this.pt.y
    B.apply(v); v.project(this.pvX, this.pvY, pz, this.pt)
    const tx = lerp(sax, this.pt.x, b), ty = lerp(say, this.pt.y, b)
    v.setPose(
      this.pvX + r * Math.cos(el) * Math.sin(phi), this.pvY + r * Math.cos(el) * Math.cos(phi), pz + r * Math.sin(el),
      lerpAngle(A.heading, B.heading, b), lerp(A.tilt, B.tilt, b),
    ).setLens(Math.exp(lerp(Math.log(A.f), Math.log(B.f), b)), lerp(A.cx, B.cx, b), lerp(A.y0, B.y0, b))
    v.project(this.pvX, this.pvY, pz, this.pt)
    v.setLens(v.f, v.cx + tx - this.pt.x, v.y0 + ty - this.pt.y)
  }

  /** Decorado, figuras en el encuadre y bola con la pose ya puesta. */
  private paint(vt: number, duel: MatchDuel, players: readonly Player[], ball: Ball, ballZ: number, carrierId: string | null, blend: number, w: number, h: number) {
    const v = this.view
    this.stage.draw(v, vt)
    duel.toScene(ball.x, ball.y, this.v2)
    const bx = this.v2.x, by = this.v2.y
    const n = ++this.frameNo
    const st = this.st
    const taker = duel.taker
    let near = -Infinity
    if (taker) {
      duel.toScene(taker.pos.x, taker.pos.y, this.v2)
      near = v.depth(this.v2.x, this.v2.y, NEAR_Z) - FW.nearAheadM
    }
    for (const p of players) {
      if ((p.suspendedUntil ?? 0) > vt) continue
      duel.toScene(p.pos.x, p.pos.y, this.v2)
      st.x = this.v2.x; st.y = this.v2.y
      if (!inFrame(v, st.x, st.y, w, h)) continue
      // Los que se meten entre la cámara y el lanzador se funden (no tapan el lanzamiento)
      let a = 1
      if (p !== taker && p !== duel.goalie) a = 1 - blend * (1 - clamp01((v.depth(st.x, st.y, NEAR_Z) - near) / FW.nearFadeM))
      if (a < 0.02) continue
      duel.dirToScene(p.facing.x, p.facing.y, this.v2)
      st.fx = this.v2.x; st.fy = this.v2.y
      duel.dirToScene(p.velocity.x, p.velocity.y, this.v2)
      st.vx = this.v2.x; st.vy = this.v2.y
      const m = this.mirrorOf(p)
      m.anim = p.anim
      m.sprinting = p.sprinting
      m.charge = p.charge
      placeFigure(v, m, this.proxy, st, bx, by, carrierId === p.id, vt, blend)
      m.container.setAlpha(a)
      m.shadow.setAlpha(a)
      this.seenAt.set(p.id, n)
    }
    for (const [id, m] of this.mirrors) {
      if (this.seenAt.get(id) === n) continue
      m.container.setVisible(false)
      m.shadow.setVisible(false)
    }
    this.ballView.place(v, bx, by, ballZ, blend)
  }

  /** Espejo del jugador (mismo id, así que mismo aspecto), creado la primera vez. */
  private mirrorOf(p: Player): Player {
    let m = this.mirrors.get(p.id)
    if (!m) {
      m = createPlayer(this, p.id, p.team, p.side, p.role, MIRROR_AT.x, MIRROR_AT.y, 0, false)
      this.mirrors.set(p.id, m)
    }
    return m
  }
}
