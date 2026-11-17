/**
 * Equipación y aspecto de una figura (SPEC §4–§5): colores del kit, dorsal,
 * piel, pelo y casco. Los jugadores lo sacan de su equipo y de su variedad
 * (`hand`, `skin`, `hair`); árbitros y suplentes podrán pasar el suyo.
 */
import { HAIR_COLORS, REFEREES, SKIN_TONES, TABLE, TEAM_KITS, TEAM_NUMBERS } from '../artSpec'
import { equipoDeHueco } from '../../externalMatch'
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

/** Colores de equipación de un hueco ('blue' = humano, 'red' = IA). */
interface TeamKit { jersey: number; shorts: number; socks: number; gloves: number; helmet: number; numColor: number; trim: number }

/**
 * Equipación del hueco: la del partido externo si lo hay (casco = camiseta,
 * guantes y detalle = color de detalle) y, si no, la constante de artSpec.
 * Se resuelve en cada llamada porque la persona puede cambiar de equipo en el menú.
 */
export function teamKit(team: TeamColor): TeamKit {
  const e = equipoDeHueco(team)?.equipacion
  if (!e) return TEAM_KITS[team]
  return { jersey: e.camiseta, shorts: e.pantalon, socks: e.medias, gloves: e.detalle, helmet: e.camiseta, numColor: e.dorsal, trim: e.detalle }
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
  // Plantilla del partido externo: [portero, campo×4]; el generado de la plantilla sustituye a TEAM_NUMBERS
  const squad = equipoDeHueco(team)?.dorsales
  const squadNumber = squad && (role === 'goalie' ? squad[0] : squad[1 + ((order - 1 + 4) % 4)])
  return {
    // Diestros mayoría (≈ 2 de cada 3), como en el juego real
    hand: h % 3 === 0 ? 'L' : 'R',
    skin: (h >>> 3) % SKIN_TONES.length,
    hair: (h >>> 7) % HAIR_COLORS.length,
    number: squadNumber ?? (role === 'goalie' ? TEAM_NUMBERS[team].goalie : field[order % field.length]),
  }
}

/** Kit de oficial (mesa, árbitros): sin casco, prenda oscura con detalle amarillo y calzado de calle. */
export function officialKit(skin = 0, hair = 0): RigKit {
  const o = TABLE.official
  return {
    id: 'official', jersey: o.jersey, shorts: o.shorts, socks: o.shorts, gloves: o.shorts, trim: o.trim,
    skin: SKIN_TONES[skin % SKIN_TONES.length], hair: HAIR_COLORS[hair % HAIR_COLORS.length],
    helmet: null, cage: false, number: '', numColor: o.trim, footwear: 'shoe',
  }
}

/** Kit de árbitro (WP-50): gris oscuro y dorsal-franja amarillo flúor visible por delante y por detrás; sin casco, a pie. */
export function refereeKit(skin = 0, hair = 0): RigKit {
  return {
    ...officialKit(skin, hair), jersey: 0x22262d, shorts: 0x111317, socks: 0x111317, gloves: 0x111317,
    trim: REFEREES.fluor, number: 'II', numColor: REFEREES.fluor,
  }
}

/** Kit de jugador o portero de un equipo con su aspecto. */
export function playerKit(team: TeamColor, kind: FigureKind, look: PlayerLook, helmet = true): RigKit {
  const t = teamKit(team)
  const cage = kind === 'goalie'
  const helmetColor = helmet || cage ? t.helmet : null
  return {
    // Los marcos de portero y petos se cachean por id: incluye los colores para que otra equipación no reutilice los de la anterior
    id: `${team}-${kind}-${t.jersey.toString(16)}-${t.trim.toString(16)}`,
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
