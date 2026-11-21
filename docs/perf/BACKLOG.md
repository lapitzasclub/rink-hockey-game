# Backlog de rendimiento y pulido

Paquetes de trabajo (P-XX) del workflow de rendimiento ([WORKFLOW.md](./WORKFLOW.md)). Cada uno lleva su medida de antes y de después (banco `tools/perf-bench.mjs`, mediana de 3 corridas salvo que se diga).

## Estado

| P | Título | Rol | Estado |
|---|---|---|---|
| P-01 | Simulación a paso fijo e interpolación (velocidad independiente de fps y resolución) | engineer · opus | ✅ 2026-11-18 |
| P-02 | Horneado de Graphics estáticos (pista, vallas, porterías, mesa, redes, HUD) | builder · sonnet | ✅ 2026-11-18 |
| P-03 | Formas y textos por fotograma (anillo, sombra de bola, reloj del marcador) | builder · sonnet | ✅ 2026-11-18 |
| P-04 | Relleno de píxeles: horneados, público y viñeta recortados a sus baldosas con contenido; gradas lejanas fundidas en calidad baja | builder · sonnet | ✅ 2026-11-18 |
| P-05 | Calidad gráfica (auto/alta/media/baja) y regulador automático | engineer · opus | ✅ 2026-11-18 |
| P-06 | Formato apaisado responsivo: proporción 4:3–2,6:1, HUD anclado, controles táctiles, PWA | builder · sonnet | ✅ 2026-11-18 |
| P-07 | Instrumentación: monitor `?perf=1`, banco headless, analizador de trazas, workflow | engineer · opus | ✅ 2026-11-18 |
| P-08 | Resolución de render nítida en pantallas grandes | engineer · opus | ⏸ decisión DP-1 |
| P-09 | Suelo, líneas de la pista y luz en una sola textura | builder · sonnet | ⬜ |
| P-10 | Coste del rig: pose de figuras lejanas o quietas (árbitros, mesa, banquillo) | engineer · opus | ⬜ |
| P-11 | Menú: mismas reglas y medida propia (`--menu`) | builder · sonnet | ⬜ |
| P-12 | Pruebas en dispositivos reales con `?perf=1` (Android gama baja, iPhone) | usuario + qa | ⬜ |
| P-13 | Memoria de texturas del pabellón (4 lienzos de 1960×1240) | builder · sonnet | ⬜ |
| P-14 | Regresión de E-15…E-21 en movil-bajo: lógica +16–30 %, p95 de reglamento ×1,8 (`docs/evo/smoke/2026-11-21-E99-banco.txt`) | engineer · opus | 🟨 |

## Medidas

Equipo de desarrollo: RTX 3050 Ti portátil, pantalla a 50 Hz (tope de fps). Resultados en bruto en [bench/](./bench/).

Base `a78720b` → final de la sesión 26 (mediana de 3; `--soft`, de 2). fps topados a 50 por la pantalla del equipo; «lógica» incluye la pose de las figuras, «render» es el envío a la GPU.

| Modo · perfil | fps | frame p95 (ms) | lógica (ms) | render (ms) | tirones/min |
|---|---|---|---|---|---|
| arcade · escritorio | 50 → 49,9 | 20,1 → 20,1 | 1,00 → 0,81 | 4,14 → 1,44 | 0 → 7 |
| arcade · movil | 24,7 → **49,7** | 60,1 → 20,1 | 8,20 → 3,84 | 29,95 → **5,64** | 1207 → 7 |
| arcade · movil-bajo | 11,3 → **47,6** | 140 → 20,2 | 18,47 → 6,72 | 64,86 → **10,56** | 678 → 120 |
| arcade · soft 1280×720 | 10,1 → 11,3 | 100,2 → 100,1 | 1,91 → 1,93 | 7,62 → 4,55 | 600 → 680 |
| reglamento · escritorio | 50 → 50 | 20,1 → 20,1 | 0,91 → 0,71 | 3,66 → 1,16 | 0 → 0 |
| reglamento · movil | 38,6 → **50** | 40,1 → 20,1 | 4,85 → 3,44 | 19,34 → **5,03** | 663 → 0 |
| reglamento · movil-bajo | 23,3 → **49,9** | 60,1 → 20,1 | 8,61 → 5,41 | 31,53 → **8,45** | 1350 → 7 |
| reglamento · soft 1280×720 | 10,3 → 11,1 | 100,1 → 100,1 | 1,47 → 1,57 | 6,25 → 1,58 | 620 → 649 |

- En bruto: `bench/2026-11-18-base-a78720b.txt` y `bench/2026-11-18-final.txt`. Calidad en uso en la final: alta en escritorio y `--soft`, media en los perfiles móviles (auto, detectada).
- `--soft` (GPU por software) sigue en ~11 fps: ahí manda el relleno de píxeles (pabellón, suelo, luz y viñeta). Es la cola de P-09 y P-13.
- Humo (20 corridas por modo, nueva frente a base): sin diferencias; `bench/2026-11-18-humo-nuevo-vs-base.txt`. Tras las correcciones de la revisión: `bench/2026-11-18-verificacion-final.txt` (reglamento 1,16 ± 0,21 y arcade 2,11 ± 0,33 goles/min, 0 atascos y 0 errores).
- Ruido: una comparación intercalada en `movil-bajo` (`bench/2026-11-18-ab-movil-bajo.txt`) dio en una ronda 24,2 → 47,7 fps y en la siguiente 18,7 → 19,3 (las dos versiones cayeron a la vez). Lo estable es el render por pareja: 26–37 ms en la base frente a 10–16 ms en la nueva. Ver WORKFLOW §3.1.
- Antes de recortar los horneados por baldosas, `--soft` bajó a 7,2–7,6 fps: un Graphics horneado entero rellena su rectángulo aunque casi todo sea transparente. De ahí la regla de WORKFLOW §5.2.


## Decisiones

| Id | Pregunta | Estado |
|---|---|---|
| DP-1 | ¿Renderizar a la resolución de la pantalla (hasta 1080p de alto) en calidad alta? Hoy el lienzo es siempre de 720 px de alto y el navegador lo escala: barato, pero se ve blando en monitores de 1080p o más. Cuesta ~2,25× relleno de píxeles en 1080p. | pendiente (usuario) |

## Encargos

### P-08 — Resolución de render nítida

Objetivo: en calidad alta, el lienzo a `min(alto CSS × DPR, 1080)` px de alto, con nitidez en texto y líneas. Diseño propuesto: factor `k` = alto de render / 720; `Scale.EXPAND` con tamaño base 1280k × 720k; todas las cámaras con zoom × k (CameraDirector, cámara de UI, menú, lab); `Text.setResolution(k)` en el enrutado `ADDED_TO_SCENE`; `bakeResolution` y el lienzo del suelo × k. Riesgo: todas las cámaras; relleno × k². Criterios: `escritorio` sigue al tope de fps; `movil` y `movil-bajo` sin cambios (k = 1 en media y baja); capturas a 1920×1080 más nítidas.

### P-09 — Suelo, líneas y luz en una textura

Objetivo: dos pasadas de relleno menos en toda la pista (hoy: suelo, líneas horneadas y pozos de luz aditivos por separado, todos por debajo de los jugadores). Pintar las líneas (Graphics de `drawRink` en depth `COURT`) y los pozos de luz dentro del lienzo del suelo. Criterio: `--soft` 1280×720 mejora ≥ 10 % en fps sin cambios visibles.

### P-10 — Coste del rig

Objetivo: bajar la lógica de `movil-bajo` (pose de 10 jugadores, 2 árbitros, 3 de mesa y suplentes en cada fotograma). Ideas: no recalcular la pose de figuras sin cambios (sentados, quietos), ordenar piezas solo al cambiar de vista. Criterio: lógica de `movil-bajo` −20 % sin cambios visibles en las tiras de animación del lab.

### P-11 — Menú

Medir el menú con `--menu` en `movil-bajo` y aplicar las reglas de WORKFLOW §5 (textos, tweens, deriva de cámara).

### P-12 — Dispositivos reales

Abrir el juego con `?perf=1` en un Android de gama baja y en un iPhone, jugar un partido por modo y anotar fps, p95 y la calidad en uso que elige el modo auto. Ajustar `detectTier` y `QUALITY_WATCH` con lo que salga.

### P-13 — Memoria del pabellón

Las gradas ocupan cuatro lienzos de 1960×1240 (~39 MB de textura). En calidad baja ya se funden en uno; queda recortar estructura y público lejano a su caja y valorar pintarlas a media resolución en baja.
