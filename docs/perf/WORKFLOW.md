# Workflow de rendimiento y pulido

Cómo se optimiza el juego y cómo se evita que vuelva a ir lento. Lo coordina `/perf`.
Documentos hermanos:

- [BACKLOG.md](./BACKLOG.md): paquetes de trabajo (P-XX), estado, medidas y decisiones.
- [bench/](./bench/): resultados en bruto del banco (`[perf-bench] {json}` por perfil y modo).
- La renovación gráfica tiene su propio workflow: [../graphics/WORKFLOW.md](../graphics/WORKFLOW.md). Si un WP gráfico añade algo que se pinta, también cumple las reglas de §5.

## 1. Principios

1. **Medir antes de tocar.** Ninguna optimización se acepta sin un número de antes y otro de después con el mismo perfil (§3). Las impresiones («va más fluido») no cuentan.
2. **El juego no cambia.** Optimizar no altera reglas, física ni equilibrio. Si un cambio toca la simulación, el partido de humo de 20 corridas por modo no puede dar diferencias cuyos IC 95 % no se solapen.
3. **Lo visual tampoco.** Un cambio de render se compara con capturas antes/después (`tools/gfx-shot.ps1`); si se ve distinto, se justifica (p. ej. bordes suavizados al hornear).
4. **Primero lo que más pesa.** Se perfila (§3.3), se ordena por coste y se ataca la cabeza de la lista.
5. **El dispositivo modesto manda.** Los presupuestos de §2 se fijan para el perfil `movil-bajo`; el escritorio sobra.

## 2. Presupuestos

Perfiles de `tools/perf-bench.mjs` (CPU ralentizada con CDP, viewport y DPR de dispositivo):

| Perfil | CPU | Viewport | Representa |
|---|---|---|---|
| `escritorio` | ×1 | 1920×1080 @1 | PC normal |
| `portatil` | ×2 | 1366×768 @1 | portátil modesto |
| `movil` | ×4 | 844×390 @3 | móvil de gama media en apaisado |
| `movil-bajo` | ×6 | 740×360 @2 | móvil de gama baja |
| `--soft` | ×1 | 1280×720 @1 | GPU muy débil (WebGL por software): mide relleno de píxeles |

Presupuestos (mediana de 3 corridas, arcade y reglamento):

| Métrica | `movil` | `movil-bajo` | `escritorio` |
|---|---|---|---|
| fps | al tope del refresco | ≥ 30 | al tope |
| frame p95 | ≤ 1,5 × refresco | ≤ 60 ms | ≤ 1,5 × refresco |
| render (envío a GPU) | ≤ 8 ms | ≤ 18 ms | ≤ 3 ms |
| lógica (simulación + pose) | ≤ 6 ms | ≤ 14 ms | ≤ 2 ms |
| errores de consola | 0 | 0 | 0 |

Invariante: **la velocidad del juego no depende de los fps ni de la resolución** (simulación a paso fijo, §5.1). Se comprueba con `simNow` frente al reloj real (§3.4).

## 3. Herramientas

### 3.1 Banco headless — `tools/perf-bench.mjs`

Requiere `npm run dev`. Abre `?lab=match&mode=<modo>&ai=1&perfMs=<ms>` (IA contra IA en tiempo real con render) y lee `[perf] {json}` de la consola.

```bash
node tools/perf-bench.mjs --base http://127.0.0.1:5173/ --profile movil --mode arcade --runs 3
node tools/perf-bench.mjs --base ... --profile movil-bajo --mode reglamento --runs 3 --json >> docs/perf/bench/<fecha>-<etiqueta>.txt
node tools/perf-bench.mjs --base ... --soft --viewport 1280x720x1 --cpu 1 --runs 2
```

- La última línea es `[perf-bench] {json}` con fps, frame p50/p95/p99, lógica y render (media y p95), tirones/min y errores.
- Usa la GPU real; `--soft` usa SwiftShader. El refresco del equipo pone el tope de fps (en el equipo de desarrollo, 50 Hz).
- **No edites `src/` mientras mide:** la recarga en caliente invalida la corrida (aparece como fps 0 o errores). Tampoco dejes otra pestaña con el juego abierta ni compiles a la vez.
- **Compara alternando.** El ruido entre tandas es grande (térmico del portátil, otros procesos): en la sesión 26 la misma versión dio 47,6 y 19,3 fps en `movil-bajo` con minutos de diferencia. Para decidir, intercala base y nueva en la misma tanda (base, nueva, base, nueva…) y compara por parejas; el render (ms) es más estable que los fps.
- Para comparar contra una versión anterior: worktree de esa versión con su propio Vite en otro puerto (`git worktree add --detach .claude/worktrees/perf-base <commit>` y `npx vite --port 5182 --strictPort`), y la misma batería en los dos.

### 3.2 Panel en vivo — `?perf=1`

Funciona también en producción, para probar en móviles reales: fps, frame p50/p95, lógica, render, tirones, tamaño del lienzo, DPR y calidad en uso. `?perfMs=N` deja el informe en consola. `?quality=alta|media|baja|auto` fuerza la calidad.

### 3.3 Perfil de CPU — trazas

Con el MCP `chrome-devtools`: `emulate` (cpuThrottlingRate 4–6), `performance_start_trace` (`reload: false`), unos segundos de partido, `performance_stop_trace` con `filePath` en el scratchpad. Después:

```bash
node tools/perf-trace.mjs <traza.json.gz> --top 40
```

Da tiempo propio y total por función. Con CPU ralentizada, una hoja trivial con mucho tiempo propio suele ser una pausa del hilo atribuida a lo que corría: fíate de los totales por subsistema (GraphicsWebGLRenderer, ContainerWebGLRenderer, updateVisuals…).

### 3.4 Velocidad de juego

En la consola de un partido (DEV, `window.__game`): durante 5 s reales `scene.simNow` debe avanzar ~5000 ms con cualquier fps ≥ 12. Por debajo de 12 fps el juego se ralentiza a propósito (SIM_MAX_STEPS) en vez de dar saltos.

### 3.5 Equivalencia de juego e imagen

- Humo: `tools/gfx-smoke.ps1 -Mode reglamento|arcade -SmokeMs 240000 -Runs 20 -BaseUrl ...` en la versión nueva y en la base. Solo cuenta una diferencia cuyos IC 95 % no se solapan.
- Capturas: `tools/gfx-shot.ps1 -Query "lab=match&mode=...&freeze=3000&seed=7" -Out ...` en las dos versiones.

## 4. Ciclo por paquete (P-XX)

```
/perf next
 └─ 1. Coordinador: elige el P-XX listo de BACKLOG y redacta el encargo (§6)
 └─ 2. perf-qa (haiku): batería de antes si no hay una de la misma base  → bench/<fecha>-<etiqueta>.txt
 └─ 3. perf-engineer (opus) o perf-builder (sonnet): implementa          → informe §7
 └─ 4. perf-qa (haiku): build, batería de después, humo si toca simulación, capturas antes/después, consola
 └─ 5. Coordinador: compara números y ≤ 3 capturas → ACEPTADO / CAMBIOS (máx. 2 rondas) / RECHAZADO
        ACEPTADO → perf-qa marca ✅ en BACKLOG con los números y añade la línea al work log de AGENTS.md
```

- Un P-XX que no mueve sus métricas objetivo se rechaza aunque «limpie» código.
- Dos P-XX en paralelo solo si sus archivos no se solapan; `MatchScene.ts` es serializado (igual que en el workflow gráfico).
- Las reglas de worktrees, commits y push son las de `docs/graphics/WORKFLOW.md` §3 y §11 (sin líneas de autoría).

## 5. Reglas de rendimiento para todo el desarrollo

Valen para cualquier cambio del juego, no solo para los P-XX. Las revisa `perf-qa` en su checklist.

### 5.1 Simulación

- La física, la IA, las reglas y el reloj del partido avanzan en `MatchScene.stepSimulation` en pasos fijos de `SIM_STEP_MS` (60 Hz). Nada de juego se hace en el pintado.
- Las constantes «por paso» (rozamientos como `PLAYER_FRICTION`, probabilidades de la IA, empujes) están ajustadas a 60 Hz. No se usa el `delta` de Phaser para el juego.
- Las marcas de tiempo del partido se miden con `simNow` (no `this.time.now`, que corre durante las pausas).
- Si un cambio de lógica necesita algo «visual» (como el ángulo del stick para los contactos), se calcula en la simulación (`updateStickAngles`) y el pintado solo lo lee.

### 5.2 Pintado

- `renderFrame` pinta una vez por fotograma con jugadores y bola interpolados entre los dos últimos pasos y con el tiempo visual `vt`. El pintado no modifica el estado del juego.
- Las partículas se emiten por paso de simulación (`emitSteps`) y con `particleDensity()`, nunca «por fotograma».
- **Graphics solo para lo que cambia.** Lo estático se hornea con `bakeGraphics` (render/bake.ts); todo lo que crea `drawRink` se hornea solo. Un Graphics vivo se re-triangula en cada fotograma.
- **Shapes** (`add.circle`, `add.ellipse`, rectángulos con borde) tampoco para lo que se ve siempre: textura generada una vez (ver el anillo de `createPlayer.ts`).
- **Texto:** `setText` solo cuando cambia el contenido; nunca `setColor`/`setStyle`/`setStroke` por fotograma (re-rasterizan el texto aunque no cambie nada).
- Sin asignar objetos ni arrays por fotograma en bucles calientes (rig, visuals, IA).
- **Relleno de píxeles:** cada capa del tamaño de la pantalla cuesta una pasada de GPU, también en sus píxeles transparentes. Las texturas grandes con transparencia se colocan con `addTrimmedImages` (render/bake.ts: solo las tiras de baldosas con contenido); `drawRink` ya lo hace con sus horneados. No se añaden capas a pantalla completa sin medir con `--soft`.
- Los efectos caros respetan la calidad (`qualityTier()`, `particleDensity()`, `crowdAnimated()`).

### 5.3 Pantalla

- Formato siempre apaisado: el lienzo queda entre 4:3 y 2,6:1 (`#game-host`) y lo que sobra lo cubre el pabellón (`ARENA_BOUNDS`).
- El HUD se crea dentro de `withUi` y se registra en `HudLayout` con su esquina; respeta las zonas seguras y, en táctil, no queda debajo del joystick ni de A/B/S.
- Controles táctiles en `vmin` con topes y `env(safe-area-inset-*)`.

## 6. Plantilla de encargo

```
P-XX — <título>            Rol: perf-<engineer|builder>   Modelo: <opus|sonnet>
Objetivo: <métrica y valor objetivo, perfil y modo>
Medida de partida: <líneas del bench de antes>
Lee SOLO: docs/perf/WORKFLOW.md §5; <archivos y rangos>
Archivos propios: <lista>   Prohibidos: reglas, física e IA salvo que el encargo lo diga
Criterios: métricas objetivo; humo sin diferencias (si toca simulación); capturas equivalentes; build; 0 errores
Entrega: informe §7
```

## 7. Informe (todos los agentes, ≤ 20 líneas)

```
P-XX · <HECHO | PARCIAL | BLOQUEADO>
Cambios: <archivo — qué>
Antes → después: <perfil/modo: fps, frame p95, render, lógica>
Humo: <no aplica | sin diferencias (IC) | diferencias: ...>
Capturas: <rutas>   Build: <ok>   Consola: <0 errores>
Riesgos / pendientes: <máx. 3 líneas>
```

## 8. Roles

| Rol | Dónde | Modelo | Hace |
|---|---|---|---|
| Coordinador | sesión principal (`/perf`) | el de la sesión | elige P-XX, encarga, compara números, acepta |
| `perf-engineer` | `.claude/agents/perf-engineer.md` | opus · high | bucle, cámaras, resolución de render, rig, cambios con riesgo |
| `perf-builder` | `.claude/agents/perf-builder.md` | sonnet · medium | horneados, texturas, textos, HUD, CSS, cambios mecánicos |
| `perf-qa` | `.claude/agents/perf-qa.md` | haiku · low | build, banco, humo, capturas, checklist §5, papeleo |

Los agentes de `.claude/agents/` se cargan al arrancar Claude Code: tras crearlos hay que reiniciar la sesión (o mirar `/agents`). Al despachar, pasa siempre `model` explícito.
