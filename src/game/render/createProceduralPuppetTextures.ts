import * as Phaser from 'phaser'

type TexturePainter = (g: Phaser.GameObjects.Graphics) => void

const OUTLINE = 0x08111b
const WHITE = 0xf7fbff
const SHADE = 0xbfd3e6
const MID = 0xddeaf6

/**
 * Registra las texturas del estilo puppet/SMOL usadas por jugadores, porteros,
 * sticks y bola. Todas las piezas de equipacion son blancas con outline para
 * poder aplicar el mismo tintado a ambos equipos sin duplicar arte.
 */
export function createProceduralPuppetTextures(scene: Phaser.Scene) {
  makeTexture(scene, 'field-body', 38, 46, paintFieldBody)
  makeTexture(scene, 'field-body-back', 38, 46, paintFieldBodyBack)
  makeTexture(scene, 'goalie-body', 48, 54, paintGoalieBody)
  makeTexture(scene, 'goalie-body-back', 48, 54, paintGoalieBodyBack)
  makeTexture(scene, 'field-head', 34, 36, paintFieldHead)
  makeTexture(scene, 'field-head-back', 34, 36, paintFieldHeadBack)
  makeTexture(scene, 'goalie-head', 38, 40, paintGoalieHead)
  makeTexture(scene, 'goalie-head-back', 38, 40, paintGoalieHeadBack)
  makeTexture(scene, 'field-arm', 14, 30, paintArm)
  makeTexture(scene, 'goalie-arm', 16, 34, paintArm)
  makeTexture(scene, 'field-skate', 18, 10, paintSkate)
  makeTexture(scene, 'goalie-skate', 20, 11, paintSkate)
  makeTexture(scene, 'hockey-stick', 46, 9, paintStick)
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

/** Dibuja el torso mas ancho del portero, con peto frontal y hombreras. */
function paintGoalieBody(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(4, 2, 40, 47, 11)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(8, 5, 32, 40, 10)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 32, 32, 13, 6)
  g.fillStyle(MID, 1)
  g.fillRoundedRect(16, 9, 16, 23, 5)
  g.fillStyle(OUTLINE, 0.3)
  g.fillTriangle(10, 7, 24, 20, 38, 7)
  g.lineStyle(2, OUTLINE, 0.65)
  g.lineBetween(10, 20, 38, 20)
  g.lineStyle(1, OUTLINE, 0.45)
  g.lineBetween(24, 9, 24, 43)
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

/** Dibuja casco de portero mas grande, con mascara frontal clara. */
function paintGoalieHead(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(2, 1, 34, 36, 12)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(5, 4, 28, 30, 10)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(7, 19, 24, 12, 5)
  g.fillStyle(MID, 1)
  g.fillEllipse(19, 11, 18, 8)
  g.lineStyle(2, OUTLINE, 0.82)
  g.lineBetween(7, 18, 31, 18)
  g.lineStyle(1, OUTLINE, 0.55)
  for (let x = 11; x <= 27; x += 4) g.lineBetween(x, 15, x, 33)
  g.lineBetween(8, 25, 30, 25)
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

/** Dibuja stick neutral sin tintado de equipo. */
function paintStick(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(0x20140c, 1)
  g.fillRect(3, 3, 34, 3)
  g.fillStyle(0xd8a65f, 1)
  g.fillRect(5, 4, 30, 1)
  g.fillStyle(0x20140c, 1)
  g.fillRoundedRect(35, 1, 10, 6, 2)
  g.fillStyle(0xf2d39c, 1)
  g.fillRoundedRect(36, 2, 7, 3, 1)
}

/** Torso de campo visto desde atrás: espalda del jersey, sin peto frontal ni jaula. */
function paintFieldBodyBack(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(5, 3, 28, 38, 9)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(8, 5, 22, 32, 7)
  // Collar trasero
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(11, 5, 16, 7, 4)
  // Parte baja
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 28, 22, 10, 5)
  // Dorsal (número en la espalda)
  g.fillStyle(MID, 1)
  g.fillRoundedRect(13, 15, 12, 11, 3)
  // Línea de cintura
  g.lineStyle(2, OUTLINE, 0.55)
  g.lineBetween(10, 27, 28, 27)
}

/** Torso de portero visto desde atrás. */
function paintGoalieBodyBack(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(4, 2, 40, 47, 11)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(8, 5, 32, 40, 10)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(14, 5, 20, 9, 5)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 32, 32, 13, 6)
  g.fillStyle(MID, 1)
  g.fillRoundedRect(16, 17, 16, 13, 4)
  g.lineStyle(2, OUTLINE, 0.55)
  g.lineBetween(10, 31, 38, 31)
}

/** Casco de campo visto desde atrás: domo liso, sin jaula ni rejilla frontal. */
function paintFieldHeadBack(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(3, 1, 28, 32, 12)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(6, 4, 22, 25, 10)
  // Brillo en la cima del domo
  g.fillStyle(MID, 1)
  g.fillEllipse(17, 9, 14, 6)
  // Faldón trasero (protección de nuca)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 22, 18, 8, 4)
}

/** Casco de portero visto desde atrás. */
function paintGoalieHeadBack(g: Phaser.GameObjects.Graphics) {
  g.fillStyle(OUTLINE, 1)
  g.fillRoundedRect(2, 1, 34, 36, 12)
  g.fillStyle(WHITE, 1)
  g.fillRoundedRect(5, 4, 28, 30, 10)
  g.fillStyle(MID, 1)
  g.fillEllipse(19, 10, 17, 7)
  g.fillStyle(SHADE, 1)
  g.fillRoundedRect(8, 25, 22, 10, 5)
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
