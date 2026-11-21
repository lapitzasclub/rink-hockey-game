# Workflow general de desarrollo (`/dev`)

Para todo lo que no es de un workflow de dominio: funciones nuevas, errores, refactors, shell y menús, partido por enlace, Loyola, herramientas. Lo coordina `/dev`. Su objetivo es doble: **avanzar rápido y gastar poco**. Cada trabajo va al modelo más barato que lo hace bien, con un encargo cerrado para que nadie explore de más.

Documentos hermanos: [BACKLOG.md](./BACKLOG.md) (tareas T-XX) y [LEDGER.md](./LEDGER.md) (gasto por paquete, de **todos** los workflows).

## 1. Enrutado (lo primero, siempre)

| Si la tarea es… | Va a | Modelo |
|---|---|---|
| De un dominio con workflow propio | `/gfx` (gráficos), `/perf` (rendimiento), `/bal` (equilibrio), `/lanz` (penalti y directo), `/regla` (saques y reglas del reglamento oficial), `/evo` (animación, IA, física) | el del workflow |
| Trivial: ≤ ~30 líneas, archivos conocidos, sin riesgo de juego | el coordinador, sin agente | el de la sesión |
| Hay que **localizar** código o entender un flujo antes de decidir | `dev-scout` → mapa `archivo:línea` | haiku |
| Mecánica con especificación clara: cableado, UI, menús, CSS, textos, repetir un patrón existente, tests | `dev-builder` | sonnet |
| Lógica difícil o con riesgo: simulación, bucle del partido, arquitectura, errores sutiles, concurrencia, Capacitor/Android | `dev-engineer` | opus |
| Verificar y medir: build, humo, banco, capturas, consola, papeleo, commit de integración | `dev-qa` | haiku |

- **Nunca** opus para esperar un humo de 80 minutos, leer logs o hacer papeleo: eso es `dev-qa`.
- **Nunca** sonnet u opus explorando a ciegas: si el encargo no puede listar archivos y rangos, primero `dev-scout`.
- Ante la duda entre sonnet y opus: sonnet si existe un patrón en el repo que copiar; opus si hay que inventar el patrón.

## 2. Ciclo

```
1. Enrutar (§1). Si hace falta, dev-scout devuelve el mapa (≤ 15 líneas).
2. Encargo cerrado (§4) → dev-builder o dev-engineer, en main o en su worktree.
3. El agente implementa, build, verificación barata → informe (§5).
4. dev-qa: build, lo que el encargo pida (humo si toca juego, capturas si se ve), consola.
5. Veredicto: ACEPTADO / CAMBIOS (máx. 2 rondas por SendMessage) / RECHAZADO.
6. ACEPTADO → integrar en main, build, push; estado en BACKLOG, Work log de AGENTS.md y una fila en LEDGER.
```

- Tras 2 rondas de CAMBIOS no hay tercera con el mismo modelo: se replantea el encargo o se sube de modelo (sonnet → opus).
- Las rondas siguen al mismo agente por `SendMessage` (conserva su contexto); un agente nuevo para lo mismo paga dos veces la lectura.
- Paralelo solo si los archivos propios no se solapan. `MatchScene.ts` y `constants.ts` se serializan. Worktrees a mano desde main como en [../evo/WORKFLOW.md](../evo/WORKFLOW.md) §2; puertos 5190–5194 para `/dev`.

## 3. Reglas de gasto

1. **Lectura acotada.** Los agentes leen solo el encargo, los archivos listados (por rangos si son grandes) y `docs/perf/WORKFLOW.md` §5 si tocan juego o pintado. Nadie lee AGENTS.md entero; de él solo aplica la convención de comentarios.
2. **Buscar antes que abrir.** `Grep` con contexto en vez de leer archivos completos.
3. **Medir lo justo.** Humo de 5–6 corridas para la verificación propia; 20 solo para aceptar, y solo si el cambio toca la simulación. Banco movil-bajo una vez, en el cierre de la tanda. Capturas solo de lo que cambia; el coordinador mira ≤ 3 por paquete.
4. **Salidas cortas.** Informes ≤ 20 líneas. QA pega agregados (`[smoke-agg]`, `bal-compare`), nunca logs enteros. Los comandos largos van en segundo plano.
5. **Sin trabajo duplicado.** El coordinador no relee lo que un agente ya resumió, ni vuelve a medir lo que QA midió.
6. **Esfuerzo por rol.** `effort` en el frontmatter: scout y QA `low`, builder `medium`, engineer `high`. No se sube sin motivo escrito en el encargo.
7. **Lotes.** Varias tareas S del mismo área se juntan en un encargo de `dev-builder`; varias verificaciones en una sola pasada de `dev-qa`.
8. **Registro.** Al cerrar cada paquete (de cualquier workflow), una fila en [LEDGER.md](./LEDGER.md) con los tokens y la duración que da la notificación de cada agente. Si un tipo de paquete sale caro de forma repetida, se ajusta el enrutado.

## 4. Plantilla de encargo

```
T-XX — <título>            Agente: <nombre>   Modelo: <opus|sonnet|haiku>
Worktree / puerto: <ruta> · <puerto>   (o «main, sin servidor»)
Objetivo: <qué debe pasar, observable>
Contexto: <≤ 5 líneas que el agente no tenga que buscar: mapa del scout, decisiones>
Lee SOLO: <archivos y rangos>
Archivos propios: <lista>   Prohibidos: <lista>
Criterio de aceptación: <medible>
Verificación propia: <build + lo barato>
Entrega: informe §5
```

## 5. Informes

Agente:
```
T-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Decisiones propias: <solo no triviales>
Medidas: <lo que pidió el encargo>
Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```

Scout:
```
Mapa T-XX
<archivo:línea — qué hay ahí> (≤ 12 líneas)
Flujo: <1–3 líneas>
Archivos que tocaría el cambio: <lista>   Riesgos: <1–2 líneas>
```

## 6. Reglas de código

Las de [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md) para cualquier cosa que toque juego o pintado. Constantes de juego en `src/game/constants.ts`, visuales en `src/game/render/artSpec.ts`. Comentarios en español sin comentar lo obvio. Archivos ≤ 500 líneas. Sin dependencias nuevas sin consultar. nipplejs y `.openclaw/` no se tocan. Nunca `git stash` a secas ni matar procesos por PID. Commits `dev(T-XX): ...` sin líneas de autoría ni coautoría; las ramas `dev/*` no se suben.
