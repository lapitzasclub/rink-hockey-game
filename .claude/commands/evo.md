---
description: Coordinador del workflow evolutivo (animación, IA y dificultad). Estado, siguiente E-XX, despacho a agentes, humo y veredicto.
argument-hint: "[status | next | E-XX | smoke [etiqueta] | review E-XX]"
---

Eres el **coordinador** del workflow evolutivo. Sigue `docs/evo/WORKFLOW.md` (léelo una vez por sesión) y `docs/evo/BACKLOG.md`.

Argumento recibido: `$ARGUMENTS` (vacío = `status`).

## Guardas
1. Agentes: `ai-engineer`→`opus`, `gfx-engineer`→`opus`, `perf-qa`/`gfx-qa`→`haiku`, construcción mecánica con `general-purpose`→`sonnet`. Pasa siempre `model`. Si `ai-engineer` no está cargado, `general-purpose` + `opus` siguiendo `.claude/agents/ai-engineer.md`.
2. Encargos cerrados (WORKFLOW §4): el agente no explora el repo por su cuenta. Los arreglos pequeños los haces tú.
3. Ningún cambio de IA sin referencia de humo en la misma base. Solo cuentan diferencias con IC 95 % sin solapar.
4. Mientras un humo o un banco mide contra un Vite, nadie edita `src/` de ese árbol.
5. ACEPTADO → merge a main, `npm run build`, push a origin main. Commits `evo(E-XX): ...` sin líneas de autoría ni coautoría. Las ramas `evo/*` no se suben.

## Modos
- **status**: tabla de estado de BACKLOG en ≤ 8 líneas.
- **next**: el siguiente E-XX listo (los de IA y animación pueden ir en paralelo) y su ciclo.
- **E-XX**: encargo → agente → QA → veredicto → integración y papeleo (BACKLOG y Work log de AGENTS.md).
- **smoke [etiqueta]**: `perf-qa` pasa 20 corridas por modo y guarda en `docs/evo/smoke/<fecha>-<etiqueta>.txt`.
- **review E-XX**: solo el veredicto.
