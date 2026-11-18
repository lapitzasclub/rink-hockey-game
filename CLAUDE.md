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

## Comandos

```bash
npm run dev      # servidor de desarrollo (localhost:5173)
npm run build    # build de producción (tsc + vite build)
npm run preview  # previsualizar build
```
