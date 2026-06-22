export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720
export const MATCH_DURATION = 120
export const PLAYER_RADIUS = 18
export const GOALIE_RADIUS = 20
export const BALL_RADIUS = 6
export const GOAL_WIDTH = 28
export const GOAL_HEIGHT = 150
export const GOAL_BACK_DEPTH = 34
export const GOAL_LINE_OFFSET = 86
export const GOAL_NET_HOLD_X = 10
export const GOAL_POST_REBOUND = 0.82
export const GOAL_SIDE_REBOUND = 0.78
export const BLUE_LINE_OFFSET = 210
export const PLAYER_MAX_SPEED = 320
export const PLAYER_SPRINT_MAX_SPEED = 500
export const PLAYER_ACCEL = 860
export const PLAYER_SPRINT_ACCEL_MULTIPLIER = 1.42
export const PLAYER_FRICTION = 0.925
export const BALL_FRICTION = 0.989
export const BALL_CONTROL_DISTANCE = 30
export const BALL_PICKUP_DISTANCE = 38
export const BALL_CAPTURE_SHIELD_DISTANCE = 46
export const BALL_MAGNET_DISTANCE = 48
export const BALL_PROTECT_OFFSET_SIDE = 8
export const BALL_PROTECT_VELOCITY_BLEND = 0.12
export const BALL_CLAIM_FRONT_DOT = -0.15
export const BALL_CLAIM_FACING_BONUS = 8
export const BALL_CLAIM_FACING_PENALTY = 10
export const BALL_CONTROL_PROTECTION_MS = 320
export const STAMINA_MAX = 100
export const STAMINA_SPRINT_DRAIN_PER_SECOND = 24
export const STAMINA_RECOVERY_PER_SECOND = 15
export const STAMINA_LOW_THRESHOLD = 18
export const BALL_CONTROL_PROTECTION_BACK_EXTRA_MS = 220
export const PASS_POWER = 520
export const SHOT_POWER = 700
export const DUMP_RELEASE_POWER = 160
export const STEAL_RELEASE_POWER = 190
export const GOALIE_SAVE_RADIUS = 34
export const GOALIE_CLAIM_RADIUS = 22
export const BALL_MAGNET_MAX_SPEED = 220
export const GOALIE_DISTRIBUTION_DELAY_MS = 550
export const FOUL_CHANCE_ON_STEAL = 0.28
export const MANUAL_STEAL_RANGE = 52
export const MANUAL_STEAL_SUCCESS_CHANCE = 0.34
export const MANUAL_STEAL_FOUL_CHANCE = 0.12
export const AI_STEAL_ATTEMPT_CHANCE = 0.08
export const AI_STEAL_ENGAGE_FRONT_DOT = 0.08
export const STEAL_FRONT_SUCCESS_CHANCE = 0.03
export const STEAL_FRONT_LOOSE_CHANCE = 0.05
export const STEAL_FRONT_FOUL_CHANCE = 0.07
export const STEAL_SIDE_SUCCESS_CHANCE = 0.08
export const STEAL_SIDE_LOOSE_CHANCE = 0.38
export const STEAL_SIDE_FOUL_CHANCE = 0.16
export const STEAL_BACK_SUCCESS_CHANCE = 0.005
export const STEAL_BACK_LOOSE_CHANCE = 0.06
export const STEAL_BACK_FOUL_CHANCE = 0.62
export const BALL_CARRIER_SHIELD_FRONT_DOT = 0.45
export const BALL_CARRIER_SHIELD_BONUS = 0.08
export const STEAL_LOOSE_BALL_POWER = 245
export const STEAL_LOOSE_BALL_IGNORE_MS = 220
export const PASS_ASSIST_CONE_DOT = 0.45
export const PASS_ASSIST_BLEND = 0.55
export const SHOT_ASSIST_BLEND = 0.68
export const POSSESSION_RELEASE_COOLDOWN_MS = 260
export const GOALIE_RELEASE_COOLDOWN_MS = 900
export const GOALIE_DISTRIBUTION_POWER = 640
export const GOALIE_RELEASE_DISTANCE = 66
export const DIRECT_FREE_HIT_SPOT_OFFSET = 160
export const BALL_FREEZE_AFTER_GOALIE_RELEASE_MS = 220
export const BULLY_SETUP_MS = 1400
export const FOUL_SETUP_MS = 1100
export const BULLY_CLUSTER_RADIUS = 52
export const BULLY_MIN_PLAYERS = 2
export const STUCK_BALL_TIMEOUT_MS = 3000

export const RINK = {
  x: 70,
  y: 60,
  width: 1140,
  height: 600,
}

export const PERIOD_COUNT = 4
export const PERIOD_RESTART_DELAY_MS = 1400
export const BULLY_PLAYER_OFFSET = 26
export const MAX_BALL_SPEED = 760
export const DIRECT_FREE_HIT_FOUL_THRESHOLD = 10
/** Factor de velocidad máxima cuando la stamina está por debajo del umbral bajo */
export const STAMINA_EXHAUSTED_SPEED_FACTOR = 0.78
export const STICK_SWING_MS = 160
/**
 * Radio del semicírculo D del portero (0,85 m × 30 px/m = 25,5 → 26 px).
 * Diámetro visual = apertura interior de la portería (1,70 m).
 * Nota: la zona de foul se comprueba con un radio mayor (GOAL_HEIGHT) en MatchScene.
 */
export const GOALIE_ZONE_RADIUS = 26
/** Profundidad del área de portería desde la línea de gol (5,40 m × 28,5 px/m) */
export const PENALTY_AREA_DEPTH = 154
/** Altura del área de portería (9 m × 30 px/m) */
export const PENALTY_AREA_HEIGHT = 270
/** Duración de la tarjeta azul en ms (2 minutos reglamentarios) */
export const BLUE_CARD_DURATION_MS = 120_000
/** Posición Y del banquillo de expulsiones (encima de la pista) */
export const BENCH_Y_TOP = 30
/** Posición Y del banquillo del equipo rojo (debajo de la pista) */
export const BENCH_Y_BOTTOM = 690

/** Distancia máxima al gol rival para que la IA intente disparar */
export const AI_SHOOT_DISTANCE = 370
/** Radio de marcaje: distancia rival→compañero que lo considera cubierto */
export const AI_MARK_RADIUS = 72
/** Ventaja mínima de distancia al gol para preferir pase a compañero libre */
export const AI_OPEN_MATE_GAP = 80
