# CLAUDE.md

Instrucciones específicas para Claude Code en este proyecto.

## Contexto

Juego de rink hockey 2D — Phaser 4, TypeScript, Vite. Lee [AGENTS.md](./AGENTS.md) para arquitectura, roadmap, diseño y reglas de trabajo antes de editar cualquier cosa.

## Reglas para Claude

- Seguir las convenciones de comentarios de `AGENTS.md` (español, no comentar lo obvio).
- Actualizar `AGENTS.md` al terminar cualquier bloque de trabajo: arquitectura, roadmap, diseño o work log según corresponda.
- Las constantes de gameplay van en `src/game/constants.ts`, no inline en los sistemas.
- Preferir editar sistemas existentes en `src/game/systems/` antes de añadir archivos nuevos.
- No introducir dependencias nuevas sin consultarlo.
- No mover la integración de nipplejs a controles Phaser nativos sin decisión explícita del usuario.

## Workflow general y gasto de IA

- Todo lo que no es de un dominio con workflow propio va por `/dev` según [docs/dev/WORKFLOW.md](./docs/dev/WORKFLOW.md) y [docs/dev/BACKLOG.md](./docs/dev/BACKLOG.md) (tareas T-XX).
- Enrutado por coste (WORKFLOW §1): trivial → la sesión sin agente; localizar → `dev-scout` (haiku); mecánico con patrón → `dev-builder` (sonnet); lógica difícil o con riesgo → `dev-engineer` (opus); medir, papeleo e integración → `dev-qa` (haiku).
- Reglas de gasto de §3 para **todos** los workflows: lectura acotada, humo de 20 solo para aceptar, informes cortos, máx. 2 rondas por modelo, presupuesto S/M/L en cada encargo (al tope, PARCIAL), escena de laboratorio antes que partido en vivo, y una fila por paquete en [docs/dev/LEDGER.md](./docs/dev/LEDGER.md).

## Workflow gráfico

- La renovación gráfica se coordina con `/gfx` según [docs/graphics/WORKFLOW.md](./docs/graphics/WORKFLOW.md) (backlog, SPEC y auditoría en `docs/graphics/`).
- Agentes `gfx-engineer` (opus), `gfx-builder` (sonnet), `gfx-qa` (haiku) en `.claude/agents/`. **Excepción a "lee AGENTS.md"**: estos agentes leen solo su encargo, las secciones de SPEC citadas y los archivos listados; de AGENTS.md solo aplican la convención de comentarios.
- Capturas headless: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 ...` (requiere `npm run dev`).
- Partido de humo IA contra IA (WPs que tocan juego): `powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento|arcade -SmokeMs 240000 -Runs 20 -BaseUrl ...`. Hay mucho ruido entre partidos: solo cuenta una diferencia cuyos IC 95 % no se solapan.

## Workflow de rendimiento

- Optimización y pulido se coordinan con `/perf` según [docs/perf/WORKFLOW.md](./docs/perf/WORKFLOW.md) (presupuestos, herramientas, reglas) y [docs/perf/BACKLOG.md](./docs/perf/BACKLOG.md) (paquetes P-XX con medidas).
- Agentes `perf-engineer` (opus), `perf-builder` (sonnet), `perf-qa` (haiku) en `.claude/agents/`; leen solo su encargo, WORKFLOW §5 y los archivos listados.
- **Reglas para cualquier cambio** (WORKFLOW §5): el juego avanza en `MatchScene.stepSimulation` a paso fijo (60 Hz) y se pinta en `renderFrame`; tiempos del partido con `simNow`; Graphics estáticos horneados (`render/bake.ts`); nada de `setColor`/`setStyle`/formas por fotograma; HUD registrado en `HudLayout`; efectos caros según `render/quality.ts`.
- Medir: `node tools/perf-bench.mjs --base <url> --profile movil|movil-bajo|escritorio --mode arcade|reglamento --runs 3` (requiere `npm run dev`; no editar `src/` mientras mide). Panel en vivo: `?perf=1` (también en producción). Trazas: `node tools/perf-trace.mjs <traza.json.gz>`.

## Workflow de equilibrio

- Dificultad en móvil y simetría de porteros con `/bal` según [docs/balance/WORKFLOW.md](./docs/balance/WORKFLOW.md) y [docs/balance/BACKLOG.md](./docs/balance/BACKLOG.md).
- `ai-engineer` (opus) solo para lógica nueva; `bal-tuner` (sonnet) barre tablas de `constants.ts`; `bal-qa` (haiku) pasa lotes y papeleo. Los lotes se comparan con `node tools/bal-compare.mjs <base> <nuevo>` (o `<lote> --sides`), no leyendo el JSON.

## Workflow de lanzamientos

- Penalti y libre directo en tercera persona (apuntado, fuerza y efecto en vuelo, figuras cercanas) con `/lanz` según [docs/setpiece/WORKFLOW.md](./docs/setpiece/WORKFLOW.md) y [docs/setpiece/BACKLOG.md](./docs/setpiece/BACKLOG.md).
- `lanz-engineer` (opus) motor, cámara, rig cercano y animación; `ai-engineer` (opus) IA del lanzamiento; `lanz-artist` (sonnet) HUD, piezas, escenario y efectos; `bal-tuner` (sonnet) acierto; `lanz-qa` (haiku) build, capturas, lotes y papeleo.
- Lo que solo toca el lanzamiento se mide con el lote headless (`?lab=setpiece&batch=N`), no con el humo; D-01: 2.5D en Phaser (sin Three.js); L-00 lo valida.

## Workflow de reglamento

- Saques (centro, libres, neutral), validez de gol y tiempos de posesión según el reglamento oficial con `/regla` según [docs/rules/WORKFLOW.md](./docs/rules/WORKFLOW.md) y [docs/rules/BACKLOG.md](./docs/rules/BACKLOG.md).
- La única fuente de reglas para los agentes es [docs/rules/REGLAMENTO.md](./docs/rules/REGLAMENTO.md) (extracto literal de World Skate 2026); si falta un artículo, lo añade el coordinador.
- `regla-engineer` (opus) flujo nuevo de reglas; `regla-builder` (sonnet) lo que repite un patrón; `ai-engineer` (opus) solo IA nueva; `regla-qa` (haiku) humo, capturas y papeleo.

## Comandos

```bash
npm run dev      # servidor de desarrollo (localhost:5173)
npm run build    # build de producción (tsc + vite build)
npm run preview  # previsualizar build
```
