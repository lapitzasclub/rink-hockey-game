/**
 * Equipación y aspecto de una figura (SPEC §4–§5): colores del kit, dorsal,
 * piel, pelo y casco. Los jugadores lo sacan de su equipo y de su variedad
 * (`hand`, `skin`, `hair`); árbitros y suplentes podrán pasar el suyo.
 */
import { BENCH, HAIR_COLORS, REFEREES, SKIN_TONES, TABLE, TEAM_KITS, TEAM_NUMBERS } from '../artSpec'
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
  /** Canesú y paneles laterales del tronco en este color (árbitro): el tronco se pinta con sus colores, sin tinte. */
  vest?: number
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

/** Orden de alta del jugador, sacado del sufijo numérico de su id (`blue-3` → 3). */
function orderOf(id: string): number {
  const digits = /(\d+)$/.exec(id)
  return digits ? Number(digits[1]) : hash(id)
}

/** Posición en la 5 del partido externo ([portero, campo×4]) que ocupa un jugador. */
function squadIndex(id: string, role: Role): number {
  return role === 'goalie' ? 0 : 1 + ((orderOf(id) - 1 + 4) % 4)
}

/** Nombre del jugador en la plantilla del partido externo; null sin partido o en un hueco generado. */
export function nameFor(id: string, team: TeamColor, role: Role): string | null {
  return equipoDeHueco(team)?.nombres[squadIndex(id, role)] ?? null
}

/** Variedad determinista por id: mano del stick, piel, pelo y dorsal de la plantilla del equipo. */
export function lookFor(id: string, team: TeamColor, role: Role): PlayerLook {
  const h = hash(id)
  const order = orderOf(id)
  const field = TEAM_NUMBERS[team].field
  // Plantilla del partido externo: [portero, campo×4]; el generado de la plantilla sustituye a TEAM_NUMBERS
  const squadNumber = equipoDeHueco(team)?.dorsales[squadIndex(id, role)]
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

/**
 * Kit de árbitro (WP-50, WP-69): camiseta gris con canesú y paneles laterales
 * amarillo flúor (se leen de frente, de espaldas y de perfil a escala de partido)
 * y pantalón casi negro; sin dorsal ni casco, a pie.
 */
export function refereeKit(skin = 0, hair = 0): RigKit {
  return {
    ...officialKit(skin, hair), id: 'referee', jersey: REFEREES.shirt, shorts: REFEREES.shorts, socks: REFEREES.shorts,
    gloves: REFEREES.shorts, trim: REFEREES.fluor, number: '', numColor: REFEREES.fluor, vest: REFEREES.fluor,
  }
}

/**
 * Kit de banquillo (WP-69): entrenador con chándal del color del equipo y
 * delegado con polo claro, los dos con pantalón oscuro y calzado de calle.
 * Respeta la equipación del partido externo (`teamKit`).
 */
export function staffKit(team: TeamColor, role: 'coach' | 'delegate', skin: number, hair: number): RigKit {
  const t = teamKit(team)
  const c = BENCH.colors
  const jersey = role === 'coach' ? t.jersey : t.numColor === t.jersey ? c.polo : t.numColor
  return { ...officialKit(skin, hair), id: `${team}-${role}`, jersey, shorts: c.trousers, socks: c.trousers, gloves: c.trousers, trim: t.trim }
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
