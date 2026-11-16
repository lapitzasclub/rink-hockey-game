# Reglamento: verificación de medidas (WP-02)

Resuelve las celdas VERIFICAR de SPEC §1 y §9 con fuente primaria y compara el juego (`src/game/constants.ts`) con el reglamento. Solo documentación: no se ha tocado código.

## 1. Fuentes

| Id | Título | Edición | URL | Lectura |
|---|---|---|---|---|
| **[REG-WS]** | World Skate, *Rink Hockey Rulebook 2027* (RHTC Rules of the Game, Technical Regulations, Referee Rules), marcado "UPDATE: June 2026" | 2027 | https://www.worldskate.org/rink-hockey/about/regulations.html?download=8906:rink-hockey-rulebook-2027 | **Fuente oficial principal** (web de World Skate, descargado y leído). Su texto es **idéntico** al del espejo [REG-27] (comparado extremo a extremo) |
| [REG] | Misma obra, edición **2026** (la numeración de artículos de este documento es la de esta edición y de la 2027) | 2026 | https://hoqueipt.com/media/docs/rulebook-2026-en.pdf | **Espejo de la federación portuguesa, no oficial de World Skate.** En worldskate.org solo he encontrado de 2026 las *Clarifications* (https://www.worldskate.org/rink-hockey/about/regulations.html?download=8268:clarifications-rink-hockey-rulebook) y no el reglamento completo. Todos los valores citados coinciden entre 2026 y 2027 |
| [REG-27] | Misma obra, edición 2027 (espejo) | 2027 | https://hoqueipt.com/media/docs/rulebook-2027-en.pdf | Mismo texto que [REG-WS] |
| [REG-19] | World Skate América: *Rink Hockey Reglas de Juego · Reglamento Técnico* (ES) | 2019 | https://worldskateamerica.org/archivos/hockey-sp/reglamento/RINK_HOCKEY_REGLAS_DE%20JUEGO_REGLAMENTO_TECNICO_2019.pdf | Leído. Contraste en español. Confirma portería, líneas, 1,50 m y zapatillas |

**RFEP/FEP:** `fep.es` publica el mismo reglamento de World Skate (`WS RHTC REGLAMENTO 2023.pdf`, bajo `fep.es/admin/reglaments/pdfs/`), pero su servidor devuelve HTML en lugar del PDF a clientes automáticos, así que **no he podido leerlo**. La RFEP aplica el reglamento de World Skate sin cambiar la geometría de pista y portería, y las ediciones World Skate leídas coinciden entre sí. Para esas medidas no hay fuente RFEP leída; es un riesgo bajo.

Donde dice [REG] en las tablas, el valor está también en [REG-WS]. Los "artículos" se citan como `REG TR a.N` (Technical Regulations) o `REG RJ a.N` (Rules of the Game) o `REG AR a.N` (Referee Rules). Los diagramas de la portería son imágenes del PDF y no se han podido extraer como texto.

## 2. Tabla VERIFICAR (SPEC §1 y §9)

| Campo | Valor en SPEC antes | Valor oficial | Artículo | URL |
|---|---|---|---|---|
| Dimensiones de la pista (WP-65) | 36 × 18 m por defecto (D11); `?rinkm=34..44` en DEV | Rectángulo con proporción **2:1**; mínimo **34 × 17 m**, máximo **44 × 22 m**. 40 × 20 m obligatorio en selecciones internacionales. Las marcas (área, punto de penalti 5,40 m, libre directo 7,40 m, semicírculo r 0,85 m, círculo central r 3 m, línea de gol a 2,70–3,30 m del fondo) y la portería 1,70 × 1,05 m son **fijas en metros**, no dependen del tamaño de pista | REG TR a.1 ap. 3 y 8 | [REG] |
| Radio de esquina | 1–3 m, VERIFICAR | 1–3 m en general; **3 m obligatorio** en selecciones internacionales (pista 40 × 20) | REG TR a.1 ap. 4 y 8 | [REG] |
| Valla perimetral, altura | 1,00 m, VERIFICAR | **1 m**, cerrada. Además redes de protección sobre la valla, **4 m** desde el suelo | REG TR a.1 ap. 4 y 6 | [REG] |
| Rodapié de la valla | ~0,20 m, VERIFICAR | **20 cm** de alto y **2 cm** de grosor, color neutro distinto de la bola | REG TR a.1 ap. 5a | [REG] |
| Portería, boca interior | 1,70 × 1,05 m, VERIFICAR | **170 cm ancho × 105 cm alto, medidas interiores** | REG TR a.3 ap. 2a.4 | [REG], [REG-19] |
| Portería, fondo | ~0,92 m abajo, VERIFICAR | Ver §4: arco inferior de **radio 64 cm** desde el centro de la línea de gol (≈ 0,64 m, no 0,92). Red colgante interior a 40 cm de la línea de gol | REG TR a.3 ap. 2b, 2c, 4 | [REG] |
| Portería, color y tubo | naranja flúor, tubo ~7,6 cm, VERIFICAR | Estructura frontal **naranja fluorescente fuerte** (hierro galvanizado, tubo circular Ø exterior **7,5 cm**). Estructura trasera **blanca**. Red **blanca**, malla 2,5 × 2,5 cm | REG TR a.3 ap. 2 y 3 | [REG] |
| Línea de gol, distancia a la valla de fondo | VERIFICAR | **2,70 a 3,30 m** (longitud de la línea de gol: 1,70 m) | REG TR a.2 ap. 4 | [REG] |
| Punto de penalti | 5,4 m, VERIFICAR | **5,40 m** del centro de la línea de gol; círculo Ø 10 cm | REG TR a.2 ap. 6; REG RJ a.30 | [REG] |
| Punto de libre directo | 7,4 m, VERIFICAR | **7,40 m** del centro de la línea de gol; círculo Ø 10 cm | REG TR a.2 ap. 7; REG RJ a.28 | [REG] |
| Semicírculo de protección del portero | r ≈ 1,5 m, VERIFICAR | **Semicírculo de poste a poste** en la línea de gol: radio = 0,85 m (la línea mide 1,70 m). **No** son 1,5 m | REG TR a.2 ap. 5 | [REG] |
| Líneas de antijuego | VERIFICAR | **Sin fuente: no existen marcas de antijuego.** El antijuego es una regla de tiempo (posesión de 45 s en zona defensiva), no una línea de pista. Marcas oficiales: perímetro del área, línea de gol, zona del portero, punto de penalti, puntos de libre directo, línea de mitad de pista, círculo central y punto central. Líneas de 8 cm de ancho | REG TR a.2; REG RJ a.10 | [REG] |
| Círculo central | VERIFICAR | **Radio 3 m**, con punto central Ø 10 cm | REG TR a.2 ap. 9 y 10 | [REG] |
| Bola | Ø 7,3 cm, 155 g, VERIFICAR | **Ø 72 mm, 150 g ± 5 g**, negra o amarilla (según contraste con la pista). Corcho interior | REG TR a.4 | [REG] |
| Stick | ≤ 1,15 m, ≤ 500 g, VERIFICAR | Longitud total (A) **≤ 115 cm**; mango (B) ≤ 105 cm; pala curva (C) 17–22 cm; B + C ≤ 124 cm. Peso **≤ 500 g** (tolerancia 50 g, tope 550 g). Debe tener mango y **pala curva**; anillo de 5 cm de paso | REG TR a.8 ap. 6 | [REG] |
| Árbitros a pie o patinando (§9) | "A pie con zapatillas, VERIFICAR" | **Sí, a pie: "pantalón, medias y zapatillas con suela de goma"**. (1 o 2 árbitros principales en pista) | REG AR a.6 ap. 1b; REG RJ a.1 ap. 4 | [REG], [REG-19] |

### Comprobaciones adicionales pedidas

| Tema | Resultado | Artículo |
|---|---|---|
| **Árbitros** | A pie, con zapatillas de suela de goma. **1 o 2 árbitros principales** en pista. Un **árbitro auxiliar** en la mesa lleva el control de tiempo y disciplina de banquillos. Material: silbato, **3 tarjetas** (amarilla, azul, roja), bolígrafo y hoja. Camiseta que no se confunda con la de ningún equipo | REG RJ a.1 ap. 4; REG AR a.6 |
| **Stick alto y altura de la bola** | La **bola no puede levantarse ni jugarse a más de 1,50 m** (falta técnica; solo el portero en su área puede). Si sube a más de 1,50 m de forma accidental (rebote en poste o portería) se detiene el juego. Para el stick: falta técnica **levantarlo por encima de los hombros cuando pone en peligro** a un rival o a un compañero. No hay una "altura máxima del stick" en metros; el límite numérico es el de la bola | REG RJ a.6 ap. 3; REG RJ a.15 ap. d y m |
| **Color de la portería y la red** | Frente (postes + larguero) **naranja fluorescente fuerte**; estructura trasera inferior y superior **blanca**; **red blanca** | REG TR a.3 ap. 2 y 3 |
| **Mesa oficial** | Fuera de la pista, en **posición central y junto a la valla**, en un espacio aislado del público. Puestos: cronometrador (marcador), comisario, secretario, árbitro auxiliar y árbitro asistente (posesión). En competición internacional, **5 sillas**, portátil, 2 carteles manuales de faltas de equipo, 2 torres de aviso y 2 relojes de posesión | REG RJ a.1 ap. 4; REG TR a.6 |
| **Banquillos** | Cada equipo ocupa el banquillo **delante de su zona defensiva** (cambian de lado en el descanso). Hasta 12 integrantes: 5 suplentes (≥ 1 portero) y 7 representantes. **Solo uno de los representantes del banquillo, entrenador incluido, puede estar de pie; el resto sentados** (edición 2026; en 2019 eran 3). Protección trasera y divisorias laterales en cada banquillo | REG RJ a.2 ap. 9; REG-19 a.9 |
| **Puertas** | **Dos puertas** en la valla (no abren hacia la pista): una junto a los banquillos de cada equipo y otra junto a la mesa | REG TR a.1 ap. 7 |
| **Sancionados** | El jugador con **tarjeta azul** permanece sentado, sin poder salir, **fuera de la pista**: en el banquillo de su equipo (2026) o en sillas **entre el banquillo y la mesa** (2019, a.9 ap. 5.1). Inferioridad de **2 min** por tarjeta azul y **4 min** por roja (REG RJ a.31) | REG RJ a.24 ap. 1e; REG-19 a.9 ap. 5.1 |

## 3. Tabla de discrepancias juego ↔ reglamento

Valores del juego: `src/game/constants.ts`. 1 m = 28,5 px en X y 30 px en Y.

| Qué | Juego | Reglamento | Impacto | Propuesta |
|---|---|---|---|---|
| Boca de la portería | `GOAL_HALF_H = 57` → apertura **114 px (≈ 3,8 m)**; `GOAL_HEIGHT = 150` (marco exterior ≈ 5 m) | Interior **1,70 m = 51 px** en Y (semialtura 25,5 px) | **Gameplay + visual.** El juego tiene la portería unas 2,2 veces más ancha | **D2 ya la resuelve** (portería real). Aplicar en el WP de física de portería (ver §4 para cifras). No se toca aquí |
| Altura de la boca | No existe (solo 2D) | 1,05 m = ~30 px (z) | Visual (WP-40 y WP-44) | Usar 30 px (28,5 × 1,05) en z |
| Fondo de la portería | `GOAL_BACK_DEPTH = 34` px (≈ 1,2 m) | ≈ **0,64 m** de arco inferior (18 px en X) y red colgante a 0,40 m | Gameplay (rebote al fondo) y visual | **D8** (ver más abajo): ajustar a ≈ 18–20 px junto con D2 |
| Radio del semicírculo del portero | `GOALIE_ZONE_RADIUS = 26` (0,85 m) | 0,85 m (de poste a poste) | Ninguno en el dibujo. **Aviso:** la zona de falta de invasión se comprueba con `GOAL_HEIGHT` (150 px ≈ 5 m) en `MatchScene` | Con la portería real conviene alinear esa comprobación al radio 26. Incluir en D8 |
| Línea de gol | `GOAL_LINE_OFFSET = 86` px (3,0 m) | 2,70–3,30 m | Ninguno | Mantener |
| Área de penalti | 154 × 270 px (5,40 × 9 m) | 5,40 × 9 m | Ninguno | Mantener |
| Punto de libre directo | `DIRECT_FREE_HIT_SPOT_OFFSET = 160` px (≈ 5,6 m) | **7,40 m = 211 px** | **Gameplay** (sitio de ejecución) | **D9**: pasar a 211 px (7,40 m) |
| Punto de penalti | No hay constante propia (5,40 m = borde del área) | 5,40 m = 154 px | Visual al dibujarlo | Dibujar en 154 px; coincide con el borde del área, tal como manda el reglamento |
| Línea azul | `BLUE_LINE_OFFSET = 210` px; `drawRink.ts` la dibuja | **No existe línea azul** en rink hockey. Solo la línea de mitad y el círculo central | Visual (resto de hockey sobre hielo) | **D10**: retirar las líneas azules y dejar la de mitad de pista. En el WP del suelo de pista |
| Valla, altura | 14 px (≈ 0,5 m) | 1,00 m = 28,5 px (z) | Visual | Subir a 28,5 px en la cámara única (WP-10 y WP-40) |
| Esquinas | ≈ 86 px (≈ 3 m) | 1–3 m, 3 m en internacional | Ninguno | Mantener |
| Bola | `BALL_RADIUS = 6` (Ø 12 px = 0,42 m) | Ø 72 mm | Visual: mayor que la real (×6 en la física, ×4 en lo dibujado) | Ya contemplado en SPEC §1 (exageración). No cambiar |
| Tarjeta azul | `BLUE_CARD_DURATION_MS = 120_000` | 2 min | Ninguno | OK |
| Duración | `MATCH_DURATION = 120`, `PERIOD_COUNT = 4` | 2 × 25 min (senior) | Es una abstracción arcade | Sin cambio |
| Árbitros | No existen | A pie, zapatillas | Visual (WP-50) | Sin cambio: ya es A pie en SPEC §9 |

### Decisiones nuevas propuestas (no aplicadas)

- **D8 · Fondo y zona de portero acordes a la portería real.** `GOAL_BACK_DEPTH` 34 → ~18 px, y la zona de falta de `MatchScene` al radio del semicírculo (26 px) en lugar de `GOAL_HEIGHT`. Afecta al gameplay: requiere decisión del usuario.
- **D9 · Punto de libre directo a 7,40 m.** `DIRECT_FREE_HIT_SPOT_OFFSET` 160 → 211 px.
- **D10 · Retirar la línea azul** (`BLUE_LINE_OFFSET`, `drawRink.ts`): no existe en rink hockey. Si el usuario quiere conservar la referencia visual, se dibuja como marca decorativa. Requiere decisión.

## 4. Portería real (D2): cifras para WP-40 y WP-44

**Cifra oficial, sin discrepancia con D2:** interior **1,70 m de ancho × 1,05 m de alto**. Confirmada en [REG] TR a.3 ap. 2a.4 y en [REG-19].

| Parte | Valor oficial |
|---|---|
| Medida 1,70 × 1,05 | **Interior** (entre caras internas de los tubos) |
| Postes y larguero | Tubo **circular** de hierro galvanizado, Ø exterior **7,5 cm** (por tanto el marco exterior mide ≈ 1,85 × 1,12 m) |
| Esquinas superiores | **Cortadas a 45°** respecto a vertical y horizontal (esquinas biseladas, no redondeadas) |
| Color frente | **Naranja fluorescente fuerte** |
| Arco inferior trasero | Tubo circular Ø **5 cm**, semicircular, radio **64 cm** desde el centro de la línea de gol, **blanco**, con una barra horizontal de 12 cm a 25 cm de la línea de gol e inclinada 20° |
| Estructura trasera superior | Rectángulo + semiarco de hierro macizo Ø **1,5 cm**, **blanca**: dos barras de 40 cm soldadas sobre los postes y una barra de 65 cm perpendicular al centro del larguero |
| Red | **Blanca**, malla 2,5 × 2,5 cm, envuelve lados, fondo y techo. Otra red blanca colgante dentro, a 40 cm de la línea de gol, de 110 × 180 cm |
| Posición | Centrada en la línea de gol |

Detalle sin resolver: los diagramas del PDF son imágenes, y el texto no deja claro cuánto sobresale hacia atrás el rectángulo superior (barras de 40 cm frente al eje de 65 cm). Para el dibujo, tomar **fondo superior ≈ 0,65 m** y **fondo inferior ≈ 0,64 m**. Es una estimación, no una cifra de artículo.

Nota sobre el texto de SPEC antes: el fondo de "~0,92 m abajo" **no coincide** con el reglamento (0,64 m). Se corrige en SPEC §1.

## 5. Citas

Texto literal en inglés de **[REG-WS]** (Rulebook 2027, "UPDATE: June 2026"; idéntico a [REG] 2026). Las erratas del original se conservan.

**a) Zona de protección del portero: radio 0,85 m (derivado, no literal)** · Technical Regulations, Art. 2 (Rink markings), points 4 y 5:

> 4. Goal line. It is located between the two posts of each goal. It is 1.70 metres long, at a distance from the back barrier of between 2.70 metres and of 3.30 metres.
> 5. Goalkeeper protection zone. It is a semicircle located in the middle of the goal line and goes from post to post.

El reglamento **no escribe "0,85 m"**: lo da la geometría (semicírculo de poste a poste sobre una línea de 1,70 m, radio 1,70 / 2 = 0,85 m). **Corrección respecto a SPEC antes:** no existe ninguna zona semicircular de 1,5 m. Los otros círculos del reglamento son el central (radio 3 m, Art. 2 point 9) y los puntos de Ø 10 cm. Los 1,50 m que aparecen en el texto son la altura máxima de la bola (Rules of the Game, Art. 6 point 3), no un radio. Nota: el punto 3 del mismo artículo escribe "5.40 centimetres" (errata por metres).

**b) Bola: Ø 72 mm, 150 g ± 5 g** · Technical Regulations, Art. 4 (The game ball), point 1:

> 1. In all games of official rink hockey competitions, only balls that have the WORLD SKATE homologation certificate can be used, in accordance with the following characteristics: a. It is made of pressed rubber / plastic, and its inner filling will be cork. b. It should weigh 150 g with a variance of ± 5 g. c. It will have a dimension of 72 millimetres in diameter and will be perfectly spherical. d. The ball must be black or yellow (it will be set according to the contrast of the rink with the ball).

Corregido frente a los valores habituales: **Ø 72 mm (circunferencia ≈ 22,6 cm) y 150 g (145–155 g)**, no 155 g. SPEC ya usa 72 mm / 150 g ± 5 g.

**c) Arco trasero r = 64 cm y red colgante a 40 cm** · Technical Regulations, Art. 3 (Goalposts), points 2.b.1 y 4.a:

> b. The lower rear structure is painted in white, with a semicircular arch and inside it, a horizontal bar whose construction rules are as follows: 1) The circular tube that forms the semicircular arch welded externally to the front structure has an outer diameter of 5 centimetres, being built with a radius of 64 centimetres, based on the centre of the goal lines.
> 4. Another white net, whose mesh also has the dimension of 2.50 x 2.50 centimetres, is suspended inside each of the goals [...] a. This net is fixed at the top of the goal so that it hangs freely to the ground, standing parallel and 40 centimetres away from the goal line. b. It has a height of 110 centimetres and a width of 180 centimetres.

Confirmadas. Y para D2 (point 2.a.4): "In its interior measurements, each goal has a height of 105 centimetres and a width of 170 centimetres."

**d) Libre directo a 7,40 m (base de D9)** · Technical Regulations, Art. 2 (Rink markings), point 7:

> 7. Direct free launch points. It is a circle with a diameter of 10 centimetres, marked at the distance of 7.40 metres from the centre of the goal line.

Confirmada. Coherente con Rules of the Game, Art. 28 (Direct free hit).

**e) Sin líneas azules ni de antijuego (base de D10)** · Technical Regulations, Art. 2 (Rink markings), points 1 y 2, y points 3 a 10:

> 2. The markings of the rink shall be as indicated in the drawing in point 1. [...] b. In international competitions in which the national teams of the member countries of WORLD SKATE participate, the playing rink can only contain the specific markings of rink hockey.

El artículo enumera solo estas marcas: penalty area (point 3), goal line (4), goalkeeper protection zone (5), penalty point (6), direct free launch points (7), dividing line of each half (8), centre circle (9) y point for the start and restart (10). **No aparece ninguna línea azul ni línea de antijuego**; la búsqueda de "blue line" en el texto completo da 0 resultados. Confirmada. El único "anti-play" es una regla de tiempo (Rules of the Game, Art. 10 *Passive and anti-play*), no una marca.
