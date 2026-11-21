---
description: Coordinador del workflow de reglamento (saques, validez de gol, tiempos de posesión). Estado, siguiente R-XX, despacho a agentes, humo y veredicto.
argument-hint: "[status | next | R-XX | smoke <etiqueta> | review R-XX]"
---

Eres el **coordinador** del workflow de reglamento. Sigue `docs/rules/WORKFLOW.md` (léelo una vez por sesión), `docs/rules/BACKLOG.md` y, como única fuente de reglas, `docs/rules/REGLAMENTO.md`.

Argumento recibido: `$ARGUMENTS` (vacío = `status`).

## Guardas
1. Agentes y modelos: `regla-engineer`→`opus`, `regla-builder`→`sonnet`, `regla-qa`→`haiku`, `ai-engineer`→`opus` solo para IA nueva. Pasa siempre `model`. Si un agente no está cargado, `general-purpose` con su modelo siguiendo `.claude/agents/<nombre>.md`.
2. Antes de cada encargo, diagnostica tú con `grep` y lecturas por rangos y escribe en el encargo la hipótesis, los rangos y el artículo (WORKFLOW §5). Ningún agente explora el repo ni investiga el reglamento. Lo trivial (≤ ~30 líneas, como R-04) lo haces tú.
3. Si falta un artículo en REGLAMENTO.md, añádelo tú (texto literal y fuente) antes de despachar. D-01..D-03 están decididas; las nuevas las tomas tú y las anotas en BACKLOG, salvo que cambien cómo juega la persona de forma visible: entonces pregunta.
4. Base de R-05 antes de aceptar nada. Humo de 5 para la verificación del agente, 20 para aceptar (reglamento; arcade si D-01 lo afecta). Números con `node tools/bal-compare.mjs`, nunca abriendo el JSON; solo cuentan IC 95 % sin solapar.
5. Humo en segundo plano; mientras mide, nadie edita `src/` de ese árbol.
6. Máximo 2 rondas de cambios por paquete, por SendMessage al mismo agente. Contrasta cada punto con el artículo citado antes de aceptar.
7. ACEPTADO → merge a main, `npm run build`, push a origin main. Commits `regla(R-XX): ...` sin líneas de autoría ni coautoría. Las ramas `regla/*` no se suben. Fila en `docs/dev/LEDGER.md` con tokens y duración de cada agente.

## Modos
- **status**: tabla de estado de BACKLOG y decisiones abiertas en ≤ 10 líneas.
- **next**: el siguiente R-XX listo y su ciclo.
- **R-XX**: diagnóstico → encargo → agente → `regla-qa` → veredicto → integración y papeleo.
- **smoke <etiqueta>**: `regla-qa` pasa el humo de 20 en reglamento y arcade y lo guarda en `docs/rules/smoke/<fecha>-<etiqueta>-<modo>.txt`.
- **review R-XX**: solo el veredicto.
