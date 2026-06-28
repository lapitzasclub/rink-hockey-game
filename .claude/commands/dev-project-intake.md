---
name: dev-project-intake
description: Analiza un proyecto al abrirlo o retomarlo y genera una ficha de entrada útil y segura. Identifica stack, scripts, documentación, memoria de agentes, arquitectura básica, zonas sensibles y próximos pasos recomendados sin modificar nada.
---

# dev-project-intake

## Propósito

Esta skill sirve para hacer una lectura inicial de un proyecto cuando se abre por primera vez o cuando se retoma tras una pausa.

Su objetivo es generar una ficha de entrada clara, útil y segura, sin modificar archivos ni ejecutar acciones invasivas. Debe ayudar a entender rápidamente qué tipo de proyecto es, cómo está organizado, qué documentación conviene leer primero, qué memoria de agentes existe, qué comandos parecen relevantes y qué zonas requieren más cuidado.

No debe implementar cambios, ni preparar commits, ni instalar dependencias, ni tocar configuraciones sensibles. Su rol es diagnóstico y orientación.

---

## Relación con `dev-safety-guardrails`

Esta skill debe operar respetando siempre los límites definidos por `dev-safety-guardrails`.

Eso implica, entre otras cosas:

- no abrir secretos ni credenciales
- no modificar `.claude/settings.local.json`
- no tocar `.env*`, backups, CI/CD, signing o despliegues
- no hacer `git add .`
- no hacer commits automáticos
- no hacer `git push`
- no instalar dependencias
- no borrar contenido
- no asumir permiso para leer o tocar zonas sensibles sin necesidad real

Si durante el análisis aparece una posible zona sensible, debe señalarse con cautela y de forma genérica.

---

## Resultado esperado

La salida de esta skill debería ser una ficha estructurada del proyecto que incluya, cuando sea posible:

- tipo de proyecto
- stack principal
- herramientas detectadas
- scripts o comandos disponibles
- documentación clave
- memoria de agentes detectada
- arquitectura básica observable
- carpetas relevantes
- zonas sensibles o delicadas
- lagunas de documentación
- orden recomendado de lectura
- próximos pasos seguros sugeridos

La skill debe ser útil tanto para un humano como para otro agente que retome el trabajo.

---

## Alcance

Usar esta skill para leer y analizar de forma segura:

- repos personales de desarrollo
- proyectos frontend o fullstack ligeros
- apps con React, TypeScript, Vite, Capacitor o PWA
- proyectos con Cloudflare o despliegues web
- proyectos Godot
- proyectos web clásicos
- repos con memoria de agentes o documentación viva

---

## Límites operativos

Esta skill es solo de lectura y análisis.

No debe:

- crear archivos
- modificar archivos
- instalar dependencias
- ejecutar acciones destructivas
- preparar cambios en Git
- hacer `git add`
- hacer commits
- hacer `git push`
- publicar ni desplegar nada
- ejecutar builds por defecto
- ejecutar tests por defecto
- alterar configuraciones locales
- reescribir memoria de agentes
- abrir secretos, certificados, credenciales o materiales de signing

Si el usuario quiere pasar del análisis a la acción, eso debe ocurrir en una tarea posterior o mediante otra skill más específica.

---

## Reglas de exploración

### Exploración proporcional

La exploración debe ser proporcional al objetivo y al tamaño del repositorio.

Por tanto:

- no listar árboles completos del repo si es grande
- no volcar listados enormes de carpetas
- priorizar una vista resumida y útil
- profundizar solo en carpetas relevantes para el objetivo
- evitar ruido estructural que no ayude a entender el proyecto
- si el repo es grande, resumir primero y luego ampliar solo donde haga falta

La meta no es demostrar que se ha visto todo, sino orientar bien con el mínimo contexto necesario.

---

## Qué debe buscar

### 1) Identidad básica del proyecto

Identificar, cuando sea posible:

- nombre del proyecto
- propósito aparente
- tipo de aplicación o herramienta
- nivel de madurez aparente
- si parece proyecto principal, prototipo, experimento o legado

Fuentes típicas:

- `README.md`
- `package.json`
- `setup.py`
- `project.godot`
- nombres de carpetas
- estructura visible del repo

---

### 2) Stack y herramientas

Detectar stack principal y herramientas asociadas, por ejemplo:

- React
- TypeScript
- JavaScript
- Vite
- Capacitor
- PWA
- Cloudflare
- Node.js
- Python
- Godot
- Webpack
- Tailwind
- Astro
- Docker
- otras señales visibles del proyecto

No hace falta adivinar. Si algo es incierto, marcarlo como aparente o probable.

---

### 3) Scripts, comandos y entrypoints

Buscar comandos y puntos de entrada relevantes, como:

- scripts de `package.json`
- comandos documentados en `README.md` o `CLAUDE.md`
- binarios o scripts de arranque
- carpetas `src/`, `www/`, `functions/`, `android/`, `public/`, `dist/`
- escenas principales en Godot
- módulos o servicios principales

La skill debe resumir comandos útiles, pero no ejecutarlos salvo necesidad mínima y segura para inspección estructural.

---

### 4) Documentación clave

Detectar documentación importante y proponer un orden de lectura.

Prioridad habitual, si existe y es relevante:

1. `README.md`
2. `CLAUDE.md`
3. `AGENTS.md`
4. `ARCHITECTURE.md`
5. `docs/`
6. otras guías operativas o de release no sensibles

Si hay varias fuentes de verdad:

- señalarlo
- indicar cuál parece más actual o más autoritativa solo si eso es evidente por el propio contenido
- no inventar una jerarquía si no está clara

---

### 5) Memoria de agentes y continuidad

Detectar si existe memoria o contexto de continuidad, como:

- `CLAUDE.md`
- `AGENTS.md`
- `.copilot/`
- `.claude/`
- `memory/`
- worklogs
- roadmap
- next-steps
- architecture notes

Regla de lectura:

- se permite leer `CLAUDE.md`, `AGENTS.md`, `README.md`, `ARCHITECTURE.md` y `docs/` si son relevantes
- `.claude/`, `.copilot/` y `memory/` solo deben leerse si la tarea lo requiere de verdad
- no deben reescribirse ni consolidarse
- no debe mostrarse contenido sensible o local por error

Si existe memoria operativa, la skill debe indicar:

- que existe
- dónde está de forma general o concreta si no es sensible
- si parece activa, histórica o parcial
- si conviene leerla para retomar trabajo

---

### 6) Arquitectura básica observable

Resumir arquitectura visible sin sobreafirmar.

Por ejemplo:

- SPA web
- app híbrida con target Android
- frontend estático con backend proxy
- librería
- prototipo Godot
- app con funciones serverless
- proyecto modular o monolítico

También conviene señalar:

- carpetas núcleo
- rutas que parecen entrypoints
- separación entre UI, lógica, datos, servicios, runtime o despliegue
- si existe arquitectura dual o varios targets

---

### 7) Conflictos entre fuentes de verdad

Si `README.md`, `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/` u otras memorias parecen contradecirse, debe indicarse como posible conflicto.

En ese caso:

- no resolver la contradicción inventando una jerarquía
- no asumir que el archivo más visible es automáticamente el correcto
- señalar qué documentos parecen entrar en conflicto
- explicar brevemente sobre qué aspecto parece existir contradicción
- recomendar qué revisar manualmente antes de tomar decisiones

La skill debe ayudar a detectar contradicciones, no ocultarlas.

---

### 8) Zonas sensibles o delicadas

La skill debe detectar y señalar con prudencia zonas que no conviene tocar sin necesidad.

Ejemplos:

- `.env*`
- `.claude/settings.local.json`
- `.claude/`
- `.copilot/`
- `memory/`
- `backups/`
- CI/CD
- signing móvil
- despliegues
- outputs generados
- configuraciones locales
- scripts del sistema o del host

No debe abrirlas salvo necesidad clara y compatible con las reglas de seguridad.

---

### 9) Higiene general y observaciones

Sin hacer cambios, puede observar señales como:

- documentación abundante o escasa
- memoria bien cuidada o fragmentada
- mezcla entre código fuente y temporales
- artefactos generados presentes
- estructura limpia o caótica
- posible acoplamiento a entorno local
- convenciones aparentes del repo

Estas observaciones deben ser prudentes y útiles, no dogmáticas.

---

## Qué no debe hacer

No debe:

- editar ningún archivo
- crear `SKILL.md`, notas o resúmenes persistidos
- instalar dependencias
- ejecutar builds por defecto
- ejecutar tests por defecto
- tocar Git de ninguna forma
- leer secretos
- abrir materiales de signing
- tocar CI/CD
- tocar configuración de despliegue
- tocar backups o memoria operativa salvo lectura estrictamente necesaria
- convertir una lectura inicial en una auditoría profunda no pedida

---

## Estrategia de lectura recomendada

Cuando esta skill se use, conviene seguir un orden parecido a este:

1. identificar estructura básica del repo
2. localizar README y documentación principal
3. detectar stack y scripts
4. localizar memoria de agentes relevante
5. resumir arquitectura básica visible
6. señalar zonas sensibles
7. proponer orden de lectura
8. proponer próximos pasos seguros

La clave es minimizar ruido y maximizar orientación útil.

---

## Formato de salida recomendado

La respuesta debería organizarse, cuando sea posible, en secciones como estas:

- Ficha rápida
- Resumen del proyecto
- Stack detectado
- Scripts o comandos útiles
- Documentación clave
- Memoria de agentes detectada
- Arquitectura básica
- Carpetas relevantes
- Zonas sensibles o delicadas
- Qué leer primero
- Próximos pasos seguros

Si hay incertidumbre, decirlo claramente.

---

## Ficha rápida

La salida debe incluir obligatoriamente una sección compacta llamada `Ficha rápida`, situada al inicio o al final.

Debe resumir, si es posible:

- Proyecto
- Tipo
- Stack
- Comandos principales
- Docs clave
- Memoria de agentes
- Zonas sensibles
- Siguiente paso recomendado

Si falta información, indicarlo sin inventarla.

---

## Próximos pasos seguros que puede sugerir

Esta skill puede recomendar cosas como:

- leer `CLAUDE.md` antes de editar
- revisar `ARCHITECTURE.md`
- inspeccionar `package.json`
- revisar `docs/` relevantes
- aclarar qué fuente de verdad manda
- hacer una auditoría posterior de worktree
- preparar una sesión de continuidad
- pedir permiso antes de entrar en memoria de agentes más profunda
- usar una skill más específica para edición o refactor

No debe sugerir automatismos peligrosos.

---

## Cuándo usar esta skill

Usarla cuando:

- se abre un repo por primera vez
- se retoma un proyecto tras días o semanas
- no está claro qué tecnología usa el proyecto
- hay varias fuentes de documentación y conviene orientarse
- existe memoria de agentes y hace falta saber si leerla
- se quiere una ficha inicial antes de editar nada
- un agente nuevo necesita entender rápido el proyecto sin tocarlo

---

## Cuándo no usar esta skill

No usarla como skill principal cuando:

- ya se conoce muy bien el proyecto y la tarea es directamente de edición
- el usuario quiere implementar cambios concretos de inmediato
- hace falta una auditoría profunda de seguridad o versionado
- la tarea real es refactorizar, desplegar, corregir bugs o escribir código
- la pregunta es puramente conceptual y no requiere inspección del repo
- el usuario ya ha pedido expresamente entrar a memoria sensible o a configuración local y hace falta una skill más específica

---

## Señales de escalado

Si durante el análisis aparece la necesidad de:

- editar archivos
- instalar dependencias
- ejecutar build o test
- tocar despliegues
- revisar CI/CD
- abrir memoria de agentes profunda
- inspeccionar configuración local
- entrar en zonas de signing o credenciales

entonces esta skill debe detenerse en el análisis y recomendar confirmación explícita o una skill posterior más especializada.

---

## Criterio de calidad

Una buena ejecución de esta skill:

- ahorra tiempo de reentrada
- no inventa arquitectura
- no sobrelee zonas sensibles
- identifica bien el stack
- detecta la documentación importante
- no convierte contexto local en conocimiento público
- deja claro qué se sabe, qué no y qué conviene leer después

---

## Regla final

Si esta skill duda entre:

- seguir explorando más
- o parar y pedir contexto/confirmación

debe preferir la opción más segura y menos invasiva.
