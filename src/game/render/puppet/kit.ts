/**
 * Equipación y aspecto de una figura (SPEC §4–§5): colores del kit, dorsal,
 * piel, pelo y casco. Los jugadores lo sacan de su equipo y de su variedad
 * (`hand`, `skin`, `hair`); árbitros y suplentes podrán pasar el suyo.
 */
import { HAIR_COLORS, SKIN_TONES, TEAM_KITS, TEAM_NUMBERS } from '../artSpec'
import type { Role, TeamColor } from '../../types'
import type { FigureKind } from './pose'

export interface RigKit {
  /** Identifica los marcos con colores propios (portero) de este kit. */
  id: string
  jersey: number; shorts: number; socks: number; gloves: number; trim: number
  skin: number; hair: number
  /** null = sin casco (variante D4). */
  helmet: number | null
  /** Rejilla integral: solo porteros. */
  cage: boolean
  number: string
  numColor: number
  footwear: 'skate' | 'shoe'
}

/** Aspecto variable de un jugador (SPEC §5 «Variedad»). */
export interface PlayerLook {
  hand: 'L' | 'R'
  skin: number
  hair: number
  number: string
}

/** Hash entero estable de un texto. */
function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Variedad determinista por id: mano del stick, piel, pelo y dorsal de la plantilla del equipo. */
export function lookFor(id: string, team: TeamColor, role: Role): PlayerLook {
  const h = hash(id)
  const digits = /(\d+)$/.exec(id)
  const order = digits ? Number(digits[1]) : h
  const field = TEAM_NUMBERS[team].field
  return {
    // Diestros mayoría (≈ 2 de cada 3), como en el juego real
    hand: h % 3 === 0 ? 'L' : 'R',
    skin: (h >>> 3) % SKIN_TONES.length,
    hair: (h >>> 7) % HAIR_COLORS.length,
    number: role === 'goalie' ? TEAM_NUMBERS[team].goalie : field[order % field.length],
  }
}

/** Kit de jugador o portero de un equipo con su aspecto. */
export function playerKit(team: TeamColor, kind: FigureKind, look: PlayerLook, helmet = true): RigKit {
  const t = TEAM_KITS[team]
  const cage = kind === 'goalie'
  const helmetColor = helmet || cage ? t.helmet : null
  return {
    id: `${team}-${kind}`,
    jersey: t.jersey, shorts: t.shorts, socks: t.socks, gloves: t.gloves, trim: t.trim,
    skin: SKIN_TONES[look.skin % SKIN_TONES.length],
    hair: HAIR_COLORS[look.hair % HAIR_COLORS.length],
    helmet: helmetColor,
    cage,
    number: look.number,
    numColor: t.numColor,
    footwear: 'skate',
  }
}
