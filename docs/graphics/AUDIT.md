# Auditoría gráfica — 2026-11-15

Revisión del juego en Chrome (modos ARCADE y REGLAMENTO) y del código de render.

- **Capturas de referencia:** `shots/baseline/`
  - `arcade-zoom.jpg`
  - `reglamento-overview.jpg`
  - `reglamento-detalle.jpg`
- **Severidad:**
  - **A**: rompe la credibilidad del juego;
  - **M**: se nota mucho;
  - **B**: pulido.

## Causa raíz transversal

**No hay un modelo de cámara único.** Cada módulo proyecta a su manera:

| Módulo | Proyección actual |
|---|---|
| `viewTransform.ts` | curva ad hoc: convergencia `X_FAR=0.82`, exponente `Y_POW=1.4`; `worldToScreenExt` aplana todo lo que hay detrás de la valla lejana |
| `arena.ts` | gradas con su propio `depthScale = 0.72 + 0.28·t` |
| `benchPlayers.ts` | suplentes en píxeles de pantalla fijos (`SEAT_Y=78`, `XS=0.82`) a la **misma escala** que los jugadores cercanos (0,84) |
| `drawRink.ts` | banquillos como rectángulos en pantalla (`BENCH_SCREEN_RANGE`, y 4–119) que pisan el HUD y las gradas |
| `createPlayer.ts`, `visuals.ts` | escala constante `PLAYER_PUPPET_VISUAL_SCALE=0.84`, sin escala por profundidad; `VIEW_Y_SCALE` usado como apaño |
| `visuals.ts` | zona de sancionados en píxeles de pantalla (`PEN_BASE_X`, `PEN_Y`) |

La mayoría de los fallos de perspectiva y tamaño salen de aquí. Por eso la cámara (WP-10/11) va antes que el arte.

## Hallazgos

### Jugadores y estilo de arte

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| J1 | A | Torso rectangular tipo pegatina, cabeza grande, extremidades de palillo: lee como muñeco de varillas, no como deportista | WP-20, WP-30 |
| J2 | A | Los jugadores de campo llevan **rejilla de hockey hielo**. En rink hockey solo la lleva el portero | WP-30 (D4) |
| J3 | A | Patines como barra blanca. Faltan los quad: bota alta, 4 ruedas 2 × 2 y freno frontal | WP-30 |
| J4 | M | Todos clónicos: sin dorsal, piel, pelo ni mano dominante | WP-30 |
| J5 | M | El portero apenas se distingue: le faltan pads grandes, peto, manopla y postura de rodillas | WP-33 |
| J6 | M | Etiquetas `DEF/ALA/PIV/POR` sobre cada cabeza: ruido visual | WP-34 |
| J7 | M | Altura ≈ 2,15 m a escala de mundo; con la portería sobredimensionada no se nota, pero sí junto a la valla | WP-10, WP-30 |

### Animación

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| N1 | A | El patinaje mueve los patines **adelante y atrás** sobre la dirección de marcha: lee como andar o correr. Falta el empuje lateral-atrás con deslizamiento (SPEC §6) | WP-31 |
| N2 | A | Postura erguida: faltan rodillas flexionadas y torso inclinado | WP-31 |
| N3 | M | Faltan cruces en curvas, patinaje hacia atrás, frenada y postura de espera | WP-31 |
| N4 | A | Las acciones son un giro del stick de 160 ms. Faltan armado y follow-through en tiro y pase, estocada de robo, recepción, caída y celebración | WP-32 |
| N5 | M | El portero no tiene paradas animadas | WP-33 |

### Stick

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| S1 | A | Stick recto como lanza con punta naranja, sujeto en horizontal con una mano | WP-32 |
| S2 | A | La pala no apoya en el suelo y la bola no está en la pala: físicamente la bola va a 26 px y la punta del stick a 38 px | WP-32 |
| S3 | M | Sin curva en el extremo ni mano dominante | WP-30, WP-32 |

### Porterías

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| P1 | A | **Sobredimensionadas:** la boca mide 114 px ≈ 3,8 m (real 1,70 m) y son más altas que los jugadores | WP-40 (D2) |
| P2 | A | Red en forma de cúpula con un solo poste rojo visible; no parece una portería de rink hockey | WP-40 |
| P3 | M | El semicírculo de la D atraviesa la portería | WP-42 |
| P4 | M | Sin separación trasera y delantera: un jugador no puede estar "dentro" ni detrás | WP-40 |

### Valla perimetral

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| V1 | A | Banda oscura plana sin altura legible (14 px ≈ 0,5 m; real ≈ 1 m) | WP-41 |
| V2 | M | Esquinas con segmentos poligonales visibles | WP-41 |
| V3 | M | Publicidad solo en las vallas larga superior e inferior; faltan puertas de banquillo, redes de protección tras las porterías y sombra | WP-41 |
| V4 | M | La valla cercana no tiene estrategia de corte: si se le da altura real, tapará la jugada | WP-41 |

### Suelo y marcas

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| F1 | M | Rejilla tipo papel milimetrado sobre el suelo | WP-42 |
| F2 | M | Marcas sin verificar contra el reglamento: antijuego, radio de protección, distancia de la línea de gol, radio de esquina | WP-02, WP-42 |
| F3 | B | `GOALIE_ZONE_RADIUS` contradice su comentario respecto a `GOAL_HALF_H` | WP-02 |

### Perspectiva y tamaños

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| E1 | A | Suplentes del lado lejano del mismo tamaño que los jugadores cercanos | WP-11, WP-52 |
| E2 | A | Público cercano **más pequeño** que los jugadores (escala invertida) | WP-11, WP-43 |
| E3 | A | Jugadores sin escala por profundidad | WP-10, WP-11 |
| E4 | M | La caja de banquillos en pantalla se solapa con el HUD y las gradas | WP-52, WP-60 |

### Elementos ausentes

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| X1 | A | No hay árbitros (2 en pista) ni sus gestos | WP-50 |
| X2 | A | No hay mesa de árbitros (auxiliar, cronometrador, anotador) ni asientos de sancionados en el mundo | WP-51 |
| X3 | A | No hay entrenadores ni delegados en los banquillos, ni reacciones | WP-52 |

### Otros

| # | Sev | Hallazgo | WP |
|---|---|---|---|
| O1 | M | HUD de REGLAMENTO con fuente monoespaciada de depuración que pisa banquillo y gradas; el arcade tiene un videomarcador cuidado. Hay que unificar | WP-60 |
| O2 | M | El texto central de falta (`Falta de rojo`) va en monoespaciada | WP-60 |
| O3 | B | Sin luz ni sombras coherentes (focos, sombras de contacto, sombra de valla) | WP-61 |
| O4 | B | Sin medir rendimiento ni móvil con el pabellón nuevo | WP-62, WP-63 |
| O5 | B | AGENTS.md pesa 42 KB: cada agente que lo lee entero gasta ~11 k tokens. El work log antiguo debería archivarse | WP-01 (D7) |
