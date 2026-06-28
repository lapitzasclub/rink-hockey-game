---
name: dev-safety-guardrails
description: Guardrails de seguridad para skills de desarrollo en un entorno personal con OpenClaw. Úsala antes de analizar, editar, refactorizar o automatizar trabajo sobre repos personales, especialmente cuando existan memorias de agentes, configuraciones locales, artefactos de despliegue, scripts operativos o zonas potencialmente sensibles.
---

# dev-safety-guardrails

## Propósito

Esta skill establece el marco de seguridad mínimo para trabajar sobre proyectos personales de desarrollo en este entorno.

No está pensada para “hacer trabajo” por sí sola, sino para fijar límites y criterio antes de que otras skills o tareas de desarrollo lean, modifiquen, generen o automaticen cambios en repos y herramientas locales.

La prioridad es:

1. evitar exponer secretos o configuraciones sensibles
2. evitar cambios peligrosos o difíciles de revertir
3. mantener control humano sobre acciones con impacto en publicación, sistema, credenciales o datos
4. favorecer cambios pequeños, claros, revisables y coherentes con cada proyecto

---

## Principios operativos

- Trata cada repo como un entorno real, no como un sandbox desechable.
- Trata cada skill como código ejecutable, no como simple documentación.
- Prefiere cambios pequeños, explícitos, reversibles y fáciles de revisar.
- No amplíes el alcance por conveniencia.
- No automatices acciones sensibles solo porque técnicamente sea posible.
- Si una acción afecta a seguridad, publicación, datos, despliegue o configuración local, avisa antes.
- Si hay duda razonable sobre sensibilidad o impacto, pide confirmación.

---

## Alcance típico

Esta skill aplica especialmente cuando el trabajo involucra uno o más de estos contextos:

- repos personales de desarrollo
- múltiples stacks o herramientas locales
- memoria de agentes (`CLAUDE.md`, `AGENTS.md`, `.copilot/`, `.claude/`, `memory/`, `docs/`)
- scripts de automatización
- skills propias
- artefactos de build o despliegue
- configuraciones locales no pensadas para compartirse

---

## Reglas duras

### 1) Secretos, credenciales y material sensible

No leer, copiar, imprimir, resumir ni modificar secretos o materiales sensibles salvo petición explícita y acotada del usuario.

Esto incluye, entre otros:

- `.env*`
- certificados
- claves privadas o públicas de uso sensible
- tokens
- credenciales
- ficheros de secretos
- exportaciones de sesión
- configuraciones con secretos incrustados
- llaveros, keystores o material equivalente

Si aparecen rutas o nombres que sugieren material sensible:

- no abrirlos por defecto
- no mostrarlos en la respuesta
- referirse a ellos solo de forma genérica, salvo que el usuario pida expresamente revisarlos

---

### 2) Configuración local de agentes y herramientas

No modificar configuraciones locales de agentes o herramientas salvo petición explícita del usuario.

En particular:

- no tocar `.claude/settings.local.json`
- no tocar configuraciones locales equivalentes de otros agentes o asistentes
- no asumir que una configuración local es portable o versionable
- no propagar ajustes locales entre repos automáticamente

Si una tarea requiere revisar una configuración local:

- limitarse primero a análisis estructural o advertencias
- pedir confirmación antes de editar

---

### 3) Git y publicación remota

No hacer `git push`.

No hacer commits automáticos.

No crear commits sin intención explícita del usuario o sin una instrucción clara dentro de la tarea.

No asumir que “terminar el trabajo” incluye publicar cambios.

No hacer `git add .` automáticamente.

No preparar todos los cambios de golpe sin revisión.

Si se propone añadir cambios a Git:

- hacerlo solo por rutas concretas
- explicar qué se incluye
- dejar claro qué queda fuera
- permitir revisión humana antes de continuar

Antes de cualquier acción de control de versiones con efecto persistente:

- explicar qué ha cambiado
- dejar claro si hay archivos nuevos, editados o borrados
- permitir revisión humana

---

### 4) Instalación de dependencias o herramientas

No instalar dependencias, paquetes, runtimes, SDKs, CLIs o herramientas sin confirmación explícita.

Esto incluye:

- `npm install`
- `pnpm install`
- `yarn add`
- `pip install`
- gestores del sistema
- plugins de IDE
- herramientas auxiliares de build o despliegue

Primero:

- explicar por qué hace falta
- indicar el alcance esperado
- pedir confirmación

---

### 5) Borrado o destrucción de contenido

No borrar carpetas ni ficheros sin confirmación explícita.

No ejecutar acciones destructivas o difíciles de revertir por defecto.

Esto incluye:

- borrado directo
- limpieza agresiva
- reseteos de árbol de trabajo
- sobrescrituras de outputs sin contexto claro
- cambios masivos no revisados

Si una limpieza parece necesaria:

- proponerla primero
- describir qué se tocaría
- priorizar opciones reversibles

---

### 6) Despliegue, producción y targets sensibles

No modificar despliegues Android, Cloudflare, producción o equivalentes sin confirmación explícita.

Esto incluye:

- configuraciones de release
- scripts de despliegue
- ficheros de publicación
- bindings, workers o funciones en entornos de publicación
- configuraciones nativas con impacto fuera del entorno local
- procesos que puedan terminar en una app desplegada o distribuida

Primero:

- avisar del impacto
- separar análisis de ejecución
- pedir confirmación antes de editar o lanzar acciones de publicación

---

### 7) CI/CD y automatización de pipelines

Cualquier cambio en CI/CD requiere confirmación explícita.

Esto incluye:

- `.github/workflows/`
- `.gitlab-ci.yml`
- `Jenkinsfile`
- scripts de pipeline
- configuración de runners
- configuración de despliegues automáticos
- integración entre build, test, release y publicación

Por defecto:

- se pueden identificar y describir de forma estructural
- no deben editarse sin confirmación explícita
- no debe asumirse que un cambio “solo técnico” en CI/CD es inocuo

---

### 8) Release móvil, signing y configuración nativa sensible

Cualquier cambio en release móvil, signing o configuración nativa sensible requiere confirmación explícita.

Esto incluye:

- keystores
- ficheros de firma
- `google-services.json`
- `android/app/build.gradle`
- `capacitor.config.*`
- configuraciones de release Android
- configuraciones de release iOS
- ajustes de empaquetado, firma o distribución

Por defecto:

- no abrir materiales de signing sensibles
- no editar configuraciones de release sin confirmación
- no asumir que cambios en empaquetado o firma son reversibles sin coste

---

### 9) Backups, memoria operativa y continuidad

No tocar backups ni memoria operativa salvo tarea explícita de auditoría, consolidación o mantenimiento documental.

Esto incluye:

- carpetas `backups/`
- `memory/`
- `.copilot/`
- memorias de agente
- worklogs
- notas de continuidad
- snapshots históricos

Por defecto:

- pueden leerse si la tarea lo requiere y no contienen sensibles evidentes
- no deben reescribirse, limpiarse, moverse ni consolidarse sin una petición explícita

---

### 10) Lectura de memoria de agentes y documentación viva

Se permite leer estas fuentes si son relevantes para la tarea:

- `CLAUDE.md`
- `AGENTS.md`
- `README.md`
- `ARCHITECTURE.md`
- documentación general en `docs/`

`.claude/`, `.copilot/` y `memory/` solo se pueden leer si la tarea lo requiere.

No deben reescribirse sin petición explícita.

Si varias fuentes conviven en un mismo repo:

- priorizar la fuente de verdad más clara y más actual
- señalar posibles solapamientos o contradicciones
- evitar propagar información dudosa como si fuera canónica

---

### 11) Skills como código ejecutable

Trata las skills como piezas de automatización ejecutable y revisable.

Por tanto:

- no asumir que una skill es inocua por ser “solo markdown”
- documentar límites, entradas, exclusiones y riesgos
- evitar instrucciones ambiguas o demasiado abiertas
- preferir responsabilidades únicas y bien definidas
- evitar mezclar desarrollo, despliegue, secretos y operaciones del host en una sola skill

---

## Preferencias de trabajo

### Cambios pequeños y reversibles

Preferir:

- ediciones acotadas
- diffs fáciles de revisar
- pasos incrementales
- validación local antes que automatización agresiva

Evitar:

- refactors masivos innecesarios
- reestructuras globales sin necesidad real
- cambios amplios en varios repos a la vez sin una razón clara

### Mantener el estilo existente

Antes de editar:

- observar el estilo del proyecto
- respetar nomenclatura, organización y tono documental existente
- no imponer una convención ajena si el repo ya tiene una clara
- seguir la fuente de verdad vigente del proyecto cuando exista (`CLAUDE.md`, `AGENTS.md`, `README`, `ARCHITECTURE`, etc.)

### Avisos de impacto

Avisar claramente antes de acciones que puedan afectar:

- seguridad
- datos
- publicación
- despliegue
- configuraciones locales
- memoria operativa
- artefactos compartidos

---

## Zonas a tratar con cautela

Tratar con cautela especial:

- `.env*`
- certificados, claves, tokens y credenciales
- `.claude/`
- `.copilot/`
- `memory/`
- `backups/`
- configuraciones locales de agentes
- artefactos de despliegue Android
- configuraciones Cloudflare
- scripts del sistema o del host
- CI/CD y pipelines
- materiales de release móvil y signing
- ficheros temporales que puedan contener datos reales
- outputs de build o release

La existencia de estas zonas no implica prohibición absoluta, pero sí umbral más alto de revisión y confirmación.

---

## Protocolo de decisión seguro

Cuando una tarea de desarrollo vaya a actuar sobre un repo, seguir este orden mental:

1. identificar el objetivo real de la tarea
2. detectar si hay zonas sensibles implicadas
3. decidir si basta con análisis o hace falta edición
4. reducir el alcance al cambio mínimo útil
5. advertir si hay impacto en seguridad, datos, publicación o config local
6. pedir confirmación si la acción entra en una zona protegida
7. ejecutar cambios pequeños y revisables
8. resumir con claridad qué se tocó y qué no

---

## Regla de salida final cuando haya cambios

Si la tarea termina con cambios propuestos o aplicados, la respuesta final debe indicar de forma clara:

- archivos modificados
- archivos creados
- archivos evitados por sensibilidad
- riesgos detectados
- pruebas o comprobaciones recomendadas

Si no hubo cambios, puede indicarse también de forma breve para evitar ambigüedad.

---

## Ejemplos de uso apropiado

- Antes de crear una nueva skill de desarrollo para un repo personal
- Antes de auditar un proyecto con memorias de agentes y configuración local
- Antes de editar un repo con Android, Cloudflare o targets de publicación
- Antes de revisar si una carpeta debería versionarse o no
- Antes de hacer limpieza o reorganización de estructura
- Antes de proponer automatizaciones sobre varios proyectos
- Antes de tocar CI/CD, release móvil o configuración nativa sensible

---

## Ejemplos de uso no apropiado

- tareas puramente creativas sin acceso a repos ni configuración
- consultas conceptuales de arquitectura sin tocar archivos ni estructura
- trabajo puramente de lectura pública que no interactúa con zonas sensibles
- operaciones ya explícitamente autorizadas y acotadas por el usuario, donde otra skill más específica gobierna mejor el flujo

---

## Salida esperada al aplicar esta skill

Cuando esta skill esté activa, la respuesta o la ejecución debería reflejar:

- alcance claro
- identificación de riesgos
- exclusiones explícitas
- confirmaciones cuando corresponda
- cambios pequeños y justificables
- ausencia de acciones sensibles automáticas
- respeto por la estructura y estilo del proyecto

---

## Criterio de escalado

Si una tarea empieza siendo de desarrollo pero deriva hacia:

- despliegue
- cambios de sistema
- credenciales
- publicación remota
- borrados masivos
- reescritura de memorias o configuraciones locales
- CI/CD
- release móvil o signing

entonces detener la automatización implícita y pasar a confirmación explícita del usuario.

---

## Cierre de ciclo funcional — actualización de roadmap

Al terminar un ciclo funcional, actualizar `memory/roadmap.md` como parte del cierre antes de continuar con otra tarea.

### Qué cuenta como ciclo funcional

- Una feature completa y verificada (funciona end-to-end).
- Una fase marcada como cerrada (todos sus ítems completados).
- Un release etiquetado o commit de release.
- Un refactor significativo que cambia la arquitectura de un sistema.

Pequeñas correcciones o ajustes menores dentro de una feature en curso **no** cuentan como ciclo funcional.

### Qué actualizar en el roadmap

1. Marcar como `✅ COMPLETADO` la fase o ítem recién cerrado, con una línea de fecha si aplica.
2. Si se descubrieron nuevos pendientes durante el ciclo, añadirlos a la fase correspondiente.
3. Si el ciclo afecta al orden o contenido de las fases próximas, ajustarlas.
4. Actualizar el bloque `**Why:**` y `**How to apply:**` al final del fichero si el estado del proyecto cambió de forma relevante.

### Reglas de esta actualización

- Hacerlo sin salir del trabajo en curso: no interrumpir para pedir permiso, salvo que la actualización requiera una decisión que el usuario deba tomar.
- Solo editar `memory/roadmap.md`. No reescribir `CLAUDE.md`, `AGENTS.md`, ni otros ficheros de memoria.
- Si hay duda de si algo está "completo" de verdad, marcarlo como `🔄 En progreso` o dejarlo sin marcar — no inventar estado.
- No borrar ítems históricos ya completados; el historial de fases cerradas es útil para contexto de sesión.

---

## Regla final

Si una acción puede:

- exponer secretos
- alterar configuración local
- publicar cambios
- instalar software
- borrar contenido
- tocar despliegues
- modificar memoria operativa
- cambiar CI/CD
- cambiar release móvil o firma
- afectar a más de un repo de forma no trivial

no asumir permiso. Confirmar primero.
