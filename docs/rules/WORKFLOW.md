# Workflow de reglamento (`/regla`)

Cómo se ajustan al reglamento oficial los saques y las reglas del partido: saque de centro, libres, saque neutral, tiempos de posesión y validez de gol. Lo coordina `/regla`. Objetivo doble, como en `/dev`: **reglas fieles y gasto mínimo**.

Documentos hermanos:

- [REGLAMENTO.md](./REGLAMENTO.md): extracto literal de los artículos en juego y su estado. **Única fuente de reglas para los agentes**; nadie abre el PDF ni busca en la web.
- [BACKLOG.md](./BACKLOG.md): decisiones D-XX y paquetes R-XX con objetivo, archivos, aceptación y estado.
- [smoke/](./smoke/): humos en bruto (`[smoke-agg] {json}`) por paquete.
- Reglas de cualquier cambio: [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md). Gasto: [../dev/WORKFLOW.md §3](../dev/WORKFLOW.md) (valen aquí) y fila por paquete en [../dev/LEDGER.md](../dev/LEDGER.md).

**Pedido del usuario (2026-11-21):** «El saque de centro está mal hecho, revisa el reglamento» y, tras el análisis, «monta un workflow de agentes dedicados para optimizar su desarrollo y el gasto».

## 1. Mapa del código

| Qué | Dónde |
|---|---|
| Saque de centro: colocación y pitido | `src/game/systems/matchFlow.ts` (`resetKickoffState`, `kickoffTarget`, `updateKickoffState`, líneas 14–193) |
| Saque de centro en la escena | `src/scenes/MatchScene.ts` (`resetKickoff`, `updateKickoff` ~1407–1462; quién saca: `nextKickoffTeam` ~148, ~1371, `startSecondHalf` ~1747) |
| Libres (patrón de «apuntar y soltar» a copiar) | `matchFlow.ts` (`foulTarget`, `updateFoulRestartState` 312–445) y `MatchScene.updateFoulRestartState` |
| Faltas, sanciones y libres | `src/game/systems/rules.ts` |
| Tiempo de posesión y juego pasivo | `src/game/systems/passivity.ts`, tabla `PASSIVITY` en `constants.ts` (~886) |
| Contadores del humo | `src/game/systems/matchStats.ts` (`kickoffs`, `freeHits`…) |
| Captura de un evento | `src/scenes/lab/labAt.ts` (`at=`, `follow=`) |

El coordinador actualiza esta tabla cuando un paquete mueve código.

## 2. Roles y coste

| Rol | Agente | Modelo · esfuerzo | Para qué |
|---|---|---|---|
| Coordinador | sesión principal (`/regla`) | el de la sesión | diagnóstico con `grep` y rangos, encargo cerrado, veredicto, integración, arreglos triviales (≤ ~30 líneas) |
| Lógica de reglas | `regla-engineer` | opus · high | flujo nuevo de saques, validez de gol, estados que cruzan escena y sistemas |
| Mecánico con patrón | `regla-builder` | sonnet · medium | contadores, constantes, HUD y avisos, repetir un patrón que ya existe (`passivity`, libres) |
| IA nueva | `ai-engineer` | opus · high | solo si la IA necesita una decisión que no existe (no para apuntar un pase con la regla de siempre) |
| Medir y papeleo | `regla-qa` | haiku · low | build, humo, capturas `at=`, `bal-compare`, BACKLOG, Work log, LEDGER |

Reglas de gasto (además de `/dev` §3):

- **El reglamento ya está leído.** El encargo cita el artículo de REGLAMENTO.md por número; el agente no investiga reglas.
- **El coordinador diagnostica antes de despachar** y escribe hipótesis y rangos. Ningún agente explora el repo ni lee AGENTS.md entero (solo la convención de comentarios).
- **Opus solo para inventar el patrón.** Si en el repo hay un patrón que copiar (los libres para «apuntar y soltar», `passivity` para un contador con libre indirecto), va a sonnet.
- **Base antes que cambio.** R-05 deja contadores en el humo; sin base del mismo árbol no se acepta nada.
- **Medir lo justo.** Verificación propia: humo de 5 en reglamento. Aceptación: 20 × reglamento; arcade solo si el paquete cambia arcade (D-01). Capturas: ≤ 3 por paquete con `labAt`.
- **Máximo 2 rondas por paquete**, por SendMessage al mismo agente. Tras dos, se replantea o se sube de modelo.
- **Un partido del usuario al cierre** (R-99), no por paquete.

## 3. Ciclo

```
1. Coordinador: diagnóstico corto y encargo cerrado (§5) → agente en main o en su worktree
2. Agente: implementa, build, humo de 5 → informe §6
3. regla-qa: build, humo 20 de aceptación, bal-compare contra la base, capturas si el encargo las pide
4. Coordinador: ACEPTADO / CAMBIOS (máx. 2) / RECHAZADO; contrasta cada punto con el artículo citado
5. ACEPTADO → merge a main, build, push a origin main; regla-qa marca BACKLOG, REGLAMENTO (tabla de estado), Work log y LEDGER
```

- `MatchScene.ts`, `matchFlow.ts` y `constants.ts` se serializan: R-01 → R-02 → R-03 van en fila. R-04 (trivial) la hace el coordinador en cualquier hueco.
- Worktree manual desde main: `git worktree add .claude/worktrees/<r-xx> -b regla/<r-xx> main`, junction de `node_modules` y Vite propio `npx vite --port <p> --strictPort --host 127.0.0.1`. Puertos: 5197 main, 5198 engineer, 5199 builder. Nunca 5173 ni 5174.
- Commits `regla(R-XX): ...` sin líneas de autoría ni coautoría. Las ramas `regla/*` no se suben.

## 4. Medir

```bash
# humo IA contra IA (aceptación: 20; verificación propia: 5)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento -SmokeMs 240000 -Runs 20 -BaseUrl http://127.0.0.1:5197/ > docs/rules/smoke/<fecha>-<etiqueta>.txt
node tools/bal-compare.mjs docs/rules/smoke/<base>.txt docs/rules/smoke/<nuevo>.txt

# captura del saque (labAt; at= solo dispara con auto=1; gfx-shot usa 5173 si no se le da -BaseUrl)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 -BaseUrl http://127.0.0.1:<puerto>/ -Query "lab=match&auto=1&at=kickoff&after=400" -Out docs/rules/shots/R-XX/<nombre>.jpg
```

- Métricas del saque (las añade R-05): saques, % con pase del que saca, ms del pitido a campo rival, % de saques en que el rival toca primero en ≤ 3 s, libres por 5 s, goles anulados por saque directo o libre indirecto. Más las de siempre: goles/min, faltas, atascos, errores.
- Solo cuenta una diferencia cuyos IC 95 % no se solapan. Lo que cambia la regla a propósito (p. ej., aparecen libres por 5 s) se acepta si cumple el artículo y no dispara atascos ni goles/min fuera de ruido.

## 5. Plantilla de encargo

```
R-XX — <título>            Agente: <nombre>   Modelo: <opus|sonnet|haiku>
Worktree / puerto: <ruta> · <puerto>   (o «main, sin servidor»)
Artículos: REGLAMENTO.md <art.>   (cópialos en el encargo si son ≤ 5 líneas)
Objetivo: <qué debe pasar, observable>
Diagnóstico del coordinador: <hipótesis y evidencia en ≤ 5 líneas>
Lee SOLO: docs/perf/WORKFLOW.md §5; <archivos y rangos>
Archivos propios: <lista>   Prohibidos: <lista>
Aceptación: <humo y contadores esperados, capturas>
Entrega: informe §6
```

## 6. Informe (≤ 20 líneas)

```
R-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Cumple: <art. — cómo>   No cubre: <art. — por qué>
Decisiones propias: <solo no triviales>
Medidas: <bal-compare recortado / contadores>
Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```

## 7. Reglas de código

Las de [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md): reglas y saques en `stepSimulation` a 60 Hz, tiempos con `simNow`, nada de juego en el pintado, HUD registrado en `HudLayout`. Constantes en `src/game/constants.ts` (tablas con nombre de regla, p. ej. `KICKOFF_*`). Comentarios en español con el artículo citado (`art. 5.7`), sin comentar lo obvio. Archivos ≤ 500 líneas. Sin dependencias nuevas. nipplejs y `.openclaw/` no se tocan. Nunca `git stash` a secas ni matar procesos por PID.
