/**
 * Horneado de figuras quietas (WP-69, perf §5 P-10): cada pose de un rig se
 * pinta una vez en una celda de una DynamicTexture compartida y la figura queda
 * como una sola Image que cambia de marco. Así los suplentes y la mesa no
 * recalculan el rig ni mueven ~25 piezas por fotograma.
 *
 * La celda cubre la caja local del puppet (`BOX`, en px de rig) a escala
 * `k · res`; la Image se dibuja a 1/res con el origen en el del contenedor.
 */
import * as Phaser from 'phaser'

/** Caja local que cabe en una celda (px de rig): brazos en alto, stick y casco apoyado incluidos. */
const BOX = { x0: -48, x1: 48, y0: -54, y1: 54 } as const
const MAX_W = 4096
let serial = 0

export class FigureBaker {
  readonly key: string
  readonly res: number
  private readonly dt: Phaser.Textures.DynamicTexture
  private readonly cw: number
  private readonly ch: number
  private readonly cols: number
  private readonly scale: number
  private next = 0

  /** `k` es la escala máxima de figura que se va a hornear; `count`, el número de celdas. */
  constructor(scene: Phaser.Scene, k: number, res: number, count: number) {
    this.res = res
    this.scale = k * res
    this.cw = Math.ceil((BOX.x1 - BOX.x0) * this.scale)
    this.ch = Math.ceil((BOX.y1 - BOX.y0) * this.scale)
    this.cols = Math.max(1, Math.min(count, Math.floor(MAX_W / this.cw)))
    const rows = Math.ceil(count / this.cols)
    this.key = `bench-figs-${serial++}`
    this.dt = scene.textures.addDynamicTexture(this.key, this.cols * this.cw, rows * this.ch)!
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.textures.remove(this.key))
  }

  /**
   * Pinta el contenedor (en su pose actual, con todo lo que lleve dentro) en la
   * siguiente celda y devuelve el nombre del marco. `k` es la escala de esa figura.
   */
  bake(container: Phaser.GameObjects.Container, k: number): string {
    const i = this.next++
    const cx = (i % this.cols) * this.cw
    const cy = Math.floor(i / this.cols) * this.ch
    const sc = k * this.res
    container.setPosition(0, 0).setScale(sc).setVisible(true)
    this.dt.draw(container, cx - BOX.x0 * this.scale, cy - BOX.y0 * this.scale)
    // Los comandos guardan referencias: se ejecutan ya, antes de la siguiente pose
    this.dt.render()
    const name = `f${i}`
    this.dt.add(name, 0, cx, cy, this.cw, this.ch)
    return name
  }

  /** Image de una figura con su origen en el del contenedor horneado, en (x, y) de pantalla. */
  image(scene: Phaser.Scene, x: number, y: number, frame: string): Phaser.GameObjects.Image {
    return scene.add.image(x, y, this.key, frame)
      .setOrigin(-BOX.x0 * this.scale / this.cw, -BOX.y0 * this.scale / this.ch)
      .setScale(1 / this.res)
  }
}
