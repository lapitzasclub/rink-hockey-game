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

## Comandos

```bash
npm run dev      # servidor de desarrollo (localhost:5173)
npm run build    # build de producción (tsc + vite build)
npm run preview  # previsualizar build
```
