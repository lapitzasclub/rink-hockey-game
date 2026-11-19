# Workflow evolutivo: animación, IA y dificultad

Cómo se mejoran la animación de los personajes, la IA y los niveles de dificultad. Lo coordina `/evo`.
Documentos hermanos:

- [BACKLOG.md](./BACKLOG.md): paquetes E-XX con objetivo, archivos, criterio de aceptación y estado.
- [smoke/](./smoke/): resultados en bruto del partido de humo (`[smoke-agg] {json}`).
- Las reglas de rendimiento de [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md) valen para cualquier cambio. Worktrees, commits y push como en [../graphics/WORKFLOW.md](../graphics/WORKFLOW.md) §3 y §11.

## 1. Roles

| Rol | Agente | Modelo | Hace |
|---|---|---|---|
| Coordinador | sesión principal (`/evo`) | el de la sesión | encargos cerrados, arreglos pequeños, veredicto, integración en main |
| IA táctica y dificultad | `ai-engineer` (`.claude/agents/ai-engineer.md`) | opus | `systems/ai.ts`, `playerControl.ts`, `targeting.ts`, constantes de IA y de dificultad |
| Rig y animación | `gfx-engineer` | opus | `render/puppet/`, `systems/visuals.ts`, `render/artSpec.ts` |
| Construcción mecánica | `general-purpose` con `model: sonnet` y el encargo cerrado | sonnet | UI de ajustes y menú, cableado repetitivo |
| QA | `perf-qa` (humo, banco) o `gfx-qa` (capturas) | haiku | build, humo de 20 corridas, banco movil-bajo, capturas, papeleo |

Los agentes de `.claude/agents/` se cargan al arrancar Claude Code. Si `ai-engineer` aún no aparece en la sesión, el coordinador despacha `general-purpose` con `model: opus` y le pide que siga `.claude/agents/ai-engineer.md` como su papel.

## 2. Ciclo de un paquete

```
1. Coordinador: encargo cerrado (§4) → agente en su worktree (si hay paralelo) o en main
2. Agente: implementa y se verifica (build + lo barato) → informe §5
3. QA: build; humo 20 × modo si toca juego; banco movil-bajo si toca render o rig; capturas de lo que cambia
4. Coordinador: veredicto ACEPTADO / CAMBIOS (máx. 2 rondas por SendMessage) / RECHAZADO
5. ACEPTADO → merge a main, build, push a origin main; estado en BACKLOG y línea en el Work log de AGENTS.md
```

- Paralelo solo si los paquetes no comparten archivos. IA (`systems/ai.ts`…) y animación (`render/puppet/`…) no los comparten. `MatchScene.ts` y `constants.ts` son serializados: si los dos lados los necesitan, el segundo en integrar resuelve el conflicto.
- Worktree manual desde main: `git worktree add .claude/worktrees/<e-xx> -b evo/<e-xx> main`, junction de `node_modules` (`cmd /c mklink /J node_modules ..\..\..\node_modules` dentro del worktree) y Vite propio: `npx vite --port <p> --strictPort --host 127.0.0.1`. Puertos: 5185 main, 5186 animación, 5187 IA. Nunca 5173 ni 5174.
- No se suben las ramas `evo/*`. Commits `evo(E-XX): ...` sin líneas de autoría ni coautoría.

## 3. Medir

### 3.1 Partido de humo (IA contra IA)

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento -SmokeMs 240000 -Runs 20 -BaseUrl http://127.0.0.1:5185/
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode arcade -SmokeMs 240000 -Runs 20 -BaseUrl ... -Extra "diffBlue=normal&diffRed=experto"
```

- Métricas por equipo: goles, tiros, a puerta, paradas hechas por su portero, pases intentados y completados, posesión (% del tiempo con bola), robos. El agregado da media ± IC 95 % y `redMinusBluePerMin`.
- **Solo cuenta una diferencia cuyos IC 95 % no se solapan.** Sin referencia medida en la misma base no se acepta ningún cambio de IA.
- Guardar la salida en `docs/evo/smoke/<fecha>-<etiqueta>.txt`.
- No editar `src/` del árbol que sirve ese Vite mientras mide.

### 3.2 Dificultad

`-Extra "diffBlue=<nivel>&diffRed=<nivel>"` fija el nivel de cada equipo en el humo. La prueba de niveles enfrenta a cada nivel contra `normal` y mira goles encajados por minuto y `redMinusBluePerMin`: deben ordenarse fácil < normal < difícil < experto sin IC solapados entre vecinos (al menos en uno de los dos modos).

### 3.3 Animación

- Capturas solo de lo que cambia: tiras del laboratorio (`?lab=actions`, `?lab=goalie`…) con `tools/gfx-shot.ps1`, más un partido en vivo a los 20 s.
- Banco `node tools/perf-bench.mjs --base <url> --profile movil-bajo --mode arcade --runs 3`, alternando con main: sin regresión de render ni lógica > 10 %.

## 4. Plantilla de encargo

```
E-XX — <título>            Agente: <nombre>   Modelo: <opus|sonnet|haiku>
Worktree / puerto: <ruta> · <puerto>
Objetivo: <qué debe pasar en el juego>
Lee SOLO: docs/perf/WORKFLOW.md §5; <archivos y rangos>
Archivos propios: <lista>   Prohibidos: <lista>
Criterio de aceptación: <medible>
Entrega: informe §5
```

## 5. Informe (≤ 20 líneas)

```
E-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Decisiones propias: <solo no triviales>
Medidas: <humo / banco / capturas>
Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```

## 6. Reglas

- Las de [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md): IA y reglas en `stepSimulation` a 60 Hz, tiempos con `simNow`, nada de juego en el pintado, Graphics estáticos horneados, sin `setColor`/`setStyle` por fotograma, sin asignar objetos por fotograma en bucles calientes (rig, visuals, IA).
- La dificultad no cambia la física: ni velocidad, ni aceleración, ni potencia de tiro. Cambia reacción, precisión, agresividad, acierto del portero y lectura de la jugada.
- Constantes de juego y de dificultad en `src/game/constants.ts`; visuales en `src/game/render/artSpec.ts`.
- Comentarios en español, sin comentar lo obvio. Archivos ≤ 500 líneas.
- Sin dependencias nuevas. nipplejs no se toca. `.openclaw/` no se toca. Nunca `git stash` a secas ni matar procesos por PID.
