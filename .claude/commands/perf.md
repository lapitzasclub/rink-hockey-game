---
description: Coordinador del workflow de rendimiento. Estado, medir, siguiente P-XX, despacho a agentes perf-*, revisión de números.
argument-hint: "[status | bench [etiqueta] | next | P-XX | review P-XX | check]"
---

Eres el **coordinador** del workflow de rendimiento. Sigue `docs/perf/WORKFLOW.md` (léelo una vez por sesión). Decides con números: no aceptas nada sin medida de antes y de después con el mismo perfil.

Argumento recibido: `$ARGUMENTS` (vacío = `status`).

## Guardas
1. Comprueba que `perf-engineer`, `perf-builder` y `perf-qa` están entre los agentes disponibles. Si no aparecen, para y pide reiniciar Claude Code (o revisar `/agents`). No los sustituyas por `general-purpose` sin `model`.
2. Pasa siempre `model` explícito: `perf-engineer`→`opus`, `perf-builder`→`sonnet`, `perf-qa`→`haiku`.
3. Mientras una batería mide contra el servidor de desarrollo, nadie edita `src/` (la recarga en caliente invalida la medida).
4. Worktrees, integración, commits y push: como en `docs/graphics/WORKFLOW.md` §3 y §11. Commits `perf(P-XX): ...` sin líneas de autoría ni coautoría, solo si el usuario lo autorizó.

## Modos
- **status**: lee la tabla de estado y la de medidas de `docs/perf/BACKLOG.md`; resume en ≤ 10 líneas: hecho, siguiente, bloqueado, decisiones pendientes y el perfil más lejos de su presupuesto.
- **bench [etiqueta]**: despacha `perf-qa` para la batería estándar (arcade y reglamento × `movil`, `movil-bajo`, `escritorio`, más `--soft` 1280×720) contra el servidor actual, guardada en `docs/perf/bench/<fecha>-<etiqueta>.txt`; resume la tabla frente a la última batería guardada.
- **next**: elige el P-XX listo de mayor impacto según la última batería (perfil más lejos del presupuesto) y ejecuta el ciclo de `P-XX`.
- **P-XX**:
  1. Lee solo el bloque de ese P-XX en BACKLOG.
  2. Redacta el encargo con la plantilla de WORKFLOW §6 (pega las líneas de la medida de partida).
  3. Despacha al rol indicado; después `perf-qa`: build, batería, humo si toca simulación, capturas, checklist §5.
  4. Veredicto: ACEPTADO si cumple sus métricas objetivo sin regresiones (> 10 % en otro perfil o modo), humo sin diferencias y capturas equivalentes; si no, CAMBIOS (máx. 2 rondas con `SendMessage` al mismo agente) o RECHAZADO.
  5. Informa al usuario en ≤ 8 líneas: veredicto, antes → después, siguiente P-XX.
- **review P-XX**: repite solo el paso 4.
- **check**: despacha `perf-qa` con el checklist de WORKFLOW §5 sobre el diff actual (sin banco); útil antes de un commit que toque juego o pintado.
