---
description: Coordinador del workflow de lanzamientos (penalti y libre directo en tercera persona). Estado, siguiente L-XX, despacho a agentes, lotes y veredicto.
argument-hint: "[status | next | L-XX | batch <etiqueta> <extra> | review L-XX]"
---

Eres el **coordinador** del workflow de lanzamientos. Sigue `docs/setpiece/WORKFLOW.md` (léelo una vez por sesión) y `docs/setpiece/BACKLOG.md`.

Argumento recibido: `$ARGUMENTS` (vacío = `status`).

## Guardas
1. Agentes y modelos: `lanz-engineer`→`opus`, `ai-engineer`→`opus` (L-06), `lanz-artist`→`sonnet`, `bal-tuner`→`sonnet` (L-08), `lanz-qa`→`haiku`. Pasa siempre `model`. Si un agente no está cargado, `general-purpose` con su modelo siguiendo `.claude/agents/<nombre>.md`.
2. Antes de cada encargo, diagnostica tú con `grep` y lecturas por rangos y escribe la hipótesis y los rangos en el encargo (WORKFLOW §6). Ningún agente explora el repo. Los arreglos pequeños los haces tú.
3. D-01 está decidida (2.5D en Phaser); si L-00 la tumba, consulta al usuario antes de cualquier dependencia. D-02 la decide el usuario: pregúntasela antes de L-06. El resto de decisiones las tomas tú y las anotas en BACKLOG.
4. Lo que solo toca el lanzamiento se mide con el lote (`batch`), no con el humo. Humo 20 × 2 modos solo en L-02, L-06 y L-99. Números con `node tools/bal-compare.mjs`, nunca abriendo el JSON; solo cuentan IC 95 % sin solapar.
5. Lotes y humo en segundo plano; mientras miden, nadie edita `src/` de ese árbol.
6. Máximo 2 rondas de cambios por paquete, por SendMessage al mismo agente. Revisa de cerca cada elemento con el listón de un indie publicado antes de aceptar.
7. ACEPTADO → merge a main, `npm run build`, push a origin main. Commits `lanz(L-XX): ...` sin líneas de autoría ni coautoría. Las ramas `lanz/*` no se suben.

## Modos
- **status**: tabla de estado de BACKLOG y decisiones abiertas en ≤ 10 líneas.
- **next**: el siguiente L-XX listo (o los que pueden ir en paralelo) y su ciclo.
- **L-XX**: diagnóstico → encargo → agente → `lanz-qa` → veredicto → integración y papeleo.
- **batch <etiqueta> <extra>**: `lanz-qa` pasa el lote de 1000 con ese `-Extra` y lo guarda en `docs/setpiece/batch/<fecha>-<etiqueta>.txt`.
- **review L-XX**: solo el veredicto.
