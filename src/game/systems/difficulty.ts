/**
 * Nivel de dificultad de cada equipo (B-04). MatchScene lo fija al crear el
 * partido; `aiProfileFor` (constants.ts) devuelve el perfil ya mezclado, así que
 * la IA no consulta nada de aquí por paso salvo la ayuda arcade.
 *
 * Partido con persona: el rival (rojo) usa el nivel elegido (menos
 * DIFFICULTY_TOUCH_SHIFT si juega en táctil) y sus compañeros (azul), NORMAL.
 * IA contra IA: NORMAL los dos. El laboratorio (`?diffBlue=&diffRed=`) puede
 * fijar el nivel de cada equipo por encima de todo lo anterior.
 */

import {
  AI_PROFILES_BY_LEVEL,
  AI_TEAM_PROFILE,
  DIFFICULTY,
  DIFFICULTY_LEVELS,
  DIFFICULTY_TOUCH_SHIFT,
  type AiProfile,
  type DifficultyLevel,
} from '../constants'
import type { TeamColor } from '../types'

const NORMAL_INDEX = DIFFICULTY_LEVELS.indexOf('normal')
const MAX_INDEX = DIFFICULTY_LEVELS.length - 1

const teamLevel: Record<TeamColor, number> = { blue: NORMAL_INDEX, red: NORMAL_INDEX }
const teamRubber: Record<TeamColor, boolean> = { blue: true, red: true }
const labOverride: Record<TeamColor, number | null> = { blue: null, red: null }

export function difficultyIndex(level: DifficultyLevel): number {
  return DIFFICULTY_LEVELS.indexOf(level)
}

/** Nivel de un texto de URL (`facil`, `normal`, `dificil`, `experto` o un índice 0..3); null si no vale. */
export function parseDifficulty(raw: string | null): number | null {
  if (raw === null || raw === '') return null
  const i = DIFFICULTY_LEVELS.indexOf(raw.toLowerCase() as DifficultyLevel)
  if (i >= 0) return i
  const n = Number(raw)
  return Number.isFinite(n) ? Math.min(MAX_INDEX, Math.max(0, n)) : null
}

/** Mezcla los perfiles vecinos de un nivel fraccional en `out` (sin asignar). */
function blendProfile(level: number, out: AiProfile) {
  const lo = Math.floor(level)
  const hi = Math.min(MAX_INDEX, lo + 1)
  const f = level - lo
  const a = AI_PROFILES_BY_LEVEL[lo] as Record<keyof AiProfile, number>
  const b = AI_PROFILES_BY_LEVEL[hi] as Record<keyof AiProfile, number>
  const o = out as Record<keyof AiProfile, number>
  for (const k of Object.keys(a) as (keyof AiProfile)[]) o[k] = a[k] + (b[k] - a[k]) * f
}

/** Fija el nivel (índice, admite fracciones) de un equipo y su perfil activo. */
export function setTeamDifficulty(team: TeamColor, level: number) {
  const l = Math.min(MAX_INDEX, Math.max(0, level))
  teamLevel[team] = l
  blendProfile(l, AI_TEAM_PROFILE[team])
  // La ayuda arcade la tiene el nivel redondeado: con FÁCIL y NORMAL sí, con DIFÍCIL y EXPERTO no
  teamRubber[team] = DIFFICULTY[DIFFICULTY_LEVELS[Math.round(l)]].rubberBand
}

export function getTeamDifficulty(team: TeamColor): number {
  return teamLevel[team]
}

/** Laboratorio: nivel fijo por equipo para los partidos siguientes (null = el normal del partido). */
export function setDifficultyOverride(blue: number | null, red: number | null) {
  labOverride.blue = blue
  labOverride.red = red
}

/**
 * Niveles del partido que empieza. `humanTeam` es el equipo de la persona (null =
 * IA contra IA); en táctil el rival baja DIFFICULTY_TOUCH_SHIFT niveles.
 */
export function configureMatchDifficulty(chosen: DifficultyLevel, touch: boolean, humanTeam: TeamColor | null) {
  const shift = humanTeam && touch ? DIFFICULTY_TOUCH_SHIFT : 0
  for (const team of ['blue', 'red'] as const) {
    const rival = humanTeam !== null && team !== humanTeam
    const base = labOverride[team] ?? (rival ? difficultyIndex(chosen) : NORMAL_INDEX)
    setTeamDifficulty(team, rival ? base - shift : base)
    // La persona tiene siempre la ayuda arcade, sea cual sea el nivel de sus compañeros
    if (team === humanTeam) teamRubber[team] = true
  }
}

/** ¿El equipo recibe la ayuda arcade (rubber-banding) cuando va perdiendo? */
export function rubberBandFor(team: TeamColor): boolean {
  return teamRubber[team]
}
