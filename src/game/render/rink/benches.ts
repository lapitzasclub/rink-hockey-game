/** Banquillos estáticos en screen-space y franja de pantalla que ocupan. */
import * as Phaser from 'phaser'
import { RINK } from '../../constants'

const BENCH_XS = 0.82
const benchX = (wx: number) => RINK.x + RINK.width / 2 + (wx - (RINK.x + RINK.width / 2)) * BENCH_XS

/** Franja de pantalla ocupada por banquillos y mesa (el público no se pinta ahí). */
export const BENCH_SCREEN_RANGE = {
  left: benchX(RINK.x + 110) - 6,
  right: benchX(RINK.x + RINK.width - 110) + 6,
  bottom: 123,
}

// ─── Banquillos ───────────────────────────────────────────────────────────────

/**
 * Estructura estática de los banquillos en screen-space.
 *
 * worldToScreenExt aplana Y a t=0 para y < RINK.y, así que los banquillos
 * se pintan directamente en coordenadas de pantalla.
 * Solo la X usa la convergencia perspectiva (X_FAR=0.82) para que converja
 * igual que el campo en el plano lejano.
 *
 * Con VIEW_ANCHOR_Y=130 el borde exterior de los tableros lejanos queda
 * en y≈121, dando ~121px de zona de banquillo visible (y=0..121).
 *
 * Las figuras sentadas son puppets reales creados por benchPlayers.ts.
 * TODO: las gradas (zona y=0..10 y laterales) se añadirán con lógica
 * responsiva dependiendo del tamaño de ventana disponible.
 */
export function drawBenches(g: Phaser.GameObjects.Graphics) {
  const wx2 = benchX

  const blueL = wx2(RINK.x + 110)
  const blueR = wx2(RINK.x + RINK.width / 2 - 70)
  const redL  = wx2(RINK.x + RINK.width / 2 + 70)
  const redR  = wx2(RINK.x + RINK.width - 110)

  paintBench(g, blueL, blueR, 0x0e2a6a, 0x2255cc)
  paintBench(g, redL,  redR,  0x6a0e0e, 0xcc2222)
}

/**
 * Estructura de un banquillo en screen-space (sin figuras; las pone benchPlayers.ts).
 *
 * Layout vertical (los jugadores están centrados en screen-Y=78):
 *    4–30   pared trasera / zona fondo con publicidad del equipo
 *   30–68   respaldo del asiento (detrás de las espaldas de los jugadores)
 *   68–92   superficie del asiento (donde se sientan; cuerpo≈y87, patines≈y113)
 *   92–95   franja de equipo al frente del asiento
 *   95–119  zona de pies / suelo
 */
function paintBench(
  g: Phaser.GameObjects.Graphics,
  x0: number, x1: number,
  teamDark: number, teamLight: number,
) {
  const w = x1 - x0

  // Fondo completo del área de banquillo
  g.fillStyle(0x060d1a, 1)
  g.fillRect(x0, 4, w, 115)

  // Pared trasera oscura (zona fondo, detrás de los jugadores)
  g.fillStyle(0x030810, 1)
  g.fillRect(x0, 4, w, 26)

  // Franja de identidad del equipo en la pared trasera
  g.fillStyle(teamLight, 0.55)
  g.fillRect(x0, 28, w, 2)
  g.fillStyle(teamDark, 0.70)
  g.fillRect(x0, 30, w, 2)

  // Respaldo del asiento
  g.fillStyle(0x091629, 1)
  g.fillRect(x0 + 5, 32, w - 10, 36)
  // Reflejo sutil en la parte alta del respaldo
  g.fillStyle(teamLight, 0.08)
  g.fillRect(x0 + 5, 32, w - 10, 10)

  // Superficie del asiento (plano visto desde 3/4, más claro)
  g.fillStyle(0x0d2040, 1)
  g.fillRect(x0 + 5, 68, w - 10, 24)
  // Leve brillo en el borde delantero del asiento
  g.fillStyle(0xffffff, 0.04)
  g.fillRect(x0 + 5, 68, w - 10, 4)

  // Franja de equipo en el frente del asiento
  g.fillStyle(teamLight, 0.60)
  g.fillRect(x0 + 5, 91, w - 10, 2)
  g.fillStyle(teamDark,  0.45)
  g.fillRect(x0 + 5, 93, w - 10, 1)

  // Zona de pies / suelo delante del asiento
  g.fillStyle(0x07111e, 1)
  g.fillRect(x0, 94, w, 25)

  // Separadores verticales del asiento (listones del banco)
  const slats = 10
  g.lineStyle(1, 0x030810, 0.50)
  for (let i = 1; i < slats; i++) {
    const sx = x0 + (w / slats) * i
    g.lineBetween(sx, 32, sx, 93)
  }

  // Línea de cierre inferior (justo antes del tablero)
  g.lineStyle(1, teamDark, 0.35)
  g.lineBetween(x0, 118, x1, 118)
}
