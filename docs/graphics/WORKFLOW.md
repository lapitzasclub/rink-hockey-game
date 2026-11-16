# Workflow gráfico — coordinación por agentes

Cómo se ejecuta la renovación gráfica del juego con agentes baratos y un coordinador que evalúa.
Documentos hermanos:

- [AUDIT.md](./AUDIT.md): qué está mal y por qué.
- [SPEC.md](./SPEC.md): biblia de arte con medidas reales, cámara, equipamiento, patinaje, stick y oficiales.
- [BACKLOG.md](./BACKLOG.md): paquetes de trabajo (WP) con estado, dependencias, archivos y criterios.

## 1. Principios de coste

1. **El coordinador no programa.** Fable (sesión principal) lee informes cortos y las capturas de §6 (una general y el detalle de cada elemento), decide y despacha. Ahorrar en capturas nunca justifica aceptar algo que no se ha visto de cerca. Todo el código lo escriben los agentes `gfx-*`.
2. **El modelo más barato que pueda hacerlo**:
   - Opus solo para matemática de cámara, rig y animación.
   - Sonnet para escenario, props, oficiales y HUD.
   - Haiku para build, capturas, checklist y papeleo.
3. **Contexto mínimo por agente.** El encargo trae todo lo necesario. El agente lee solo:
   - su encargo;
   - las secciones de SPEC que el encargo cite;
   - los archivos listados en el encargo.

   Nunca lee AGENTS.md entero, ni AUDIT ni BACKLOG enteros.
4. **Capturas headless, no navegador interactivo.**
   - `tools/gfx-shot.ps1` hace la captura y vuelca la consola en un solo comando, sin herramientas de navegador.
   - Los agentes de código no usan las herramientas `mcp__claude-in-chrome__*`.
5. **Informes ≤ 20 líneas** con formato fijo (§5). Si algo no cabe, va a un archivo y el informe lo enlaza.
6. **Máximo 2 rondas de cambios** por WP con el mismo agente (`SendMessage`, conserva su contexto). A la tercera, el coordinador replantea el encargo o sube de modelo.
7. **Nada de subagentes anidados.** Los `gfx-*` no tienen la herramienta Agent.

## 2. Roles

| Rol | Dónde | Modelo / esfuerzo | Hace | No hace |
|---|---|---|---|---|
| Coordinador | sesión principal (`/gfx`) | Fable | Elegir WP, redactar encargo, veredicto, gates, integrar en `MatchScene.ts` vía agente | Escribir código, leer archivos fuente enteros |
| `gfx-engineer` | `.claude/agents/gfx-engineer.md` | opus · high | Cámara (WP-10), estilo (WP-20), rig y animación (WP-30…33) | Escenario, papeleo |
| `gfx-builder` | `.claude/agents/gfx-builder.md` | sonnet · medium | Lab (WP-00), escenario, porterías, vallas, oficiales, banquillos, HUD, luz | Cambiar la cámara o la física sin encargo |
| `gfx-qa` | `.claude/agents/gfx-qa.md` | haiku · low | `npm run build`, capturas, revisión de consola, checklist DoD, estado en BACKLOG, entrada en AGENTS.md | Editar `src/` |
| Usuario | — | — | Gate B (estilo), decisiones D1–D7, autorizar commits | — |

> **Importante:** los agentes de `.claude/agents/` se cargan al arrancar Claude Code. Tras crearlos o editarlos hay que reiniciar la sesión (o comprobar con `/agents`).
>
> Además, al despachar, el coordinador pasa siempre `model` explícito (`opus`/`sonnet`/`haiku`). Si el tipo `gfx-*` no estuviera cargado, el trabajo no cae en el modelo caro de la sesión.

## 3. Ciclo por WP

```
/gfx next
 └─ 1. Coordinador: elige el WP listo (dependencias ✅, ningún conflicto de archivos con WPs en curso)
 └─ 2. Coordinador: redacta el encargo con la plantilla §4 copiando el bloque del WP de BACKLOG
 └─ 3. Agent(subagent_type=gfx-<rol>, model=<tier>, prompt=encargo)          → informe §5
 └─ 4. Agent(subagent_type=gfx-qa, model=haiku): build + capturas + checklist → informe QA
 └─ 5. Coordinador: lee ambos informes + ≤3 capturas → veredicto
        ACEPTADO   → gfx-qa marca ✅ en BACKLOG y añade línea al work log de AGENTS.md
                     (+ commit si D6 está autorizado)
        CAMBIOS    → SendMessage al MISMO agente con lista numerada (máx. 2 rondas)
        RECHAZADO  → se revierte el WP y se reescribe el encargo (o se sube de modelo)
```

Reglas de paralelismo:

- Solo puede haber WPs en paralelo si sus **archivos propios** (tabla de BACKLOG) no se solapan.
- **`MatchScene.ts` es un recurso serializado:** solo un WP activo a la vez puede tocarlo, y el encargo dice exactamente qué enganches añadir.
- **Integrar en `main` cuanto antes.** Un WP solo se hace directamente en `main`. En paralelo, cada WP aceptado se integra en `main` en el acto, sin esperar al resto de la tanda.
- En paralelo, cada agente trabaja en un **worktree creado a mano desde `main` local**:
  - `git worktree add -b gfx/wp-XX .claude/worktrees/wp-XX main`;
  - se despacha **sin** `isolation`, con la ruta absoluta en el encargo;
  - el encargo exige que `git log --oneline -1` muestre el último commit de `main`.
  - **No uses `isolation: "worktree"` del Agent:** crea el worktree desde `origin/main`, que puede ir por detrás del `main` local (pasó en la sesión 24).
  - `node_modules` no hace falta: Node lo resuelve desde el repo principal subiendo de carpeta. **Nunca crees uniones**, porque al borrar el worktree se puede llevar por delante el `node_modules` real.
  - `.claude/worktrees/` va en `.git/info/exclude`.
- **Integración:**
  1. commit `wip` en la rama del worktree;
  2. si `main` ha avanzado y el WP lo necesita para verificarse, `git rebase main`;
  3. en `main`: `git cherry-pick -n gfx/wp-XX`, papeleo y commit `gfx(WP-XX): ...`;
  4. `git worktree remove` y `git branch -D`.
- **Servidor dev por worktree:** `npx vite --port 517X --strictPort`. Los puertos 5173 y 5174 pueden estar ocupados por otros proyectos. Vite escucha en IPv6, así que se captura con `-BaseUrl 'http://[::1]:517X/'`.
  - `vite.config.ts` hace que el servidor de `main` ignore `.claude/`. Sin eso, un `npm run build` dentro de un worktree bloquea `dist/` y tumba el watcher con EBUSY.
- Requiere D5 y D6. Sin D6, se trabaja **en secuencia** sobre el árbol de trabajo principal.

## 4. Plantilla de encargo (la rellena el coordinador)

```
WP-XX — <título>            Rol: gfx-<rol>   Modelo: <tier>
Objetivo: <1–3 frases, resultado visible>
Lee SOLO: docs/graphics/SPEC.md §<n>, §<m>; <archivos fuente concretos con rango de líneas si es grande>
Archivos propios (puedes editar): <lista>
Archivos prohibidos: src/game/systems/{physics,ball,rules,...}.ts salvo que se indique; MatchScene.ts salvo enganches listados
Enganches en MatchScene.ts permitidos: <lista exacta o "ninguno">
Constantes: gameplay en src/game/constants.ts; dimensiones visuales en src/game/render/artSpec.ts
Criterios de aceptación: <copiar de BACKLOG>
Capturas: tools/gfx-shot.ps1 -Set <set> -Dir docs/graphics/shots/WP-XX/after
Contexto de decisiones: <D1..D7 resueltas que afecten>
Entrega: informe con el formato de §5.
```

## 5. Formato de informe (todos los agentes)

```
WP-XX · <ESTADO: HECHO | BLOQUEADO | PARCIAL>
Cambios: <archivo — qué, 1 línea por archivo>
Decisiones propias: <solo las no triviales>
Desviaciones del encargo: <o "ninguna">
Build: <ok / error resumido>   Consola: <0 errores / lista corta>
Capturas: <rutas>
Riesgos / pendientes: <máx. 3 líneas>
```

## 6. Revisión del coordinador

**Listón de calidad (2026-11-16).** Cumplir los criterios no basta: la pregunta es si el elemento se vería bien en un juego indie publicado. Se compara con la calidad de los jugadores (rig, sombreado y contorno), no con lo que había antes. Lo que no pasa vuelve con cambios, aunque cumpla la letra del encargo.

El usuario rechazó las gradas, los banquillos y la mesa (WP-43, WP-51, WP-52) después de que yo los aceptara: los había juzgado en capturas de pista entera, donde ocupan pocos píxeles.

**Capturas para revisar:**

- Una vista general (`reglamento` o `arcade`) para comprobar la escala y la legibilidad.
- **Al menos una captura de detalle por elemento**, con zoom ≥ 2 y dentro del partido (`lab=match&zoom=&cx=&cy=`): gradas cercanas, gradas lejanas, banquillo, mesa, portería, árbitro…
- En los elementos con animación o reacción, una captura justo después del evento (`at=goal|foul|card`).

El tope deja de ser 3 por WP y pasa a ser 3 por elemento. Las capturas de pista entera sirven para ver la escala, no para dar por buena la calidad.

Comprueba:

1. **Criterios de aceptación** del WP, punto por punto, **y el listón de calidad** en las capturas de detalle.
2. **Contrato de cámara** (SPEC §2): pies en el suelo, escala coherente con la profundidad, sin flotar ni hundirse.
3. **Legibilidad en juego:**
   - los equipos se distinguen;
   - la bola se ve siempre;
   - nada tapa la jugada (la valla cercana usa el corte de SPEC §3).
4. **Sin regresiones:** las capturas `arcade` y `reglamento` siguen siendo jugables a la vista, y el HUD no se solapa.
5. **Coste:** si el informe dice PARCIAL o hay > 2 rondas, se replantea el encargo antes de seguir gastando.

Si una diferencia visual es dudosa, el coordinador pide al QA una captura concreta (`-Query`) en lugar de mirar más.

## 7. Gates

| Gate | Tras | Quién | Qué se aprueba | Evidencia |
|---|---|---|---|---|
| **A — Perspectiva** | WP-10, WP-11 | Coordinador | Una sola cámara; escalas coherentes jugador ↔ banquillo ↔ gradas ↔ valla ↔ portería | `scale.jpg`, `rink.jpg`, `reglamento.jpg` |
| **B — Estilo** | WP-20 | **Usuario** (D1) | Uno de los 3 prototipos de estilo | `style.jpg` + abrir `?lab=style` en el navegador |
| **C — Personajes** | WP-30…34 | Coordinador + usuario | Rig, patinaje quad, stick a dos manos, portero | `players.jpg`, `strip.jpg`; el usuario lo prueba en vivo (`?lab=players&anim=1`) |
| **Final** | todo | Coordinador + usuario | Partido completo en ambos modos, móvil y rendimiento | set `standard` + informes WP-62/63 |

El coordinador **no** salta un gate. Lo que depende de él espera.

## 8. Capturas

- Comando: `powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-shot.ps1 ...`
  - `-Set <standard|camera|players|rink|officials|style> -Dir docs/graphics/shots/WP-XX/after`
  - o `-Query "lab=goal&zoom=3" -Out docs/graphics/shots/WP-XX/after/goal-zoom.jpg`
- Requiere el servidor de desarrollo (`npm run dev`). Si el puerto 5173 está ocupado por otro proyecto, se arranca Vite en otro puerto y se pasa `-BaseUrl http://127.0.0.1:<puerto>/`.
- Cada captura deja un `.console.txt` al lado. QA reporta las líneas con `error` o `Uncaught`.
- **Partido de humo** (WP-64), obligatorio en WPs que tocan juego (física, IA, reglas, portería, constantes o dimensiones): `powershell -NoProfile -ExecutionPolicy Bypass -File tools/gfx-smoke.ps1 -Mode <reglamento|arcade> -SmokeMs 240000 -Runs 20 -BaseUrl http://127.0.0.1:<puerto>/`, 20 corridas por modo comparadas con la referencia de BACKLOG §WP-64. Tarda unos 6 s por corrida. El ruido entre partidos es grande (en reglamento, de 2 a 6 goles por partido con la misma versión), así que se compara media ± IC 95 % y solo cuenta una diferencia cuyos intervalos no se solapan. Puede correrlo `gfx-qa` (haiku) o un script en segundo plano.
- **Detalle y eventos dentro del partido** (WP-66). En `lab=match` (`mode=reglamento|arcade`):
  - `zoom`, `cx`, `cy` (cx/cy en mundo, pista 70..1210 × 60..660) colocan y **bloquean** la cámara principal; la de UI no cambia.
  - `follow=ball|referee|goalie-blue|goalie-red` centra la cámara en ese objeto al congelar (`referee` cae a `ball` si no hay árbitros).
  - `at=goal|foul|card|save|<ms>` con `auto=1`: la simulación avanza a paso fijo hasta el evento, sigue `after` ms (por defecto 400) y congela. Deja `[at] <evento> t=<ms>` en consola, o `[at] timeout` si no ocurre en 180 s de juego. Con `at=` el script sube el tiempo virtual a 60 s (`-WaitMs` lo fuerza). La semilla es fija (`seed=` la cambia), así que el evento es repetible.
  - `hud=0` oculta el marcador. Sin `at`, `freeze=<ms>` congela por tiempo real como antes.
  - Set `-Set detail -Dir docs/graphics/shots/WP-XX/after`: `stands-near`, `stands-far`, `stands-side`, `bench-blue`, `bench-red`, `table`, `goal-left`, `goal-right`, `referee`, `goal-reaction`, `foul-gesture`. Los encuadres están en `$Shots` de `tools/gfx-shot.ps1`.
  - Ejemplo: `-Query "lab=match&mode=reglamento&auto=1&at=foul&follow=referee&zoom=3" -Out docs/graphics/shots/WP-XX/after/foul.jpg`.
  - **Regla (§6):** cada elemento nuevo se revisa de cerca con este set y cada reacción justo después de su evento; no basta la pista entera.
- **No hay carpeta `before/`:** el "antes" de un WP es el `after/` del WP anterior que tocó lo mismo, o `shots/baseline/`. Así no se duplican capturas.
- Solo se versionan los `after/` de WPs aceptados (JPG, ~50–150 KB).
- Las escenas `lab=...` las crea el WP-00. Hasta entonces, el script captura el menú.

## 9. Pre-flight (antes del primer `/gfx`)

1. **Reiniciar Claude Code** (o abrir `/agents`) y comprobar que aparecen `gfx-engineer`, `gfx-builder` y `gfx-qa`.
2. **Trabajo sin commitear:** las sesiones 21–22 (modo arcade, pabellón) están sin commitear.
   - Los worktrees se crean a mano desde `main` (§3), así que hay que commitearlas antes de cualquier trabajo en paralelo.
   - Lo decide el usuario (D5).
3. **Servidor de desarrollo** arrancado y `tools/gfx-shot.ps1 -Query "" -Out <tmp>.jpg` devuelve imagen.
4. Decisiones D1–D7 de BACKLOG revisadas (al menos D2, D5, D6 y D7 antes de empezar; D1 y D4 llegan en el Gate B).
5. El coordinador corre en **Fable** (`/model`). Los agentes usan su propio modelo.

## 10. Definition of Done (lo verifica `gfx-qa`)

- [ ] `npm run build` pasa (tsc + vite).
- [ ] 0 errores nuevos en los `.console.txt` de las capturas del WP.
- [ ] Capturas del set indicado en `docs/graphics/shots/WP-XX/after/`.
- [ ] Física y reglas intactas, salvo que el encargo diga lo contrario: no se tocan `physics`, `ball`, `rules` ni constantes de gameplay.
- [ ] Constantes visuales en `artSpec.ts`; las de gameplay, en `constants.ts`; nada mágico inline repetido.
- [ ] Comentarios en español según la convención de AGENTS.md, sin comentar lo obvio.
- [ ] Sin dependencias nuevas. nipplejs intacto.
- [ ] Archivo nuevo o modificado > 500 líneas → se señala en riesgos para dividirlo.
- [ ] BACKLOG actualizado (estado y fecha) y una línea en el work log de AGENTS.md: `- WP-XX: <qué>` dentro de la entrada de sesión del día.

## 11. Commits (solo si el usuario autoriza D6)

- Un commit por WP aceptado, mensaje `gfx(WP-XX): <resumen en español>`.
- **Sin líneas de autoría ni coautoría**, sin `Co-Authored-By`, sin «Generated with». Lo manda la regla global del usuario.
- Push: solo de `main`, justo después de cada integración con build ok (`git push origin main`; Cloudflare publica desde `main`, pedido por el usuario el 2026-11-16). Nunca push de ramas `gfx/wp-XX`.
