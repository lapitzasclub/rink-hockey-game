import * as Phaser from 'phaser'

type TexturePainter = (g: Phaser.GameObjects.Graphics) => void

const OUTLINE = 0x08111b
const WHITE = 0xf7fbff
const SHADE = 0xbfd3e6
const MID = 0xddeaf6

/**
 * Texturas procedurales heredadas que siguen en uso: la bola y las piezas de
 * los suplentes del banquillo (hasta que WP-52 los pase al rig). Los jugadores
 * en pista usan el rig de `render/puppet` (WP-30).
 */
export function createProceduralPuppetTextures(scene: Phaser.Scene) {
  makeTexture(scene, 'field-body', 38, 46, paintFieldBody)
  makeTexture(scene, 'field-head', 34, 36, paintFieldHead)
  makeTexture(scene, 'field-arm', 14, 30, paintArm)
  makeTexture(scene, 'field-skate', 18, 10, paintSkate)
  makeTexture(scene, 'puck-pixel', 20, 20, paintPuck)
}

/** Crea una textura si no existe ya en el TextureManager global de Phaser. */
function makeTexture(scene: Phaser.Scene, key: string, width: number, height: number, painter: TexturePainter) {
  if (scene.textures.exists(key)) return
  const g = scene.add.graphics()
  painter(g)
  g.generateTexture(key, width, height)
  g.destroy()
}

/** Dibuja un cuerpo de campo tipo sticker, con frente visible y base hacia el suelo. */
function paintFieldBody(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(5, 3, 28, 38, 9)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(8, 5, 22, 32, 7)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 28, 22, 10, 5)
  g.fillStyle(MID, 1)
  g.fillRoundedRect(13, 8, 12, 20, 4)
  g.fillStyle(OUTLINE, 0.3)
  g.fillTriangle(10, 7, 19, 16, 28, 7)
  g.lineStyle(2, OUTLINE, 0.68)
  g.lineBetween(10, 17, 28, 17)
  g.lineStyle(1, OUTLINE, 0.45)
  g.lineBetween(19, 8, 19, 36)
}

/** Dibuja casco frontal/oblicuo con cara y jaula visibles. */
function paintFieldHead(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(3, 1, 28, 32, 12)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(6, 4, 22, 25, 10)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(7, 17, 20, 11, 5)
  g.fillStyle(MID, 1)
  g.fillEllipse(17, 10, 15, 7)
  g.lineStyle(2, OUTLINE, 0.82)
  g.lineBetween(7, 17, 27, 17)
  g.lineStyle(1, OUTLINE, 0.55)
  for (let x = 10; x <= 24; x += 4) g.lineBetween(x, 16, x, 29)
  g.lineBetween(8, 23, 26, 23)
}

/** Dibuja un brazo tintable con manga, codera y guante. */
function paintArm(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(3, 2, 8, 24, 4)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(5, 4, 5, 18, 3)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(4, 17, 7, 7, 3)
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(2, 24, 10, 5, 2)
}

/** Dibuja patin con bota tintable, cuchilla oscura y ruedas sugeridas. */
function paintSkate(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(1, 2, 16, 5, 2)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(3, 2, 10, 4, 2)
  g.fillStyle(OUTLINE, 1)
  g.fillRect(2, 7, 15, 1)
  g.fillCircle(5, 8, 1)
  g.fillCircle(13, 8, 1)
}

/** Dibuja una bola naranja con outline, luz y sombreado. */
function paintPuck(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x7a3008, 1)
  g.fillCircle(10, 10, 9)
  g.fillStyle(0xf59a28, 1)
  g.fillCircle(10, 10, 7)
  g.fillStyle(0xffc16a, 1)
  g.fillCircle(7, 6, 2)
  g.fillStyle(0xb85f15, 1)
  g.fillEllipse(11, 14, 9, 4)
}
