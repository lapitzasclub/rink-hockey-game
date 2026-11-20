# Workflow de lanzamientos: penalti y libre directo en tercera persona

Cómo se construye la escena cercana de los lanzamientos a puerta (penalti y libre directo): un mano a mano en el que el lanzador puede patinar con la bola hacia la portería (D-07), con la cámara detrás de él, apuntado, fuerza y efecto durante el trayecto, y figuras con más detalle. Lo coordina `/lanz`.
Documentos hermanos:

- [BACKLOG.md](./BACKLOG.md): decisiones D-XX y paquetes L-XX con objetivo, archivos, aceptación y estado.
- [shots/](./shots/): capturas por paquete (`L-XX/before|after/`). [batch/](./batch/): lotes de lanzamientos en bruto (`[sp-agg] {json}`).
- Reglas de cualquier cambio: [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md). Dificultad: [../balance/WORKFLOW.md §7](../balance/WORKFLOW.md). Biblia de arte: [../graphics/SPEC.md](../graphics/SPEC.md).

**Pedido del usuario (2026-11-20):** «cambiar la mecánica de los penaltis y los tiros directos, donde se vea una cámara en tercera persona y se pueda afinar el apuntado, la fuerza del tiro y el efecto durante el trayecto del lanzamiento, como en el FIFA. Como la cámara es más cercana necesitaremos modelos más detallados en estas escenas».

## 1. Arquitectura objetivo

Hoy el lanzamiento vive en `systems/matchFlow.ts` (`updateFoulRestartState`) y `MatchScene.updateFoulRestartState` (flecha punteada en la pista y carga del tiro). La bola es 2D (sin altura). La escena nueva se aísla en un módulo propio para que cada agente lea pocos archivos y `MatchScene.ts` (1600 líneas) solo gane un enganche.

```
src/game/setpiece/
  types.ts      SetPieceRequest (quién tira, tipo, lado, dificultad, control) y SetPieceResult (gol | parada | palo | fuera, y bola y velocidad al devolver)
  sim.ts        simulación pura a 60 Hz: bola 3D (x, y, z, giro), efecto, palos, larguero, red y portero; sin Phaser
  input.ts      fases apuntar → cargar → efecto en vuelo, para teclado, mando y táctil (nipplejs sin migrar)
  ai.ts         lanzador y portero de la IA por nivel (lo escribe ai-engineer)
  view.ts       cámara en tercera persona propia (proyección de setpiece, misma forma que viewTransform) y transición
  scene.ts      SetPieceScene: pinta la escena cercana encima del partido y devuelve el resultado
src/game/render/setpiece/
  backdrop.ts   portería, red, valla y grada de fondo vistas de cerca, horneadas por lado y calidad
  closeKit.ts   nivel de detalle cercano del rig (atlas de alta resolución, piezas extra)
```

Contrato con el partido (D-09): el duelo se juega en la simulación del partido; la escena cercana cambia la cámara con una transición continua, añade el detalle y la altura y el efecto de la bola en vuelo, y devuelve el control al acabar el duelo sin parar el juego. `MatchScene` entrega un `SetPieceRequest` cuando el árbitro pita un directo o un penalti y recibe un `SetPieceResult`. Con gol, sigue el flujo de gol de siempre; con parada o palo, la bola vuelve al partido en juego con su posición y velocidad (hay rechace, salvo art. 23.6). En el humo (IA contra IA) y con la opción «clásica», se resuelve con `sim.ts` sin pintar nada: el resultado sale de la misma física que ve la persona.

## 2. Roles y coste

| Rol | Agente | Modelo | Para qué |
|---|---|---|---|
| Coordinador | sesión principal (`/lanz`) | el de la sesión | diagnóstico con `grep`, encargos cerrados, veredicto, integración, arreglos pequeños |
| Motor de la escena | `lanz-engineer` | opus | L-00 prototipo, L-01 simulación, L-02 cámara y enganche, L-04a nivel de detalle del rig, L-07 animación |
| IA del lanzamiento | `ai-engineer` | opus | L-06: lanzador y portero de la IA por nivel; portero humano |
| Arte y UI | `lanz-artist` | sonnet | L-03 HUD y controles, L-04b pintado de piezas, L-05 escenario cercano, L-09 sonido y efectos |
| Barrido de números | `bal-tuner` | sonnet | L-08: tablas `SETPIECE_*` de `constants.ts` contra el lote de lanzamientos |
| Medida y papeleo | `lanz-qa` | haiku | build, capturas, lotes, humo, banco, estado en BACKLOG y Work log |

Reglas de gasto:

- **El coordinador diagnostica antes de despachar.** El encargo lista los archivos y rangos exactos. Ningún agente explora el repo ni lee AGENTS.md entero.
- **Opus solo para lógica nueva o delicada** (física, cámara, rig, IA). Pintar piezas, HUD y cableado va en sonnet; ejecutar, comparar y archivar, en haiku.
- **Medir sin partidos.** El lote de lanzamientos (`?lab=setpiece&batch=N`, L-01) resuelve cientos de tiros con entradas sorteadas en segundos y sin pintar. Sustituye al humo de 4 minutos para todo lo que solo toca el lanzamiento. El humo de 20 × 2 modos solo se pasa cuando cambia el enganche con el partido (L-02, L-06 y cierre).
- **Capturas deterministas.** `?lab=setpiece&sp=<fase>&aim=..&power=..&curve=..&seed=..` congela un fotograma concreto. El agente mira como mucho 3 capturas por ronda; el set completo lo saca `lanz-qa`.
- **Los números los lee un script.** El lote imprime media ± IC 95 % con la misma forma que el humo, así que `node tools/bal-compare.mjs <base> <nuevo>` lo compara. Los agentes pegan esa salida.
- **Cribar barato, aceptar caro.** Cribas con `batch=200`; aceptación con `batch=1000` por nivel y control.
- **Máximo 2 rondas de cambios por paquete**, por SendMessage al mismo agente (conserva el contexto y la caché). Si no converge, el coordinador lo replantea.
- **El rendimiento se mide una vez, al cierre** (L-99), salvo que un paquete añada texturas grandes o un efecto caro: entonces solo el perfil `movil-bajo` sobre el laboratorio.
- **Partidos reales del usuario: los justos.** Uno al terminar L-03 (¿se siente bien el control?) y uno al cierre por control (táctil y mando).

## 3. Ciclo de un paquete

```
1. Coordinador: diagnóstico corto y encargo cerrado (§6) → agente en su worktree
2. Agente: implementa, build, lo barato (lote de 200 o 3 capturas) → informe §7
3. lanz-qa: build, set de capturas, lote de aceptación y, si toca el partido, humo 20 × 2 modos
4. Coordinador: ACEPTADO / CAMBIOS (máx. 2) / RECHAZADO, revisando de cerca cada elemento (listón de indie publicado)
5. ACEPTADO → merge a main, build, push a origin main; lanz-qa marca BACKLOG y el Work log de AGENTS.md
```

- Paralelo solo si no comparten archivos: L-03 (UI), L-04b (pintado) y L-05 (escenario) pueden ir a la vez tras L-02. `MatchScene.ts` y `constants.ts` son serializados.
- Worktree manual desde main: `git worktree add .claude/worktrees/<l-xx> -b lanz/<l-xx> main`, junction de `node_modules` (`cmd /c mklink /J node_modules ..\..\..\node_modules` dentro del worktree) y Vite propio: `npx vite --port <p> --strictPort --host 127.0.0.1`. Puertos: 5190 main, 5191 motor, 5192 arte. Nunca 5173 ni 5174.
- No se suben las ramas `lanz/*`. Commits `lanz(L-XX): ...` sin líneas de autoría ni coautoría.

## 4. Medir

```bash
# lote de lanzamientos (L-01): sin pintar, entradas sorteadas; imprime [sp-agg] {json}
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Lab setpiece -Runs 1 -BaseUrl http://127.0.0.1:5190/ -Extra "batch=1000&kind=penalty&diffRed=normal&human=touch" > docs/setpiece/batch/<fecha>-<etiqueta>.txt
node tools/bal-compare.mjs docs/setpiece/batch/<base>.txt docs/setpiece/batch/<nuevo>.txt

# captura de una fase concreta
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 -Query "lab=setpiece&sp=flight&aim=0.7,0.6&power=0.8&curve=-0.5&seed=3" -Out docs/setpiece/shots/L-XX/after/<nombre>.jpg

# humo del partido (solo si cambia el enganche) y banco del cierre
powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode reglamento -SmokeMs 240000 -Runs 20 -BaseUrl ...
node tools/perf-bench.mjs --base <url> --profile movil-bajo --mode reglamento --runs 3
```

(La opción `-Lab` de `gfx-smoke.ps1` la añade L-01; si no encaja, un `tools/sp-batch.ps1` hermano.)

- Métricas del lote, por tipo (penalti, directo), nivel y control: % gol, % parada, % palo, % fuera, y para el portero humano % parada. Más el % de tiros «imposibles» (gol garantizado con cualquier reacción del portero), que debe quedarse bajo.
- Solo cuenta una diferencia cuyos IC 95 % no se solapan. Sin base medida en el mismo árbol no se acepta nada.
- No se edita `src/` del árbol que sirve el Vite mientras mide.

## 5. Reglas

- Las de [../perf/WORKFLOW.md §5](../perf/WORKFLOW.md): la simulación del lanzamiento corre a paso fijo de 60 Hz con `simNow`, nada de juego en el pintado, Graphics estáticos horneados, sin `setColor`/`setStyle` ni formas por fotograma, HUD registrado en `HudLayout`, efectos caros según `render/quality.ts`.
- La escena cercana se ve bien en las tres calidades: lo vistoso se conserva en alta y media; en baja, menos detalle pero sin romper el estilo.
- El atlas cercano se genera al entrar por primera vez en la escena (o en reposo tras el saque inicial), nunca en mitad de un fotograma de juego, y se reutiliza.
- La dificultad no cambia la física: el nivel cambia la reacción y la lectura del portero de la IA, la puntería de su lanzador y las ayudas al humano, nunca la velocidad de la bola ni el efecto máximo.
- El reglamento manda (art. 28–30, resumidos en D-07): portero quieto en la línea hasta el pitido y libre después; el lanzador puede tirar o conducir (en el penalti parte parado; en el directo, con hasta 3 m de carrerilla); no puede pasar; hay rechace tras tocar el portero, la portería o la valla; los demás esperan en el área de la otra mitad. Medidas de portería en [../graphics/REGLAMENTO-MEDIDAS.md](../graphics/REGLAMENTO-MEDIDAS.md).
- Constantes de juego en `src/game/constants.ts` en tablas (`SETPIECE_*`, por nivel y control) para que `bal-tuner` las barra sin leer la lógica; visuales en `src/game/render/artSpec.ts`.
- Comentarios en español, sin comentar lo obvio. Archivos ≤ 500 líneas. Sin dependencias nuevas (D-01: 2.5D en Phaser). nipplejs no se migra; `.openclaw/` no se toca. Nunca `git stash` a secas ni matar procesos por PID.

## 6. Plantilla de encargo

```
L-XX — <título>            Agente: <nombre>   Modelo: <opus|sonnet|haiku>
Worktree / puerto: <ruta> · <puerto>
Objetivo: <qué debe verse o pasar>
Diagnóstico del coordinador: <hipótesis y evidencia en ≤ 5 líneas>
Lee SOLO: docs/setpiece/WORKFLOW.md §1 y §5; <archivos y rangos>; <secciones de SPEC si es arte>
Archivos propios: <lista>   Prohibidos: <lista>
Aceptación: <lote, capturas o humo y el resultado esperado>
Entrega: informe §7
```

## 7. Informe (≤ 20 líneas)

```
L-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Decisiones propias: <solo no triviales>
Desviaciones del encargo: <o "ninguna">
Medidas: <salida de bal-compare recortada / capturas>
Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```
