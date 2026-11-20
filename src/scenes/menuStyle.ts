import * as Phaser from 'phaser'

/** Paleta común de las pantallas del menú. */
export const C = {
  ink: '#08111b',
  inkN: 0x08111b,
  panel: 0x0b1828,
  orange: 0xff8a1a,
  orangeHex: '#ffb347',
  blue: '#4da3ff',
  red: '#ff5d6c',
  muted: '#9fb6cf',
} as const

/** Paralelogramo centrado en el origen: la inclinación da el aire «deportivo» de toda la UI. */
export function slantPts(w: number, h: number, skew: number, cx = 0, cy = 0) {
  return [
    new Phaser.Math.Vector2(cx - w / 2 + skew / 2, cy - h / 2),
    new Phaser.Math.Vector2(cx + w / 2 + skew / 2, cy - h / 2),
    new Phaser.Math.Vector2(cx + w / 2 - skew / 2, cy + h / 2),
    new Phaser.Math.Vector2(cx - w / 2 - skew / 2, cy + h / 2),
  ]
}
