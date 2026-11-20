# Workflow de equilibrio: dificultad en móvil y porteros

Cómo se ajusta lo difícil que es el juego para una persona (sobre todo con controles táctiles) y la simetría de los porteros. Lo coordina `/bal`.
Documentos hermanos:

- [BACKLOG.md](./BACKLOG.md): paquetes B-XX con objetivo, archivos, criterio de aceptación y estado.
- [smoke/](./smoke/): lotes de humo en bruto (`[smoke-agg] {json}`) y [real/](./real/): resúmenes de partidos jugados en un móvil real (`?stats=1`).
- Reglas de cualquier cambio: [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md) y [../evo/WORKFLOW.md §6](../evo/WORKFLOW.md) (la dificultad no cambia la física). Worktrees, commits y push como en `/evo`.

## 1. El problema de medida

El humo es IA contra IA, y ahí los porteros son simétricos (arcade, 20 corridas: paradas azul 67,8 ± 7,2 %, rojo 66,9 ± 5,7 %). Lo que se quiere arreglar solo pasa con una persona a los mandos: el táctil es más torpe que el teclado o el mando, y el usuario ve que el portero rival para más que el suyo. Por eso el workflow empieza por **medir a una persona**:

1. **Partido real con `?stats=1`** (B-01): el usuario juega en su móvil y al final copia un resumen JSON; se guarda en `real/`. Es la verdad, pero cuesta partidos del usuario: pocos y bien elegidos.
2. **Humano simulado en el humo** (B-02): `human=touch|pad` cambia el piloto automático del azul por un conductor con las limitaciones de una persona (reacción, ruido del stick, puntería sin ayuda de IA, cambios de jugador como el botón CAMBIO). Se calibra con los partidos reales y desde entonces todo se ajusta en headless, sin gastar partidos del usuario.

## 2. Roles y coste

| Rol | Agente | Modelo | Para qué |
|---|---|---|---|
| Coordinador | sesión principal (`/bal`) | el de la sesión | diagnóstico con `grep`, encargos cerrados, veredicto, integración |
| Código de IA y medida | `ai-engineer` | opus | B-01 (instrumentación), B-02 (humano simulado), B-03 (portero), B-04 (niveles) |
| Barrido de parámetros | `bal-tuner` | sonnet | B-05: probar valores de las tablas de `constants.ts` contra el humo; no toca otra cosa |
| Medida y papeleo | `bal-qa` | haiku | lotes de humo, `tools/bal-compare.mjs`, build, estado en BACKLOG y Work log |
| UI de ajustes y menú | `general-purpose` con `model: sonnet` | sonnet | selector de dificultad de B-04 |

Reglas de gasto:

- **El coordinador diagnostica antes de despachar.** `grep` y lectura por rangos; el encargo dice qué líneas leer. Ningún agente explora el repo.
- **Opus solo para escribir lógica nueva** (B-01…B-04). Lo que es probar números lo hace `bal-tuner` en sonnet, y lo que es ejecutar y archivar, `bal-qa` en haiku.
- **Los números los lee un script, no un modelo.** `node tools/bal-compare.mjs <base> <nuevo>` (o `<lote> --sides`) da el veredicto ↑ / ↓ / = por IC 95 %. Los agentes pegan esa salida, no el JSON.
- **Cribar barato, aceptar caro.** Barridos con `-Runs 5` y un solo modo (arcade, el de por defecto); la batería de 20 × 2 modos solo para el candidato final y la base.
- **El humo corre en segundo plano** (`run_in_background`) y nadie lo vigila: se recibe el aviso al terminar.
- **Máximo 2 rondas de cambios por paquete** (SendMessage al mismo agente, que conserva su contexto). Si no converge, el coordinador lo replantea.
- **Partidos del usuario: los justos.** Uno antes (referencia real) y uno al cierre por modo de control; nunca para cribar.

## 3. Ciclo de un paquete

```
1. Coordinador: diagnóstico corto y encargo cerrado (§5) → agente
2. Agente: implementa, build y humo corto (5 corridas) → informe §6
3. bal-qa: lote de aceptación en segundo plano y bal-compare frente a la base
4. Coordinador: ACEPTADO / CAMBIOS (máx. 2) / RECHAZADO
5. ACEPTADO → merge a main, build, push; bal-qa marca BACKLOG y Work log de AGENTS.md
```

Worktrees y puertos: como `/evo` (`git worktree add .claude/worktrees/<b-xx> -b bal/<b-xx> main`, junction de `node_modules`, `npx vite --port <p> --strictPort --host 127.0.0.1`). Puertos 5188 main, 5189 trabajo. No se suben las ramas `bal/*`. Commits `bal(B-XX): ...` sin líneas de autoría ni coautoría.

## 4. Medir

```bash
# humo con humano simulado (B-02) frente a la IA en un nivel
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode arcade -SmokeMs 240000 -Runs 20 -BaseUrl http://127.0.0.1:5188/ -Extra "human=touch&diffRed=normal" > docs/balance/smoke/<fecha>-<etiqueta>.txt
node tools/bal-compare.mjs docs/balance/smoke/<base>.txt docs/balance/smoke/<nuevo>.txt
node tools/bal-compare.mjs docs/balance/smoke/<lote>.txt --sides
```

- Solo cuenta una diferencia cuyos IC 95 % no se solapan. Sin base medida en el mismo árbol no se acepta ningún cambio.
- No se edita `src/` del árbol que sirve el Vite mientras mide.
- El azul es siempre el humano (simulado o real); el rojo, la IA del nivel que se prueba.

### Objetivos (B-05 los ajusta)

| Control | Nivel | Objetivo frente a la IA |
|---|---|---|
| táctil | FÁCIL | el humano gana: `redMinusBluePerMin` < 0 con IC sin tocar el 0 |
| táctil | NORMAL | partido igualado: IC de `redMinusBluePerMin` contiene el 0 |
| mando / teclado | NORMAL | la IA gana por poco (≤ +0,3 goles/min) |
| cualquiera | — | a igual calidad de tiro, % de paradas de los dos porteros con IC solapados |

## 5. Plantilla de encargo

```
B-XX — <título>            Agente: <nombre>   Modelo: <opus|sonnet|haiku>
Worktree / puerto: <ruta> · <puerto>
Objetivo: <qué debe pasar en el juego>
Diagnóstico del coordinador: <hipótesis y evidencia en ≤ 5 líneas>
Lee SOLO: docs/perf/WORKFLOW.md §5; <archivos y rangos>
Archivos propios: <lista>   Prohibidos: <lista>
Medida de aceptación: <lote, base y veredicto esperado de bal-compare>
Entrega: informe §6
```

## 6. Informe (≤ 15 líneas)

```
B-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Decisiones propias: <solo no triviales>
Medidas: <salida de bal-compare, recortada a las claves del encargo>
Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```

## 7. Reglas

- La dificultad y las ayudas táctiles no cambian la física: ni velocidad, ni aceleración, ni potencia. Cambian reacción, precisión, agresividad, acierto del portero, lectura de la jugada y las ayudas al humano (apuntado, pase, cambio de jugador).
- Las ayudas táctiles se activan por el dispositivo (`pointer: coarse`), no por el tamaño de pantalla; con mando conectado en el móvil, cuenta el mando.
- Constantes en `src/game/constants.ts`, en tablas (`DIFFICULTY`, `TOUCH_ASSIST`) para que `bal-tuner` las barra sin leer la IA.
- Comentarios en español, sin comentar lo obvio. Archivos ≤ 500 líneas. Sin dependencias nuevas. nipplejs y `.openclaw/` no se tocan.
