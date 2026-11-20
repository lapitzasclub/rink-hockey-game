import type { DifficultyLevel } from '../constants'
import type { TeamColor } from '../types'

/**
 * Contrato del lanzamiento en tercera persona (docs/setpiece/WORKFLOW.md §1).
 * Todo en metros y segundos con el marco de `view.ts`: x lateral, y distancia
 * desde la línea de gol hacia el campo (portería en y = 0), z altura.
 */

export type SetPieceKind = 'penalty' | 'direct'
/** Qué lleva la persona en el duelo; 'none' = IA contra IA (humo, lote). */
export type SetPieceControl = 'shooter' | 'goalie' | 'none'

export interface SetPieceRequest {
  kind: SetPieceKind
  /** Equipo que lanza. */
  shooterTeam: TeamColor
  /** Nivel de la IA rival de la persona (o de las dos IA si human = 'none'). */
  difficulty: DifficultyLevel
  human: SetPieceControl
  /** Final de periodo (art. 30.9): solo tiro directo, sin conducción ni segundo intento. */
  finalShot: boolean
}

export type SetPieceOutcome = 'goal' | 'save' | 'post' | 'wide' | 'held'

/** Lo que vuelve al partido. Con save/post e `inPlay`, la bola sigue viva desde (x, y) con (vx, vy). */
export interface SetPieceResult {
  outcome: SetPieceOutcome
  x: number
  y: number
  vx: number
  vy: number
  /** La bola sigue en juego (rechace); false si salió por detrás o el portero la tiene. */
  inPlay: boolean
  /** Desde el pitido hasta el final del duelo (s). */
  durationS: number
  /** Velocidad de salida del golpeo (m/s); 0 si no llegó a tirar. */
  shotSpeed: number
  drove: boolean
  touchedGoalie: boolean
  touchedFrame: boolean
}

/** Entradas del golpeo. */
export interface ShotInput {
  /** Punto de la boca: x −1..1 (±media boca, 1 = palo derecho), z 0..1 (suelo..larguero). */
  aimX: number
  aimZ: number
  /** 0..1 → SETPIECE_BALL.shotSpeedMin..shotSpeedMax. */
  power: number
  /** Efecto del golpeo −1..1 (positivo curva hacia +x). */
  curve: number
}

/** Plan del lanzador antes del pitido: tiro desde el punto o conducción hasta (tx, ty). */
export interface DrivePlan {
  drive: boolean
  tx: number
  ty: number
  /** Carrerilla del directo detrás de la bola (m, 0..SETPIECE_DUEL.runUpMaxM); el penalti la ignora. */
  runUpM: number
}

export type SetPiecePhase = 'runup' | 'drive' | 'windup' | 'aim' | 'flight' | 'done'
