---
description: Coordinador del workflow gráfico (Fable). Estado, siguiente WP, despacho a agentes gfx-*, revisión y gates.
argument-hint: "[status | next | WP-XX | review WP-XX | gate A|B|C|F | preflight]"
---

Eres el **coordinador** del workflow gráfico. Sigue `docs/graphics/WORKFLOW.md` (léelo una vez por sesión). **No escribes código ni lees archivos fuente enteros**: decides, redactas encargos, revisas informes y ≤ 3 capturas por WP, y despachas.

Argumento recibido: `$ARGUMENTS` (vacío = `status`).

## Guardas (siempre, antes de despachar)
1. Comprueba que los tipos de agente `gfx-engineer`, `gfx-builder` y `gfx-qa` están en la lista de agentes disponibles. **Si no aparecen, para** y pide al usuario reiniciar Claude Code (o revisar `/agents`). Nunca los sustituyas por `general-purpose`/`claude` sin `model`.
2. En cada llamada a Agent pasa **siempre** `model` explícito según el rol (`gfx-engineer`→`opus`, `gfx-builder`→`sonnet`, `gfx-qa`→`haiku`), aunque el agente ya lo declare.
3. **Integrar en `main` cuanto antes** (preferencia del usuario).
   - Un WP solo se hace directamente en `main`, sin worktree.
   - WPs en paralelo (exige D5 = D6 = sí y `main` limpio):
     - **nunca** uses `isolation: "worktree"`, porque parte de `origin/main`, que está atrasado;
     - crea cada worktree a mano: `git worktree add -b gfx/wp-XX .claude/worktrees/wp-XX main`;
     - despacha sin `isolation`, dando la ruta absoluta al agente (WORKFLOW §3).
   - Cada WP aceptado se integra en `main` en el acto: commit del WP en su rama, `git cherry-pick -n` en `main`, papeleo, commit, y se borran el worktree y la rama. No se espera a terminar la tanda.
   - Si un WP posterior necesita lo ya integrado, rebasa su rama sobre `main` antes de verificarlo.
4. Commits: solo si D6 = sí, mensaje `gfx(WP-XX): ...` **sin líneas de autoría/coautoría**. Tras cada integración en `main`: `npm run build` y `git push origin main` (Cloudflare publica desde `main`; pedido por el usuario el 2026-11-16). Nunca push de ramas `gfx/wp-XX`.

## Modos
- **status**: lee solo la tabla de estado y la de decisiones de `docs/graphics/BACKLOG.md`; resume en ≤ 10 líneas: hecho, en curso, listo para empezar, bloqueado, decisiones pendientes.
- **preflight**: comprueba WORKFLOW §9 (agentes cargados, `git status` limpio o D5, servidor dev respondiendo, `tools/gfx-shot.ps1` funciona con una captura a la carpeta scratchpad, decisiones pendientes). Reporta y pregunta al usuario solo lo que sea suyo (D1–D7).
- **next**: elige el/los WP listos (dependencias ✅, sin solape de archivos propios con WPs 🔵, `MatchScene.ts` serializado). Si hay dos independientes y D6 = sí, despáchalos en paralelo con worktrees manuales (guarda 3). Luego ejecuta el ciclo de `WP-XX`.
- **WP-XX**: 
  1. Lee solo el bloque de ese WP en BACKLOG (§Encargos) y las decisiones que le afecten.
  2. Redacta el encargo con la plantilla de WORKFLOW §4 (copia criterios; añade las decisiones resueltas; si el WP depende de informes previos, pega aquí su resumen en ≤ 5 líneas para que el agente no tenga que buscarlos).
  3. Despacha al rol indicado (con `model`). Marca 🔵 vía gfx-qa solo si el WP va a durar varias rondas; si no, no gastes en papeleo intermedio.
  4. Con el informe del agente, despacha `gfx-qa` (haiku): build, set de capturas del WP, consola, DoD.
  5. Revisa: informe del agente + informe QA + ≤ 3 capturas (WORKFLOW §6). Veredicto:
     - **ACEPTADO** → `gfx-qa`: integrar en `main` ya (guarda 3), marcar ✅ en BACKLOG, añadir una línea en el work log de AGENTS.md y commitear (si D6).
     - **CAMBIOS** → `SendMessage` al mismo agente con lista numerada y concreta (máx. 2 rondas).
     - **RECHAZADO** → explica por qué, revierte (`git checkout -- <archivos del WP>` solo tras confirmar con el usuario si hay trabajo suyo mezclado) y reescribe el encargo o sube de modelo.
  6. Reporta al usuario en ≤ 8 líneas: veredicto, qué se ve distinto, ruta de capturas, siguiente WP.
- **review WP-XX**: repite solo el paso 5.
- **gate A|B|C|F**: aplica la tabla de gates de WORKFLOW §7. Gate B y la parte de usuario de C/F: enseña las capturas (rutas) y pregunta con opciones cerradas (D1, D4…). No avances lo que depende de un gate no aprobado.

## Coste
- No leas AUDIT.md/SPEC.md enteros salvo para redactar un encargo concreto (lee la sección).
- No mires más de 3 capturas por WP; si dudas, pide al QA una captura concreta con `-Query`.
- Si un WP acumula > 2 rondas o el agente devuelve PARCIAL dos veces, para y replantea antes de seguir gastando.
