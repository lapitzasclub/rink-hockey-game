/** Límites legales de la longitud de pista en metros (REG TR a.1 ap. 3): 34 a 44 m, proporción 2:1. */
const RINK_LENGTH_MIN_M = 34
const RINK_LENGTH_MAX_M = 44
/** Longitud con la que se escribieron los valores en px (K = 1). */
const RINK_LENGTH_BASE_M = 40
/** Pista por defecto: 36 × 18 m, legal y más arcade que la base (D11). */
const RINK_LENGTH_DEFAULT_M = 36

/** Lee `?rinkm=` (solo en DEV); fuera del rango legal o no numérico devuelve la de por defecto. */
function readRinkLengthM(): number {
  if (!import.meta.env.DEV || typeof window === 'undefined') return RINK_LENGTH_DEFAULT_M
  const raw = new URLSearchParams(window.location.search).get('rinkm')
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) && value >= RINK_LENGTH_MIN_M && value <= RINK_LENGTH_MAX_M ? value : RINK_LENGTH_DEFAULT_M
}

/** Longitud de la pista en metros: única fuente del tamaño (la anchura es la mitad, proporción 2:1). */
export const RINK_LENGTH_M = readRinkLengthM()
export const RINK_WIDTH_M = RINK_LENGTH_M / 2
/**
 * Factor de escala de los objetos físicos: la pantalla sigue siendo 1140 × 600 px, así que
 * con menos metros cada metro ocupa más px. Escala con K todo lo que mide metros reales
 * (cuerpos, bola, portería, marcas, alcances); NO escala velocidades, tiempos ni rangos tácticos.
 * A 40 m vale exactamente 1.
 */
export const K = RINK_LENGTH_BASE_M / RINK_LENGTH_M

export const GAME_WIDTH = 1280
export const GAME_HEIGHT = 720

/**
 * Simulación a paso fijo: física, IA y reglas avanzan siempre en pasos de 1/60 s,
 * sea cual sea el refresco de la pantalla (50, 60, 120, 144 Hz) o el tamaño del
 * lienzo. El ajuste de rozamientos y probabilidades "por paso" se hizo a 60 Hz.
 */
export const SIM_HZ = 60
export const SIM_STEP_MS = 1000 / SIM_HZ
/** Pasos máximos por fotograma: por debajo de SIM_HZ / SIM_MAX_STEPS fps el juego se ralentiza en vez de dar saltos. */
export const SIM_MAX_STEPS = 5
/** Tope del tiempo real que se recupera de un fotograma (pestaña oculta, parón del navegador). */
export const SIM_MAX_FRAME_MS = 250
/** Salto (px de mundo, |dx| + |dy|) en un paso a partir del cual no se interpola: saques, faltas y teletransportes. */
export const SIM_SNAP_DIST = 40
export const PLAYER_RADIUS = 18 * K
export const GOALIE_RADIUS = 9 * K
export const BALL_RADIUS = 6 * K
export const GOAL_WIDTH = 28 * K
/** Semialtura interior de la portería: boca de 1,70 m reglamentarios (51 px a 30 px/m en Y). */
export const GOAL_HALF_H = 25.5 * K
/** Fondo de la red: arco trasero de 0,64 m (≈ 18 px en X). */
export const GOAL_BACK_DEPTH = 18 * K
export const GOAL_LINE_OFFSET = 86 * K
export const GOAL_NET_HOLD_X = 10 * K
/** Margen entre el centro de la bola y la valla (radio + 3 px). */
export const BALL_WALL_MARGIN = 9 * K
/** Distancia de la bola al portador (se suma al radio del cuerpo). */
export const BALL_CARRY_GAP = 8 * K
/** Holgura extra entre cuerpos en la separación de jugadores. */
export const PLAYER_SEPARATION_GAP = 8 * K
/** Límites X del portero respecto a la valla de fondo: mínimo (junto al fondo) y su sitio habitual (tope de colocación). */
export const GOALIE_X_MIN = 28 * K
export const GOALIE_X_MAX = 90 * K
/** Salida máxima ante un mano a mano sobre su sitio habitual: el tope físico es GOALIE_X_MAX + esto. */
export const GOALIE_OUT_DEPTH = 22 * K
/** Bola suelta más lenta que esto (px/s) a su alcance: el portero va a por ella y la cubre. */
export const GOALIE_SMOTHER_SPEED = 40
/**
 * Posición base del portero (x desde la valla de fondo): su sitio habitual. Antes valía 110 y el
 * tope lo dejaba siempre empujando contra GOALIE_X_MAX con velocidad que no movía (deslizaba).
 */
export const GOALIE_BASE_X = GOALIE_X_MAX
/** Contacto cuerpo-bola y punta del stick que desvía la bola (px sobre el radio / absolutos). */
export const BALL_BODY_KICK_GAP = 12 * K
export const BALL_STICK_KICK_DISTANCE = 14 * K
/** Adelanto del saque del portero sobre la distancia de suelta. */
export const GOALIE_RELEASE_LEAD = 28 * K
/** Separación entre los dos jugadores para considerar un bully disputado. */
export const BULLY_CONTEST_GAP = 74 * K
export const GOAL_POST_REBOUND = 0.82
export const GOAL_SIDE_REBOUND = 0.78
export const PLAYER_MAX_SPEED = 320
export const PLAYER_SPRINT_MAX_SPEED = 500
export const PLAYER_ACCEL = 860
export const PLAYER_SPRINT_ACCEL_MULTIPLIER = 1.42
export const PLAYER_FRICTION = 0.925
export const BALL_FRICTION = 0.989
export const BALL_CONTROL_DISTANCE = 30 * K
export const BALL_PICKUP_DISTANCE = 38 * K
export const BALL_CAPTURE_SHIELD_DISTANCE = 46 * K
export const BALL_MAGNET_DISTANCE = 48 * K
export const BALL_PROTECT_OFFSET_SIDE = 8 * K
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
/**
 * Pase y tiro cargados del humano: mientras se mantiene el botón se llena la carga y al
 * soltar sale con esa fuerza. Por debajo de TAP es una pulsación corta (fuerza normal);
 * a FULL la carga está llena y a AUTO sale sola. Al máximo el pase va a ×PASS_MAX y el tiro
 * a ×SHOT_MAX. Como en los juegos de deportes, más fuerza es menos precisión: el desvío crece
 * con el cuadrado de la carga hasta SHOT_SPREAD / PASS_SPREAD rad (a media carga, un cuarto).
 */
export const CHARGE_TAP_MS = 110
export const CHARGE_FULL_MS = 700
export const CHARGE_AUTO_MS = 1150
export const CHARGE_PASS_MAX = 1.5
export const CHARGE_SHOT_MAX = 1.3
export const CHARGE_SHOT_SPREAD = 0.12
export const CHARGE_PASS_SPREAD = 0.07
/**
 * La IA carga igual que el humano (mismo tiempo, fuerza y desvío; puede perder la bola mientras
 * carga), pero solo con espacio (PRESSURE_PX). Tiro: carga 0 hasta NEAR px de la portería y llena a FAR. Pase: carga de vez en
 * cuando (PASS_CHANCE) hasta PASS_MAX. JITTER es el error con que elige la carga.
 */
export const AI_CHARGE_SHOT_NEAR = 140
export const AI_CHARGE_SHOT_FAR = 480
export const AI_CHARGE_PASS_CHANCE = 0.35
export const AI_CHARGE_PASS_MAX = 0.7
export const AI_CHARGE_JITTER = 0.25
/** Con un rival a menos de esto (px) la IA no carga: la toca al momento, como haría un jugador. */
export const AI_CHARGE_PRESSURE_PX = 110
export const DUMP_RELEASE_POWER = 160
export const STEAL_RELEASE_POWER = 190
export const GOALIE_SAVE_RADIUS = 7 * K
/** Recorrido lateral máximo del portero desde el centro de la boca (poste + margen). */
export const GOALIE_AI_MAX_Y = GOAL_HALF_H + 6 * K
/** Fracción de la bisectriz bola–postes que sigue el portero IA (1 = sobre ella). */
export const GOALIE_AI_TRACK = 1
export const GOALIE_CLAIM_RADIUS = 7 * K
export const BALL_MAGNET_MAX_SPEED = 220
export const GOALIE_DISTRIBUTION_DELAY_MS = 550
/** Portero en manos del humano: plazo antes de sacar solo si no pasa (ms). */
export const GOALIE_HUMAN_HOLD_MS = 3000

// ── Movimiento del portero de IA (E-03): objetivo suavizado y patinaje con límites ──
/** Velocidad punta de colocación (px/s) y aceleración neta (px/s²): desplazamiento lateral en guardia. */
export const GOALIE_MOVE_SPEED = 150
export const GOALIE_MOVE_ACCEL = 900
/** Reacción a un tiro: estirada lateral más rápida (px/s, px/s²). */
export const GOALIE_DIVE_SPEED = 200
export const GOALIE_DIVE_ACCEL = 1400
/** Ganancia de llegada (1/s): velocidad deseada por px de error, antes del tope de frenada. */
export const GOALIE_ARRIVE_GAIN = 9
/** Zona muerta del objetivo (px): variaciones menores no mueven al portero. */
export const GOALIE_TARGET_DEADZONE = 1.5
/** Constante de tiempo del filtro del objetivo (s): quita el temblor de seguir la bola paso a paso. */
export const GOALIE_TARGET_TAU = 0.07
/** Giro máximo de la mirada (rad/s) y ángulo máximo respecto al frente (no se gira hacia su portería). */
export const GOALIE_TURN_RATE = 7
export const GOALIE_FACE_MAX_RAD = 1.25
/** Bola tras la línea de gol: fracción de su y que sigue y tope (cubre el poste del lado de la bola). */
export const GOALIE_BEHIND_TRACK = 0.4
export const GOALIE_BEHIND_MAX_Y = GOAL_HALF_H * 0.6
/** Bola libre hacia su portería a más de esto (px/s) y a menos de GOALIE_SHOT_READ_RANGE: la lee como tiro. */
export const GOALIE_SHOT_MIN_SPEED = 300
export const GOALIE_SHOT_READ_RANGE = 520
/** Margen sobre la boca (px) en el que un tiro leído merece estirarse. */
export const GOALIE_SHOT_MOUTH_MARGIN = 14 * K
/** Mano a mano: portador rival a menos de esto de la portería y por delante de todos los defensores. */
export const GOALIE_OUT_RANGE = 230
/** Franja (|y| desde el centro, px) en la que el mano a mano justifica salir. */
export const GOALIE_OUT_LANE = 110
/** El cambio de jugador puede pasar al portero propio con la bola a menos de esto de su portería (px). */
export const GOALIE_SELECT_RANGE = 280
/**
 * Cambio con dirección (como en los juegos de fútbol): con el stick por encima de
 * SWITCH_AIM_MIN se elige al compañero cuya dirección desde el controlado se aparta
 * menos de SWITCH_AIM_MAX_ANGLE (rad) del stick; el ángulo pesa SWITCH_AIM_ANGLE_PX
 * px de distancia por radián, para que gane el bien apuntado aunque esté algo más lejos.
 */
export const SWITCH_AIM_MIN = 0.5
export const SWITCH_AIM_MAX_ANGLE = 1.05
export const SWITCH_AIM_ANGLE_PX = 220
/** Recorrido lateral del portero controlado por el humano desde el centro de la boca (px). */
export const GOALIE_HUMAN_MAX_Y = GOAL_HALF_H + 34 * K
export const FOUL_CHANCE_ON_STEAL = 0.28
export const MANUAL_STEAL_RANGE = 52 * K
export const MANUAL_STEAL_SUCCESS_CHANCE = 0.34
export const MANUAL_STEAL_FOUL_CHANCE = 0.055
/**
 * Presionar (como en los juegos de fútbol): mantener tiro sin la bola lleva al controlado hacia
 * el portador rival, apuntando a donde estará en LEAD_S, y entra a robar cada INTERVAL_MS cuando
 * llega. Con el stick marcado se mezcla con él a STICK_BLEND (0 = solo el stick).
 */
export const PRESS_LEAD_S = 0.18
export const PRESS_STEAL_INTERVAL_MS = 330
export const PRESS_STICK_BLEND = 0.55
/** Táctil: el sprint sale empujando el joystick hasta este tanto de su radio, sin botón. */
export const TOUCH_SPRINT_STICK = 0.88
export const AI_STEAL_ENGAGE_FRONT_DOT = 0.08
export const STEAL_FRONT_SUCCESS_CHANCE = 0.03
export const STEAL_FRONT_LOOSE_CHANCE = 0.05
export const STEAL_FRONT_FOUL_CHANCE = 0.03
export const STEAL_SIDE_SUCCESS_CHANCE = 0.08
export const STEAL_SIDE_LOOSE_CHANCE = 0.38
export const STEAL_SIDE_FOUL_CHANCE = 0.07
export const STEAL_BACK_SUCCESS_CHANCE = 0.005
export const STEAL_BACK_LOOSE_CHANCE = 0.06
export const STEAL_BACK_FOUL_CHANCE = 0.32
export const BALL_CARRIER_SHIELD_FRONT_DOT = 0.45
export const BALL_CARRIER_SHIELD_BONUS = 0.08
export const STEAL_LOOSE_BALL_POWER = 245
export const STEAL_LOOSE_BALL_IGNORE_MS = 220
export const PASS_ASSIST_CONE_DOT = 0.45
export const PASS_ASSIST_BLEND = 0.55
/** Pase asistido del humano: anticipa el movimiento del receptor este tiempo (s). */
export const PASS_HUMAN_LEAD_S = 0.25
/** Un rival a menos de esto de la línea de pase penaliza al receptor en el asistido. */
export const PASS_LANE_CLEAR_DIST = 55
export const PASS_LANE_BLOCK_PENALTY = 70
/** Mezcla del tiro asistido de la IA hacia el punto de apuntado (1 = puntería exacta). */
export const SHOT_ASSIST_BLEND = 1
/** Idem para el jugador humano: conserva el 25 % de su propia dirección. */
export const SHOT_ASSIST_BLEND_HUMAN = 0.75
/** Desvío vertical máximo (px) del punto de tiro asistido respecto al centro de la boca. */
export const SHOT_AIM_MAX_OFFSET = 14 * K
export const POSSESSION_RELEASE_COOLDOWN_MS = 260
export const GOALIE_RELEASE_COOLDOWN_MS = 900
export const GOALIE_DISTRIBUTION_POWER = 640
export const GOALIE_RELEASE_DISTANCE = 66 * K
export const DIRECT_FREE_HIT_SPOT_OFFSET = 211 * K
/** Punto de penalti: 5,40 m de la línea de gol (x: 28,5 px/m). */
export const PENALTY_SPOT_OFFSET = 154 * K
export const BALL_FREEZE_AFTER_GOALIE_RELEASE_MS = 220
export const BULLY_SETUP_MS = 1400
export const FOUL_SETUP_MS = 1100
export const BULLY_CLUSTER_RADIUS = 52 * K
export const BULLY_MIN_PLAYERS = 2
export const STUCK_BALL_TIMEOUT_MS = 2200
/** Bola trabada contra la valla entre portador y rival: el árbitro corta antes (art. 13). */
export const STUCK_BOARD_TIMEOUT_MS = 1300
/** Distancia del portador a la valla para contar como bola pegada a ella. */
export const STUCK_BOARD_MARGIN = 34 * K
/** Rival a esta distancia del portador lo está trabando. */
export const STUCK_RIVAL_RADIUS = 58 * K
/** Lo que puede moverse el portador sin dejar de estar trabado. */
export const STUCK_MAX_TRAVEL = 48 * K

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
export const FIELD_PLAYER_BOTTOM_BOARD_MARGIN = 30 * K

/** Partes del partido: dos, como en el reglamento. */
export const PERIOD_COUNT = 2
/** Duración de cada parte en tiempo de juego (s): 25 minutos reglamentarios. El reloj del marcador corre acelerado. */
export const HALF_GAME_SECONDS = 25 * 60
/** Minutos reales que puede durar cada parte (Ajustes → General). 25 = tiempo real. */
export const HALF_REAL_MINUTES_OPTIONS = [2, 3, 5, 8, 12, 25] as const
/** Por defecto: unos 7–8 min de partido con paradas y descanso, ritmo de partida rápida. */
export const DEFAULT_HALF_REAL_MINUTES = 3
/** Último minuto de juego de cada parte: el reloj se pone en rojo. */
export const CLOCK_WARNING_GAME_SECONDS = 60
/** Pausa del descanso entre partes antes del saque (ms reales). */
export const PERIOD_RESTART_DELAY_MS = 2600
export const BULLY_PLAYER_OFFSET = 26 * K

// ── Saques y faltas (reglamento World Skate 2026, art. 5, 13, 23, 27–30) ──
/** Píxeles de mundo por metro a lo largo de la pista. */
export const METER_PX = RINK.width / RINK_LENGTH_M
/** Radio del círculo central (3 m): en el saque solo pueden estar dentro el ejecutante y un compañero. */
export const CENTER_CIRCLE_RADIUS = 3 * METER_PX
/** Distancia mínima de los rivales en libres indirectos y del resto de jugadores en el saque neutral (3 m). */
export const RESTART_MIN_DISTANCE = 3 * METER_PX
/** Distancia de la bola a la valla cuando la falta se señala pegada a ella (70 cm). */
export const FREE_HIT_BOARD_MARGIN = 0.7 * METER_PX
/** Velocidad a la que patinan los jugadores hacia su sitio en un saque (px/s): más que trote, menos que sprint. */
export const RESTART_SKATE_SPEED = 390
/** Frenada al llegar a su sitio (px/s²). */
export const RESTART_SKATE_DECEL = 900
/** Margen (px) para dar por colocado a un jugador. */
export const RESTART_ARRIVE_PX = 6
/** Tiempo mínimo de colocación del saque de centro antes del pitido (ms de simulación). */
export const KICKOFF_MIN_SETUP_MS = 900
/** Si alguien no ha llegado a su sitio en este tiempo, se pita igual y el resto se recoloca (ms). */
export const KICKOFF_MAX_SETUP_MS = 7000
/** Plazo para colocarse en un saque de falta o neutral antes de sacar igualmente (ms). */
export const FOUL_MAX_SETUP_MS = 5000
/** Pausa de la IA entre el pitido de un directo o penalti y el lanzamiento (ms). */
export const FOUL_AI_AIM_MS = 450
/** Cuántas faltas de equipo dan el primer libre directo y cada cuántas más se repite. */
export const TEAM_FOUL_DIRECT_FIRST = 10
export const TEAM_FOUL_DIRECT_EVERY = 5
/** Probabilidad de que una falta de robo sea grave (tarjeta azul): por detrás o de lado. */
export const SERIOUS_FOUL_CHANCE_BACK = 0.15
export const SERIOUS_FOUL_CHANCE_OTHER = 0.035
/** Ocasión clara de gol cortada con falta: portador a menos de esta distancia de la portería (px). */
export const CLEAR_CHANCE_MAX_DIST = 9 * METER_PX
/** Franja vertical (px) en la que un defensor cuenta como «entre el portador y la portería». */
export const CLEAR_CHANCE_LANE = 2.2 * METER_PX
export const MAX_BALL_SPEED = 760
/** Factor de velocidad máxima cuando la stamina está por debajo del umbral bajo */
export const STAMINA_EXHAUSTED_SPEED_FACTOR = 0.78
export const STICK_SWING_MS = 160
/**
 * Radio del semicírculo D del portero (0,85 m × 30 px/m = 25,5 → 26 px).
 * Diámetro visual = apertura interior de la portería (1,70 m).
 * Nota: la zona de falta del portero (MatchScene) usa este radio centrado en la línea de gol.
 */
export const GOALIE_ZONE_RADIUS = 26 * K
/** Profundidad del área de portería desde la línea de gol (5,40 m × 28,5 px/m) */
export const PENALTY_AREA_DEPTH = 154 * K
/** Altura del área de portería (9 m × 30 px/m) */
export const PENALTY_AREA_HEIGHT = 270 * K
/** Duración de la tarjeta azul en ms de tiempo de juego (2 minutos reglamentarios); se escala con el reloj. */
export const BLUE_CARD_DURATION_MS = 120_000
/** Posición Y del banquillo de expulsiones (encima de la pista) */
export const BENCH_Y_TOP = 30
/** Posición Y del banquillo del equipo rojo (debajo de la pista) */
export const BENCH_Y_BOTTOM = 690
/** Sancionado: plazo para llegar patinando a la puerta de su banquillo (ms). */
export const PEN_EXIT_MAX_MS = 6000

/** Distancia máxima al gol rival para que la IA intente disparar */
export const AI_SHOOT_DISTANCE = 370

// ─── IA de equipo (E-02): geometría del dibujo ─────────────────────────────
// Lo que es forma del equipo (huecos, alturas) vive aquí; lo que ajusta la
// dificultad (reacción, lectura, precisión, agresividad) va en AiProfile.

/** Apoyo corto: distancia por detrás del portador y separación lateral. */
export const AI_SUPPORT_BACK = 105
export const AI_SUPPORT_SIDE = 95
/** Ala abierta: adelanto sobre el portador y carril (distancia al eje largo). */
export const AI_WIDE_AHEAD = 120
export const AI_WIDE_LANE = 205
/** Pivot entre líneas: adelanto sobre el portador y distancia mínima a la línea de gol rival. */
export const AI_PIVOT_AHEAD = 210
export const AI_PIVOT_GOAL_GAP = 115
/** Ningún atacante sin bola pisa más allá de esto respecto a la línea de gol rival. */
export const AI_ATTACK_GOAL_GAP = 80
/** Desplazamiento de los huecos candidatos que se prueban alrededor de cada puesto. */
export const AI_SPOT_PROBE = 48
/** Distancia por debajo de la cual dos atacantes se consideran amontonados. */
export const AI_CROWD_RADIUS = 105
/** Margen a las vallas para cualquier destino de la IA. */
export const AI_BOARD_MARGIN = 34
/** Un compañero lejos de su puesto sprinta si le falta más que esto. */
export const AI_SUPPORT_SPRINT_DIST = 240
/** Pases útiles: más cortos no compensan, más largos llegan muertos. */
export const AI_PASS_MIN_DIST = 70
export const AI_PASS_MAX_DIST = 470
/** Velocidad con la que la IA estima que un rival corre a cortar una bola (px/s). */
export const AI_RIVAL_RUN_SPEED = 300
/** Radio con que un jugador se queda una bola libre, a efectos de lectura de líneas. */
export const AI_CLAIM_REACH = 48
/** Marcaje en zona: distancia por el lado de portería al atacante marcado. */
export const AI_MARK_GAP = 36
/** Muestras de la trayectoria de la bola libre (cada AI_BALL_PATH_STEP pasos de 60 Hz). */
export const AI_BALL_PATH_SAMPLES = 28
export const AI_BALL_PATH_STEP = 3

/**
 * Perfil de IA por equipo: lo que cambia cada nivel de dificultad (DIFFICULTY).
 * Nunca toca la física (velocidad, aceleración, potencias): solo reacción,
 * lectura, precisión y agresividad.
 */
export type AiProfile = {
  /** Tiempo desde que recibe hasta su primera decisión con la bola (ms). */
  reactionMs: number
  /** Tiempo mínimo con la bola antes de tirar (ms): sin él, cada pase acaba en remate a la primera. */
  shotReactionMs: number
  /** Tiempo que tarda el portero en leer un tiro y empezar a estirarse (ms). */
  goalieReactionMs: number
  /** Cada cuánto revalúa pase/tiro/conducir mientras conduce (ms, ±25 % de jitter). */
  decisionIntervalMs: number
  /** Cada cuánto recalcula los compañeros su hueco de desmarque (ms). */
  supportRefreshMs: number
  /** Retraso con que un jugador arranca hacia una bola libre (s), en la estimación de corte. */
  interceptReactionS: number
  /** Margen mínimo (px) que exige entre la línea de pase y el rival que puede cortarla. */
  passLaneMargin: number
  /** Cuánto anticipa el movimiento de los rivales al leer una línea (0 = los ve quietos, 1 = carrera completa). */
  laneRead: number
  /** Fracción del movimiento del receptor que anticipa el pase (0 = a sus pies). */
  passLead: number
  /** Error angular máximo del pase (rad, uniforme ±). */
  passErrorRad: number
  /** Error angular máximo del tiro (rad, uniforme ±). */
  shotErrorRad: number
  /** Puntuación mínima de tiro (0..1) para disparar. */
  shootThreshold: number
  /** Puntuación mínima de la mejor opción de pase (0..1) para pasar. */
  passThreshold: number
  /** Cuánto pierde por segundo el valor de seguir conduciendo (empuja a soltarla). */
  holdDecayPerS: number
  /** Probabilidad por paso de intentar robo cuando el portador está a tiro. */
  stealAttemptChance: number
  /** Distancia a la que el presionador se planta delante del portador. */
  pressDistance: number
  /** Cuánto se coloca el presionador del lado de su portería (0 = delante de la mirada del portador, 1 = en la línea a portería). */
  pressGoalSide: number
  /** Intensidad de carrera del presionador (fracción de la aceleración). */
  pressIntensity: number
  /** Dónde corta el segundo defensor la línea portador→receptor peligroso (0 = en el portador, 1 = en el receptor). */
  cutDepth: number
  /** Altura del bloque desde la línea de gol propia con la bola en campo propio / rival (px). */
  blockLowDepth: number
  blockHighDepth: number
  /** Peso del marcaje al hombre frente a la posición de zona (0 = zona pura, 1 = al hombre). */
  markTightness: number
  /** Probabilidad de que un intento de robo sea una carga (solo arcade). */
  checkChance: number
  /** Arcade: multiplica stealAttemptChance (allí la carga ya roba mucho y sin faltas). */
  arcadeStealScale: number
  /** Escala de goalieReactionMs en arcade: los tiros turbo y de fuego llegan antes. */
  arcadeGoalieReactionScale: number
}

/** Distancia a la que el defensor más cercano se planta delante del portador rival. */
export const AI_PRESS_DISTANCE = 26 * K

/** IA anterior a B-04: base sobre la que DIFFICULTY sustituye valores. */
export const AI_PROFILE_NORMAL: AiProfile = {
  reactionMs: 170,
  shotReactionMs: 450,
  goalieReactionMs: 275,
  decisionIntervalMs: 150,
  supportRefreshMs: 260,
  interceptReactionS: 0.12,
  passLaneMargin: 6,
  laneRead: 0.75,
  passLead: 0.8,
  passErrorRad: 0.03,
  shotErrorRad: 0,
  shootThreshold: 0.36,
  passThreshold: 0.42,
  holdDecayPerS: 0.18,
  stealAttemptChance: 0.3,
  pressDistance: AI_PRESS_DISTANCE,
  pressGoalSide: 0,
  pressIntensity: 1,
  cutDepth: 0.72,
  blockLowDepth: 150,
  blockHighDepth: 420,
  markTightness: 0.8,
  checkChance: 0.35,
  arcadeStealScale: 0.3,
  arcadeGoalieReactionScale: 0.78,
}

// ─── Dificultad (B-04) ──────────────────────────────────────────────────────

export type DifficultyLevel = 'facil' | 'normal' | 'dificil' | 'experto'
/** Orden de los niveles: el índice es el nivel numérico (0 = FÁCIL), y admite fracciones entre vecinos. */
export const DIFFICULTY_LEVELS: readonly DifficultyLevel[] = ['facil', 'normal', 'dificil', 'experto']
export const DEFAULT_DIFFICULTY: DifficultyLevel = 'normal'

/**
 * Niveles de dificultad: valores que sustituyen a los de AI_PROFILE_NORMAL (lo
 * que no aparece se queda igual). Solo reacción, precisión, agresividad,
 * portero y lectura; nunca velocidad, aceleración ni potencia.
 * - FÁCIL y NORMAL fallan pases (passErrorRad, passLead corto) y leen peor las
 *   líneas (laneRead bajo, interceptReactionS alto: cree que el rival tarda en
 *   reaccionar y pasa por donde se puede cortar). NORMAL es algo más flojo que
 *   la IA anterior a B-04 (AI_PROFILE_NORMAL tal cual).
 * - `rubberBand`: la IA de ese nivel recibe la ayuda arcade al ir perdiendo
 *   (la persona la recibe siempre).
 */
export const DIFFICULTY: Record<DifficultyLevel, { label: string, rubberBand: boolean, profile: Partial<AiProfile> }> = {
  facil: {
    label: 'FÁCIL',
    rubberBand: true,
    profile: {
      reactionMs: 300, shotReactionMs: 650, goalieReactionMs: 370, decisionIntervalMs: 250, supportRefreshMs: 420,
      interceptReactionS: 0.3, passLaneMargin: 1, laneRead: 0.3, passLead: 0.45, passErrorRad: 0.13, shotErrorRad: 0.07,
      stealAttemptChance: 0.12, pressIntensity: 0.78, cutDepth: 0.55, markTightness: 0.55, checkChance: 0.18,
    },
  },
  normal: {
    label: 'NORMAL',
    rubberBand: true,
    profile: {
      reactionMs: 200, shotReactionMs: 490, goalieReactionMs: 290, decisionIntervalMs: 170, supportRefreshMs: 300,
      interceptReactionS: 0.18, passLaneMargin: 4, laneRead: 0.52, passLead: 0.68, passErrorRad: 0.08, shotErrorRad: 0.035,
      stealAttemptChance: 0.25, pressIntensity: 0.93, cutDepth: 0.68, markTightness: 0.75, checkChance: 0.3,
    },
  },
  dificil: {
    label: 'DIFÍCIL',
    rubberBand: false,
    profile: {
      reactionMs: 150, shotReactionMs: 420, goalieReactionMs: 250, decisionIntervalMs: 130, supportRefreshMs: 230,
      interceptReactionS: 0.1, passLaneMargin: 7, laneRead: 0.85, passLead: 0.85, passErrorRad: 0.022, shotErrorRad: 0,
      stealAttemptChance: 0.34, pressIntensity: 1, cutDepth: 0.74, markTightness: 0.85, checkChance: 0.4,
    },
  },
  experto: {
    label: 'EXPERTO',
    rubberBand: false,
    profile: {
      reactionMs: 110, shotReactionMs: 360, goalieReactionMs: 215, decisionIntervalMs: 105, supportRefreshMs: 190,
      interceptReactionS: 0.06, passLaneMargin: 9, laneRead: 1, passLead: 0.9, passErrorRad: 0.01, shotErrorRad: 0,
      stealAttemptChance: 0.42, pressIntensity: 1, cutDepth: 0.78, markTightness: 0.9, checkChance: 0.46,
    },
  },
}

/**
 * Niveles que baja el rival cuando la persona juega en táctil (nivel efectivo =
 * elegido − shift, fraccional: se interpola entre perfiles vecinos). B-05 lo ajusta.
 */
export const DIFFICULTY_TOUCH_SHIFT = 0

/**
 * Ayudas a la persona cuando juega en táctil (pointer: coarse, sin piloto
 * automático); con mando o teclado valen las constantes generales. Los valores
 * por defecto son esos mismos: B-05 los ajusta.
 * - shotBlend: como SHOT_ASSIST_BLEND_HUMAN (1 = puntería exacta de la IA).
 * - passBlend / passLeadS / passConeDot: como PASS_ASSIST_BLEND, PASS_HUMAN_LEAD_S
 *   y PASS_ASSIST_CONE_DOT (cono más ancho = encuentra receptor mirando peor).
 */
export const TOUCH_ASSIST = {
  shotBlend: 0.95,
  passBlend: 0.55,
  passLeadS: 0.25,
  passConeDot: 0.45,
}

/** Los cuatro perfiles completos, precalculados en el orden de DIFFICULTY_LEVELS. */
export const AI_PROFILES_BY_LEVEL: readonly AiProfile[] = DIFFICULTY_LEVELS.map(l => ({ ...AI_PROFILE_NORMAL, ...DIFFICULTY[l].profile }))

/** Perfil activo de cada equipo; lo fija systems/difficulty.ts al crear el partido. */
export const AI_TEAM_PROFILE: Record<'blue' | 'red', AiProfile> = {
  blue: { ...AI_PROFILES_BY_LEVEL[1] },
  red: { ...AI_PROFILES_BY_LEVEL[1] },
}

/** Perfil de IA de un equipo según su nivel de dificultad (sin asignar nada: se llama por paso). */
export function aiProfileFor(team: 'blue' | 'red'): AiProfile {
  return AI_TEAM_PROFILE[team]
}

// ─── Modo arcade ────────────────────────────────────────────────────────────
// Tuning del modo arcade (estilo NBA Jam): turbo, cargas, racha, powerups y cámara.

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
export const ARCADE_CHECK_RANGE = 64 * K
export const ARCADE_CHECK_COOLDOWN_MS = 750
export const ARCADE_CHECK_STUN_MS = 1150
export const ARCADE_CHECK_KNOCKBACK = 420
export const ARCADE_CHECK_LUNGE = 260
export const ARCADE_CHECK_BALL_POWER = 300

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
export const ARCADE_POWERUP_PICKUP_RADIUS = 30 * K
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
/**
 * Con controles táctiles, la acción se encuadra por encima del centro (fracción del
 * alto visible): el joystick y los botones A/B/S ocupan la franja de abajo.
 */
export const ARCADE_CAMERA_TOUCH_BIAS = 0.1

/** Sancionado: velocidad por el pasillo entre la puerta y su asiento (px/s, ~2,4 m/s). */
export const PEN_WALK_SPEED = 2.4 * METER_PX

/**
 * Último lanzamiento (art. 23.6): si la parte acaba con un libre directo o un
 * penalti en juego, el reloj espera a que se resuelva ese tiro y no hay rechace.
 * Se da por resuelto al controlar alguien la bola, al entrar, al quedarse casi
 * parada (px/s) o al pasar el plazo (ms).
 */
export const FINAL_SHOT_DEAD_SPEED = 1.2 * METER_PX
export const FINAL_SHOT_MAX_MS = 3000

/**
 * Calidad de tiro 0–1 de las estadísticas (B-01; solo medida, no cambia el juego): suma
 * ponderada de cercanía a la línea de gol (1 a ≤ distNear px, 0 desde distFar), ángulo respecto
 * al eje de la portería (1 de frente, 0 desde angleMaxDeg), velocidad (0 hasta speedMin px/s,
 * 1 desde speedFast: el tiro normal sale a ~690 y el cargado a ~900) y tiro sin presión (ningún
 * rival de campo con el borde a menos de pressGap px del borde del tirador). `hi` separa tiros
 * buenos y malos. Calibrada con 300 tiros IA contra IA: mitad por encima de `hi`, que acaban
 * en gol ~47 % frente a ~19 % por debajo.
 */
export const SHOT_QUALITY = {
  wDist: 0.45, wAngle: 0.15, wSpeed: 0.25, wFree: 0.15,
  distNear: 120, distFar: 320, angleMaxDeg: 60, speedMin: 600, speedFast: 950,
  pressGap: AI_PRESS_DISTANCE,
  hi: 0.5,
}

/**
 * Persona simulada del humo (B-02, `?lab=match&auto=1&human=touch|pad`; solo laboratorio): mueve
 * al controlado del azul por la entrada de una persona. Tiempos en ms, ángulos en rad.
 * - reactionMs: lo que ve llega al stick con este retardo; los botones salen tras él (+ jitter).
 * - thinkMs: cada cuánto relee la jugada (tiro, pase, cambio, presión).
 * - stickNoiseRad: error del pulgar (uniforme ±), renovado cada noiseHoldMs; stickSmoothMs: giro del stick.
 * - cruise: recorrido del stick sin querer correr (1 = a fondo). shortChance: queriendo correr no
 *   llega a fondo; overshootChance: va a fondo sin querer (en táctil eso esprinta).
 * - aimErrorRad / passErrorRad: error al apuntar a portería o al compañero (donde está, sin anticipar).
 * - tapUnderPressure: toque corto con un rival a menos de AI_CHARGE_PRESSURE_PX; si no, carga
 *   shotHoldMs / passHoldMs (mín., máx.), y el pase solo con passChargeChance.
 * - switchFarPx / switchChance / switchCooldownMs: CAMBIO defendiendo con el controlado lejos de la bola.
 * - pressRangePx: mantiene ROBAR (tiro sin bola) con el portador a menos de esto.
 * - lineUpMs: lo que tarda en apuntar un saque de falta antes de pulsar.
 */
export const HUMAN_SIM = {
  touch: {
    reactionMs: 250, reactionJitterMs: 90, thinkMs: 320,
    stickNoiseRad: 0.25, noiseHoldMs: 260, stickSmoothMs: 110,
    cruise: 0.74, shortChance: 0.3, overshootChance: 0.22,
    aimErrorRad: 0.2, passErrorRad: 0.26,
    tapUnderPressure: 0.85, shotHoldMs: [140, 750], passHoldMs: [140, 450], passChargeChance: 0.2,
    switchFarPx: 240, switchChance: 0.45, switchCooldownMs: 1100, pressRangePx: 120,
    lineUpMs: [350, 900],
  },
  pad: {
    reactionMs: 180, reactionJitterMs: 60, thinkMs: 260,
    stickNoiseRad: 0.1, noiseHoldMs: 300, stickSmoothMs: 70,
    cruise: 0.95, shortChance: 0, overshootChance: 0,
    aimErrorRad: 0.12, passErrorRad: 0.14,
    tapUnderPressure: 0.7, shotHoldMs: [140, 700], passHoldMs: [140, 400], passChargeChance: 0.3,
    switchFarPx: 220, switchChance: 0.65, switchCooldownMs: 900, pressRangePx: 130,
    lineUpMs: [250, 650],
  },
}

/**
 * Contexto del tiro para el portero (B-03; solo medida, no cambia el juego): «tras pase» si el
 * tirador recibió de un compañero hace ≤ passWindowMs (o tira de primeras una bola pasada);
 * contragolpe si su equipo robó hace ≤ counterMs; defensor en la línea si un rival de campo
 * queda entre la bola y el centro de la boca a menos de laneHalfPx de esa recta. Defendiendo, un
 * atacante sin bola está libre si ningún defensor de campo tiene a menos de markPx, y el
 * portador está doblado si tiene dos o más a menos de markPx.
 */
export const SHOT_CONTEXT = {
  passWindowMs: 1000,
  counterMs: 3000,
  laneHalfPx: 2 * PLAYER_RADIUS,
  markPx: 70,
}

/**
 * Cambio con dirección en táctil (B-03): nipplejs da el vector con módulo ≤ 0,5 (a fondo = 0,5),
 * así que el stick táctil se escala por esto antes de compararlo con SWITCH_AIM_MIN; sin escalar,
 * el cambio con dirección no saltaba nunca en móvil y caía siempre en el más cercano a la bola.
 */
export const SWITCH_AIM_TOUCH_SCALE = 2

/**
 * Defensa con un compañero en manos de la persona (B-03; con piloto automático no aplica): la IA
 * no le da plan. Solo cuenta como presionador (y la IA no manda a otro) si es el más cercano al
 * portador, está a menos de DEF_HUMAN_PRESS_PX y por el lado de nuestra portería (como mucho
 * DEF_HUMAN_GOALSIDE_TOL px por detrás de él). Persiguiéndolo por detrás o de lejos no tapa ni la
 * conducción ni el tiro: medido en el humo, así el rival tiraba más tras pase y sin presión.
 */
export const DEF_HUMAN_PRESS_PX = 60
export const DEF_HUMAN_GOALSIDE_TOL = 10

/**
 * Ayudas táctiles de juego (B-06), además de TOUCH_ASSIST: solo con la persona en táctil
 * (touchAssist.team); con mando, teclado o IA contra IA no cambian nada. Valor neutro = como antes.
 * - goalieStickScale: el portero en manos de la persona acelera con min(1, |stick| · esto); nipplejs
 *   llega a fondo con 0,5, así que con 1 iba a media aceleración (neutro 1).
 * - goalieAutoSelect: false = en táctil el cambio sin dirección y la cesión tras sacar el portero no
 *   pasan nunca a él por GOALIE_SELECT_RANGE; solo el CAMBIO que le apunta (neutro true).
 * - goalieAiShotSpeed: con el portero en manos de la persona y un tiro rival en camino (bola suelta
 *   hacia su portería a ≥ esto px/s), lo mueve la IA hasta que la bola se pare o la coja alguien
 *   (neutro Infinity = nunca).
 * - goalieAiWithoutBall: true = el portero en manos de la persona lo coloca siempre la IA mientras
 *   no tenga la bola (rechaces y barullos en el área incluidos); ella solo saca. En el partido real
 *   en móvil, 3 goles y 0 paradas en 9,6 s con el portero en la mano (neutro false).
 * - shotAimPost: el tiro asistido apunta hacia el palo del lado que el portero deja más abierto,
 *   esta fracción del camino entre el punto de siempre y el palo (0 = como antes, 1 = al palo).
 * - checkOnCarrier: multiplica la probabilidad de que la IA rival cargue (arcade) al portador en
 *   manos de la persona; las cargas eran la mitad de sus pérdidas de bola (neutro 1).
 * - mateSteal: los compañeros de campo de la persona no entraban nunca a robar (solo ella); con
 *   esto > 0 lo prueban como la IA rival, con esta probabilidad extra por paso (neutro 0).
 * - humanNearCoverPx: si la persona está a menos de DEF_HUMAN_PRESS_PX del portador pero no cuenta
 *   como presionador (por detrás), el presionador IA le tapa la portería a esta distancia en vez de
 *   a pressDistance, fuera de SHOT_CONTEXT.markPx: sin doblar y sin dejar un hombre libre. En el
 *   partido real el azul doblaba el 24,8 % del tiempo frente al 6,5 % del rojo (neutro 0).
 */
export const TOUCH_ASSIST_EXTRA = {
  goalieStickScale: 2,
  goalieAutoSelect: false,
  goalieAiShotSpeed: 260,
  goalieAiWithoutBall: true,
  shotAimPost: 0.9,
  checkOnCarrier: 0.5,
  mateSteal: 0.5,
  humanNearCoverPx: 95,
}

/**
 * Quejas del partido real en móvil (B-07). Valen para todos los controles y los dos equipos.
 * - CARRY_OWN_GOAL.block: la bola conducida no cruza la línea de la propia portería por la boca;
 *   se queda en la línea delante del portador. Girando hacia su portería tras robar, la persona se
 *   la metía sola (5 de 5 «autogoles conduciendo» del humo eran del azul). Los autogoles por
 *   rebote o desvío siguen valiendo (neutro false).
 * - SWITCH_DEFEND: en el cambio por cercanía a la bola defendiendo (bola del rival, o suelta en
 *   campo propio), al jugador que está detrás de la bola respecto a nuestra portería se le suman
 *   behindPx px a su distancia, a pleno desde rampPx px por detrás (proporcional antes), para que
 *   salga el que puede encarar al portador y no el que lo persigue (neutro behindPx 0).
 */
export const CARRY_OWN_GOAL = { block: true }
export const SWITCH_DEFEND = { behindPx: 120, rampPx: 60 }

/**
 * B-08 · tiro asistido de la persona en táctil al palo abierto (TOUCH_ASSIST_EXTRA.shotAimPost).
 * Solo es gol con el centro de la bola a menos de GOAL_HALF_H − BALL_RADIUS del centro, que es
 * justo donde empieza la franja de choque con el palo: apuntando ahí, la mitad de los tiros
 * cercanos daba en el palo y salía fuera. postMarginPx mete el punto de mira esos px hacia
 * dentro (neutro 0).
 */
export const TOUCH_SHOT_AIM = { postMarginPx: 9 }
