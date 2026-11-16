# SPEC gráfica — biblia de arte del juego

Fuente de verdad para todos los WP gráficos. Los encargos citan secciones (`SPEC §n`); los agentes leen solo esas.

Marcas:

- **VERIFICAR**: dato a confirmar contra el reglamento World Skate vigente (WP-02). Mientras tanto, se usa el valor indicado.
- **D#**: depende de una decisión del usuario (BACKLOG §Decisiones).

---

## §1 Escala y medidas

**Mundo:** `RINK = {x:70, y:60, width:1140, height:600}` representa 40 × 20 m.

| Eje | px/m | Uso |
|---|---|---|
| X (largo) | 28,5 | posiciones |
| Y (ancho) | 30 | posiciones (anisotropía del 5 %, heredada; no corregir) |
| Z (alto) | **28,5** (`PX_PER_M`) | toda altura |

**Constantes visuales:** viven en `src/game/render/artSpec.ts` (lo crea el WP-10): dimensiones, exageraciones y bandas de profundidad. Las de gameplay siguen en `constants.ts`.

**Exageraciones deliberadas** (por legibilidad; uniformes, nunca por objeto suelto):

| Objeto | Real | En juego | Por qué |
|---|---|---|---|
| Figuras humanas (jugadores, porteros, árbitros, entrenadores, suplentes, público) | 1 | `FIGURE_EXAG = 1.15` | Leer pose y dorsal a 1280 px. Se ajusta solo en el Gate A |
| Bola | 7,3 cm | 8–10 px de diámetro a `s=1` (≈ ×4) | Si no, mediría 2 px |
| Stick | 1,15 m | 1,15 m × `FIGURE_EXAG` ≈ 38 px | Coincide con el alcance físico `getStickTip` = 38 |

**Medidas reales:**

| Elemento | Medida real | px | Estado | Juego actual |
|---|---|---|---|---|
| Pista | 40 × 20 m (rango 34–44 × 17–22, proporción 2:1) | 1140 × 600 | OK | igual |
| Radio de esquina | 1–3 m (3 m en internacional) | — | [REG TR a.1] | 86 px ≈ 3 m |
| Valla perimetral, altura | 1,00 m (más redes de 4 m desde el suelo) | 28,5 (z) | [REG TR a.1] | 14 px (≈ 0,5 m) |
| Valla, rodapié (banda inferior de rebote) | 0,20 m alto, 2 cm grueso | ~6 (z) | [REG TR a.1] | — |
| Portería, boca interior | 1,70 m ancho × 1,05 m alto, medidas **interiores** | 51 (y) × 30 (z) | [REG TR a.3] | 114 px de boca (≈ 3,8 m). **D2** |
| Portería, fondo | ≈ 0,64 m abajo (arco r 64 cm), ≈ 0,65 m arriba; red colgante a 0,40 m | ~18 (x) | [REG TR a.3] (diagrama sin texto; ver REGLAMENTO-MEDIDAS.md §4) | `GOAL_BACK_DEPTH` 34 |
| Portería, color | frente naranja fluorescente, tubo Ø 7,5 cm; fondo y red blancos | ~2–3 px | [REG TR a.3] | rojo |
| Línea de gol, distancia a la valla de fondo | 2,70–3,30 m | 77–94 (x) | [REG TR a.2] | `GOAL_LINE_OFFSET` 86 px ≈ 3 m |
| Área de penalti | 9 × 5,4 m | 270 (y) × 154 (x) | OK | igual |
| Punto de penalti | a 5,40 m de la línea de gol, Ø 10 cm | 154 | [REG TR a.2] | — |
| Punto de libre directo | a 7,40 m de la línea de gol, Ø 10 cm | 211 | [REG TR a.2] | — |
| Semicírculo de protección del portero | de poste a poste, r = 0,85 m (derivado de la línea de 1,70 m; no hay zona de 1,5 m) | ~26 | [REG TR a.2] | `GOALIE_ZONE_RADIUS` 26 |
| Líneas de antijuego | no existen; el antijuego es de tiempo (45 s), no de líneas | — | sin fuente (ver REGLAMENTO-MEDIDAS.md) | — |
| Círculo central | r = 3 m, punto central Ø 10 cm | ~85 (x) × 90 (y) | [REG TR a.2] | — |
| Bola | Ø 72 mm, 150 g ± 5 g, negra o amarilla | ver exageración | [REG TR a.4] | `BALL_RADIUS` 6 (física) |
| Stick | ≤ 1,15 m, pala curva, ≤ 500 g (tolerancia 50 g) | 38 | [REG TR a.8] | barra recta de 46 px |
| Jugador | 1,75–1,85 m de pie; ~1,50 m en postura de patinaje | ~50 px a `s=1` con exageración | — | ~61 px (≈ 2,15 m) |
| Árbitro | 1,80 m de pie | ~59 px | — | no existe |

**Regla:** los cambios de geometría física (boca de portería, distancias de líneas) son **gameplay**. WP-02 solo informa, y cambiarlos requiere decisión del usuario. Lo visual siempre se alinea con la física que haya.

---

## §2 Contrato de cámara (WP-10)

Una sola cámara de perspectiva (estenopeica) para **todo** lo dibujado en el mundo: pista, vallas, porterías, jugadores, bola, banquillos, mesa, oficiales y gradas. Se acabaron los lugares en espacio de pantalla y las escalas propias por módulo.

API en `src/game/render/viewTransform.ts`:

```ts
export interface Projected { x: number; y: number; s: number }   // s = escala de figura en ese punto del suelo
/** Proyecta un punto del mundo (px de mundo; wz = altura en px, PX_PER_M por metro). Sin asignaciones si se pasa out. */
export function project(wx: number, wy: number, wz?: number, out?: Projected): Projected
/** Compatibilidad: project(wx, wy, 0) sin s. Se mantiene la firma actual. */
export function worldToScreen(wx: number, wy: number): { x: number; y: number }
/** Escala de figura a nivel del suelo en (wx, wy). s = 1 en el centro de la pista. */
export function depthScale(wx: number, wy: number): number
```

Requisitos:

1. **Encuadre conservado:** la pista ocupa la misma caja de pantalla (±5 %) que hoy: valla lejana en y≈130, cercana en y≈620, anchura lejana ≈0,82 de la cercana. Así no se rompen el HUD, `cameraDirector` ni los toques.
2. **Coherencia vertical:** un segmento vertical de altura `h`, dibujado con `project(x,y,0)` → `project(x,y,h)`, mide lo mismo (±5 %) que una figura de altura `h` dibujada con `setScale(base · s)` en ese punto. El `?lab=scale` lo hace visible con reglas de 1 m.
3. **Sin aplanado detrás de la valla lejana:** `worldToScreenExt` desaparece. Gradas, banquillos y mesa usan la misma cámara con `wy` fuera de la pista y `wz` > 0.
4. **Sin hacks:** desaparecen la curva `Y_POW` (la compresión sale sola de 1/z), `VIEW_Y_SCALE` como escala de figuras, el `depthScale` propio de `arena.ts`, `SEAT_Y`/`XS` de `benchPlayers.ts` y la zona de sancionados en píxeles de pantalla (`PEN_BASE_X`, `PEN_Y`).
5. **Física intacta:** la simulación sigue en coordenadas de mundo 2D. `screenToWorld` no se usa hoy; se puede dejar como inversa del plano del suelo o eliminar.
6. **Rendimiento:** `project` se llama cientos de veces por frame. No debe asignar memoria con `out`, ni usar trigonometría por llamada (precalcular la cámara).

**Anclaje de figuras:** origen en los pies (`setOrigin(0.5, 1)` en el contenedor o equivalente), posición `project(x, y, 0)`, escala `base · s · FIGURE_EXAG`. La sombra va en el suelo, con el mismo punto.

---

## §3 Capas de profundidad y valla cercana

Bandas en `artSpec.ts` (`DEPTH.*`). La profundidad dentro de cada banda va por la y de pantalla de la base.

| Banda | depth | Contenido |
|---|---|---|
| `BACKDROP` | −100 | fondo del pabellón, techo, focos |
| `STANDS_FAR` | −90…−60 | gradas lejanas y laterales (por y) |
| `OFFCOURT_FAR` | −50…−30 | banquillos, mesa, sancionados, entrenadores (detrás de la valla lejana) |
| `BOARD_FAR` | −20 | cara interior de la valla lejana + publicidad |
| `FLOOR` | −10 | suelo, líneas, marcas de ruedas |
| `COURT` | 0…19 | porterías (partes traseras y delanteras por separado), jugadores, árbitros, bola: todo por y de los pies |
| `BOARD_NEAR` | 20 | valla cercana (ver corte) |
| `STANDS_NEAR` | 21…25 | primeras filas cercanas (si se ven) |
| `FX` | 26…40 | partículas y destellos de gol |
| `UI` | ≥ 41 | solo en la cámara de UI |

**Portería:** se parte en *trasera* (red de fondo, techo, tubos traseros: depth de la línea de fondo) y *delantera* (tubos de la boca: depth de la línea de gol). Así un jugador puede estar dentro o detrás.

**Corte de la valla cercana:** la valla cercana nunca tapa jugadores ni bola. Se dibuja solo su borde superior más un rodapié bajo, o semitransparente (alpha ≈ 0,35) en un radio alrededor de la bola y de los jugadores próximos. Lo elige WP-41 con capturas.
Elegida en WP-41: variante `edge` (`NEAR_CUT` en artSpec.ts): rodapié opaco, franja de publicidad baja (z 0,2–0,52 m), cristal al 10 % y embellecedor opaco arriba. La bola se ve a color pleno; `ghost` (cara entera al 35 %) queda desactivada.

---

## §4 Estilo: A, cartoon limpio (D1, Gate B ✅ 2026-11-16)

Reglas comunes a cualquier estilo:

- **Todo procedural** (`Graphics.generateTexture` / RenderTexture). Sin assets IA salvo decisión expresa del usuario: el pipeline de sprites IA se abandonó.
- **Silueta legible** a 50 px de alto. Contorno oscuro (`OUTLINE 0x08111b`) de 1,5–2 px a `s=1`.
- **Luz cenital** del pabellón, sombreado de 2 tonos como mucho (luz y sombra) más contorno. Sombra de contacto: elipse oscura con núcleo más denso bajo los patines.
- **Equipos:**
  - Azul (`0x3399ff`) y rojo (`0xff3333`) como color principal.
  - Segundo color de equipo para pantalón y medias.
  - Dorsal blanco o negro según contraste.
- **Oficiales** en negro o gris oscuro con detalle amarillo flúor. **Nunca** azul ni rojo.

Prototipos del WP-20 (se dibujan los tres en `?lab=style`: jugador de campo de frente, de lado y de espalda, portero y árbitro):

| | A. Cartoon limpio | B. Pixel-art HD | C. Semirrealista TV |
|---|---|---|---|
| Proporción | 1 : 4,5 cabezas | 1 : 5 | 1 : 6,5 |
| Sombreado | plano + 1 sombra | paleta limitada, render a baja resolución ×3, filtro nearest | degradado suave |
| Encaje con el modo arcade (cabezones) | natural | bueno | regular |
| Coste de animar por rig | bajo | medio (hay que cuidar la rejilla de píxel) | alto |
| Elegido en el Gate B | **sí** | — | — |

Referencia del estilo elegido: `?lab=style` (fila A y recuadro A ×3). El esqueleto 3D con IK de brazos (`src/scenes/lab/style/rig.ts`), las piezas (`parts.ts`) y el pintor vectorial (`paintVector.ts`) del prototipo son el punto de partida de WP-30. `paintPixel.ts` (B) se puede borrar en WP-30. D4: casco ligero sin rejilla en el color del equipo; sin casco, solo como variante opcional.

---

## §5 Equipamiento real

**Jugador de campo:**

- Camiseta de manga corta o larga, pantalón corto, medias largas.
- Espinilleras bajo las medias, rodilleras visibles.
- **Guantes acolchados** (las manos agarran el stick: no son puntos sueltos).
- **Sin rejilla facial.** Hoy el casco lleva rejilla de hockey hielo y está mal. Casco ligero o sin casco según **D4**.
- **Patines quad:**
  - bota alta de cuero (por encima del tobillo), placa con 2 ejes y 4 ruedas en 2 × 2;
  - **tope/freno frontal** bajo la puntera;
  - ruedas visibles de lado y de 3/4.
  - Hoy son una barra blanca: mal.

**Portero:**

- Casco con rejilla integral.
- Peto voluminoso, coquilla, manopla (mano libre) y guante de stick.
- **Grandes protecciones de pierna** (≈ desde la rodilla al patín, muy anchas).
- Patines quad. Stick del mismo reglamento.
- Visualmente es un bloque ancho, no un jugador con pinta de jugador.

**Dorsal:**

- Número a la espalda (grande) y en el pecho o pantalón (pequeño).
- Visible en las texturas de espalda y en el selector.
- Los números salen de una plantilla por equipo, en `artSpec.ts` o en el roster si existe.

**Variedad:**

- Cada jugador lleva `hand: 'L' | 'R'` (lado del stick), `skin` (4 tonos) y `hair` (3–4 tipos, visibles si no hay casco).
- No todos clónicos.

---

## §6 Patinaje quad (WP-31)

Ciclo locomotor visto en 3/4. Lo importante es que **empuja hacia fuera y atrás**, no "camina".

**Postura base:**

- Rodillas flexionadas 25–40°.
- Torso inclinado adelante 20–35° (más en sprint).
- Cadera baja y cabeza estable.
- Peso sobre el patín de apoyo.

**Zancada** (un pie):

1. *Empuje:* el patín sale **lateral-atrás** a ≈ 40–50° de la dirección de marcha. La pierna se extiende y la rueda "araña" el suelo.
2. *Extensión:* la pierna queda estirada un instante.
3. *Recogida:* el pie vuelve bajo la cadera, rozando el suelo.
4. *Deslizamiento:* apoyo sobre ese pie mientras empuja el otro.

**Ritmo:**

- Cadencia ≈ 1,4 Hz por pie andando, hasta ≈ 2,2 Hz en sprint.
- Con poca aceleración (crucero) hay **fases de deslizamiento** sin zancada: ambos patines paralelos, ligera separación.
- La cadencia depende de la **aceleración**, no solo de la velocidad.

**Brazos:**

- Con stick a dos manos se mueven poco.
- En sprint sin bola, el brazo libre oscila **lateralmente**, contrario al empuje.

**Otros movimientos:**

| Movimiento | Cuándo | Cómo se ve |
|---|---|---|
| **Cruces (crossover)** | curvas cerradas a velocidad | el pie exterior cruza por delante del interior; inclinación hacia el centro de giro |
| **Hacia atrás** | velocidad opuesta al facing | "C-cuts": cada patín traza una C hacia fuera y vuelve; cadera baja, mirada adelante |
| **Frenada** | deceleración fuerte | en **cuña** (puntas juntas) o en **T** (un patín perpendicular detrás), o apoyo del freno frontal en paradas cortas; torso hacia atrás |
| **Parado** | — | *ready stance*: pies a la anchura de los hombros, rodillas flexionadas, stick en el suelo, pequeño balanceo de respiración |
| **Caída** (cargas en arcade, faltas) | — | rodar, quedar sentado o tumbado y levantarse en ~600 ms |

**Lectura por dirección:** 8 direcciones de vista (frente, 3/4 frente, lado, 3/4 espalda, espalda, más espejos). El orden de los miembros (cuál tapa a cuál) depende de la dirección.

---

## §7 Stick, bola y acciones (WP-32)

**Agarre:**

- Siempre **a dos manos** al conducir: mano superior en el extremo del mango y mano inferior 30–40 cm más abajo.
- `hand` decide a qué lado del cuerpo va la pala.
- Una sola mano solo en sprint sin bola o en estiradas de robo.

**Forma del stick:**

- Mango recto y **extremo curvo** (pala) **apoyado en el suelo**.
- Visto en 3/4: la pala está en el plano del suelo, a 30–60 cm delante y al lado del patín delantero.

**Bola y pala:**

- El **punto de contacto visual** de la pala coincide con la bola cuando se conduce. Hoy la física la coloca a `PLAYER_RADIUS + 8` (= 26 px) delante, más un lateral de protección.
- El **alcance** de robo y golpeo es `getStickTip` (38 px): la animación de robo estira brazos y stick hasta ahí.
- La física es la fuente de verdad, y el render se adapta. Si no cuadra a la vista, WP-32 lo propone al coordinador con un cambio de constantes. No lo cambia por su cuenta.

**Acciones:**

| Acción | Duración | Detalle |
|---|---|---|
| Conducción (*dribble*) | — | toques alternos derecha-izquierda con la pala, bola pegada |
| Pase | ~180 ms | barrido corto raso, *follow-through* hacia el receptor |
| Tiro | ~320 ms | armado atrás (backswing), impacto, *follow-through*. **Stick alto:** la pala no supera el hombro (VERIFICAR la regla exacta en WP-02) |
| Tiro turbo/fuego (arcade) | — | mismo esquema, más armado y estela |
| Robo | ~200 ms | estocada del stick hacia la bola, torso adelante |
| Recepción | — | la pala amortigua: pequeño retroceso al llegar la bola |
| Carga (arcade) | — | hombro adelante; la víctima cae (§6) |
| Celebración de gol | ~1,5 s | stick arriba (se permite: no hay juego), brazos, abrazo si hay compañeros cerca |

---

## §8 Portero (WP-33)

**Posturas:**

- *De pie atento:* semiagachado, pads juntos, guantes delante y stick en el suelo cubriendo el hueco entre pads.
- *De rodillas* (habitual en rink hockey): rodillas en el suelo, pads abiertos hacia los lados cubriendo el ancho de la portería y torso erguido.

**Desplazamientos:** pasos cortos laterales; de rodillas se desliza lateralmente.

**Paradas** (≤ 300 ms, y vuelta a la posición):

- Pad lateral abierto (*split*).
- Manopla arriba.
- Stick al suelo.
- Bloqueo con el cuerpo.

**Animación según el tiro:** la parada se elige por la altura o dirección del tiro si la física la ofrece. Si no, por el lado.

**Celebración rival:** el portero baja la cabeza o golpea el stick.

---

## §9 Oficiales, mesa y banquillos (WP-50…52)

**Disposición** (lado lejano, vista de TV):

```
 [GRADA LEJANA ........................................................]
  [BANQ. AZUL ][puerta]  [ MESA: auxiliar · crono · anotador ]  [puerta][BANQ. ROJO]
  [sanc. azul]                                                    [sanc. rojo]
 ============================== VALLA LEJANA ==============================
 |  P                         árbitro 1 ↘                               P  |
 |                                 ·                                       |
 |                        ↖ árbitro 2                                      |
 ============================== VALLA CERCANA =============================
```

**Árbitros** (2 en pista):

- **A pie, con zapatillas** [REG AR a.6] (suela de goma; en rink hockey no patinan).
- Uniforme negro o gris oscuro con detalle amarillo, silbato.
- Tarjetas azul y roja en el bolsillo.

**Movimiento:**

- Sistema en diagonal: cada uno cubre media pista por un lateral.
- Siguen la bola a 4–8 m, sin cruzarse con jugadores (evitación simple).
- Corren o andan con la locomoción "a pie" del rig (no la de patines).

**Gestos** (enganchados a los eventos de reglas existentes):

| Evento | Gesto |
|---|---|
| Silbato | brazo arriba |
| Falta | brazo extendido señalando la dirección del saque |
| Tarjeta azul o roja | tarjeta alzada al infractor |
| Gol | señalar el centro |
| Penalti | señalar el punto |
| Libre directo | señalar el punto de 7,4 m |
| Bully | ambos se colocan |

**Arcade:** ¿hay árbitros también? Lo decide **D3** (recomendado: sí, solo para silbato de saque y gol, sin tarjetas).

**Mesa:**

- Centrada en el lado lejano, detrás de la valla, en coordenadas de mundo (`wy < RINK.y`).
- Mesa con faldón, marcador o reloj pequeño, y 3 figuras sentadas: auxiliar, cronometrador y anotador.
- **Asientos de sancionados** a ambos lados, donde van los jugadores con tarjeta azul. Sustituyen a `PEN_BASE_X` en pantalla.

**Banquillos:**

- A ambos lados de la mesa, en coordenadas de mundo, con banco, puerta en la valla y un cartel de equipo.
- 5 suplentes sentados (pose sentada del rig) con peto o chaqueta.
- **Entrenador** de pie junto a la puerta, y **delegado** sentado.

**Reacciones:**

- El entrenador gesticula en faltas en contra, celebra goles propios (brazos arriba) y se lleva las manos a la cabeza en goles en contra.
- Los suplentes se levantan en los goles.

---

## §10 Escenario (WP-40…43)

**Portería** (WP-40):

- Tubos de sección redonda con brillo especular simple.
- Red **doble** (fondo y techo) con malla visible y caída.
- Base o arco trasero en el suelo y sombra.
- Partida en trasera y delantera (§3).
- El destello de gol (`createGoalNetFlash`) se adapta a la nueva red.
- Tamaño según D2.

**Vallas** (WP-41):

- Altura real (§1) con cara interior iluminada, canto superior claro y rodapié.
- Esquinas **lisas**: curva con ≥ 24 segmentos, sin facetas.
- Publicidad continua en las 4 vallas (ficticia), en perspectiva.
- **Puertas** frente a los banquillos.
- **Redes de protección** tras las porterías (altas, semitransparentes).
- Sombra de la valla sobre el suelo.

**Suelo** (WP-42):

- Fuera la rejilla tipo papel milimetrado.
- Pista de color uniforme con grano y reflejos de focos suaves; las marcas de ruedas se conservan.
- Líneas de §1 en blanco, con grosor ≈ 8 cm (≈ 2–3 px). Las de penalti y protección, según el reglamento.

**Gradas** (WP-43):

- Con la cámara única: misma escala de figura que todo, con `FIGURE_EXAG`.
- Filas con altura real por escalón (≈ 0,4 m) y profundidad (≈ 0,8 m).
- El público cercano nunca es más pequeño que el lejano.
- Variación de color de ropa, algún hueco y animación barata (salto en gol).

---

## §11 HUD (WP-60)

- **Un solo lenguaje visual** en ambos modos: la fuente Russo One y el estilo del videomarcador arcade.
- Fuera la tipografía monoespaciada de depuración (`Azul 0 — 0 Rojo`, `T1 1:58 · F 0-1`) y el texto central de faltas monoespaciado.
- El HUD no se solapa con banquillos ni gradas relevantes: margen superior reservado.
- Etiquetas sobre jugadores (`DEF/ALA/PIV/POR`) **desactivadas por defecto**. Se activan en ajustes, y el dorsal las sustituye.

---

## §12 Rendimiento

- Texturas generadas una vez (en `preload`/`create`), nunca por frame.
- `Graphics` estáticos se hornean a RenderTexture o textura.
- Presupuesto orientativo: ≤ 600 objetos de display activos (el público por asiento cuenta). 60 fps en escritorio y ≥ 45 fps en móvil medio.
- `project()` sin asignaciones en bucles calientes.
- Lo verifica WP-62 con el panel de Phaser o `performance.now()` en el lab.
