export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720
export const MATCH_DURATION = 120
export const PLAYER_RADIUS = 18
export const GOALIE_RADIUS = 9
export const BALL_RADIUS = 6
export const GOAL_WIDTH = 28
/** Semialtura interior de la portería: boca de 1,70 m reglamentarios (51 px a 30 px/m en Y). */
export const GOAL_HALF_H = 25.5
/** Fondo de la red: arco trasero de 0,64 m (≈ 18 px en X). */
export const GOAL_BACK_DEPTH = 18
export const GOAL_LINE_OFFSET = 86
export const GOAL_NET_HOLD_X = 10
export const GOAL_POST_REBOUND = 0.82
export const GOAL_SIDE_REBOUND = 0.78
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
export const BALL_PROTECT_VELOCITY_BLEND = 0.04
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
export const GOALIE_SAVE_RADIUS = 7
/** Recorrido lateral máximo del portero desde el centro de la boca (poste + margen). */
export const GOALIE_AI_MAX_Y = GOAL_HALF_H + 6
/** Fracción del ángulo bola-portería que sigue el portero IA (menos = más batible). */
export const GOALIE_AI_TRACK = 0.25
export const GOALIE_CLAIM_RADIUS = 7
export const BALL_MAGNET_MAX_SPEED = 220
export const GOALIE_DISTRIBUTION_DELAY_MS = 550
export const FOUL_CHANCE_ON_STEAL = 0.28
export const MANUAL_STEAL_RANGE = 52
export const MANUAL_STEAL_SUCCESS_CHANCE = 0.34
export const MANUAL_STEAL_FOUL_CHANCE = 0.12
export const AI_STEAL_ATTEMPT_CHANCE = 0.08
export const AI_STEAL_ENGAGE_FRONT_DOT = 0.08
/** Distancia a la que el defensor más cercano se planta delante del portador rival. */
export const AI_PRESS_DISTANCE = 26
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
/** Mezcla del tiro asistido de la IA hacia el punto de apuntado (1 = puntería exacta). */
export const SHOT_ASSIST_BLEND = 1
/** Idem para el jugador humano: conserva el 25 % de su propia dirección. */
export const SHOT_ASSIST_BLEND_HUMAN = 0.75
/** Desvío vertical máximo (px) del punto de tiro asistido respecto al centro de la boca. */
export const SHOT_AIM_MAX_OFFSET = 14
export const POSSESSION_RELEASE_COOLDOWN_MS = 260
export const GOALIE_RELEASE_COOLDOWN_MS = 900
export const GOALIE_DISTRIBUTION_POWER = 640
export const GOALIE_RELEASE_DISTANCE = 66
export const DIRECT_FREE_HIT_SPOT_OFFSET = 211
/** Punto de penalti: 5,40 m de la línea de gol (x: 28,5 px/m). */
export const PENALTY_SPOT_OFFSET = 154
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

/**
 * Margen extra en mundo para evitar que los patines (que viven en screen-space)
 * sobresalgan visualmente por debajo del borde inferior de la pista.
 */
export const FIELD_PLAYER_BOTTOM_BOARD_MARGIN = 30

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
 * Nota: la zona de falta del portero (MatchScene) usa este radio centrado en la línea de gol.
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

// ─── Modo arcade ────────────────────────────────────────────────────────────
// Tuning del modo arcade (estilo NBA Jam): turbo, cargas, racha, powerups y cámara.

/** Duración de cada periodo en arcade (s). Partidos más cortos y frenéticos. */
export const ARCADE_PERIOD_DURATION = 90
/** Pausa de celebración tras gol en arcade (ms); más larga para lucir la cámara y los efectos. */
export const ARCADE_GOAL_CELEBRATION_MS = 2600
/** Escala del casco en arcade ("cabezones"). */
export const ARCADE_HEAD_SCALE = 1.32

/** Multiplicador de velocidad máxima al sprintar en arcade (encima del sprint base). */
export const ARCADE_TURBO_SPEED_BONUS = 1.08
/** Stamina mínima y coste del tiro turbo (Shift + tiro). */
export const ARCADE_TURBO_SHOT_COST = 22
export const ARCADE_TURBO_SHOT_POWER = 1.3
/** Probabilidad de que un tiro turbo supere al portero sin que pueda pararlo. */
export const ARCADE_TURBO_SHOT_BEAT_GOALIE = 0.16
export const ARCADE_FIRE_SHOT_POWER = 1.42
export const ARCADE_FIRE_SHOT_BEAT_GOALIE = 0.62
/** Bola de fuego del powerup: un poco más letal que la racha. */
export const ARCADE_POWERUP_FIRE_BEAT_GOALIE = 0.75
/** Ventana tras el tiro en la que el efecto especial sigue vivo (ms). */
export const ARCADE_SHOT_FX_MS = 1500

/** Carga con el cuerpo (Shift + robo sin bola). */
export const ARCADE_CHECK_COST = 18
export const ARCADE_CHECK_RANGE = 64
export const ARCADE_CHECK_COOLDOWN_MS = 750
export const ARCADE_CHECK_STUN_MS = 1150
export const ARCADE_CHECK_KNOCKBACK = 420
export const ARCADE_CHECK_LUNGE = 260
export const ARCADE_CHECK_BALL_POWER = 300
/** Probabilidad por frame de que la IA convierta un intento de robo en carga. */
export const ARCADE_AI_CHECK_CHANCE = 0.35

/** Goles seguidos de un mismo jugador (sin respuesta rival) para entrar en racha. */
export const ARCADE_ON_FIRE_GOALS = 2
/** Ventana para atribuir un gol al último tirador (ms). */
export const ARCADE_SHOOTER_CREDIT_MS = 5000

/** Ventaja de velocidad por gol de diferencia para el equipo que pierde (rubber-banding). */
export const ARCADE_RUBBER_BAND_PER_GOAL = 0.03
export const ARCADE_RUBBER_BAND_MAX = 0.09

export const ARCADE_POWERUP_FIRST_DELAY_MS = 7000
export const ARCADE_POWERUP_INTERVAL_MIN_MS = 10000
export const ARCADE_POWERUP_INTERVAL_MAX_MS = 15000
export const ARCADE_POWERUP_LIFETIME_MS = 12000
export const ARCADE_POWERUP_MAX_ACTIVE = 2
export const ARCADE_POWERUP_PICKUP_RADIUS = 30
/** Distancia a la que la IA se desvía para recoger un powerup. */
export const ARCADE_POWERUP_AI_SEEK_RADIUS = 170
export const ARCADE_POWERUP_TURBO_MS = 8000
export const ARCADE_POWERUP_TURBO_SPEED = 1.12
export const ARCADE_POWERUP_MAGNET_MS = 8000
export const ARCADE_POWERUP_WALL_MS = 10000
export const ARCADE_POWERUP_WALL_SAVE_SCALE = 1.65
export const ARCADE_POWERUP_FREEZE_MS = 2600
export const ARCADE_POWERUP_FREEZE_TARGETS = 2

/** Cámara dinámica: zoom base, en zona de ataque y con bola rápida. */
export const ARCADE_CAMERA_ZOOM = 1.32
export const ARCADE_CAMERA_ZOOM_ATTACK = 1.46
export const ARCADE_CAMERA_ZOOM_FAST = 1.2
export const ARCADE_CAMERA_ZOOM_GOAL = 1.85
/** Anticipación de cámara en segundos de velocidad de la bola. */
export const ARCADE_CAMERA_LOOKAHEAD_S = 0.28
