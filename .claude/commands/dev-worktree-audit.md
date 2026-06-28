---
name: dev-worktree-audit
description: Audita el estado del árbol de trabajo de un repositorio para detectar ruido, riesgos de versionado, cambios sensibles, artefactos y problemas de higiene antes de continuar o preparar un commit, sin modificar nada.
---

# dev-worktree-audit

## Propósito

Esta skill sirve para revisar el estado actual del árbol de trabajo de un repositorio antes de:

- seguir trabajando
- cerrar una sesión
- preparar un commit
- decidir si un cambio está listo para revisión

Su objetivo es detectar ruido, riesgos, cambios sensibles, artefactos generados y señales de mala higiene de versionado sin modificar nada.

No debe arreglar el repositorio. Debe observar, clasificar y resumir hallazgos para ayudar a decidir el siguiente paso seguro.

---

## Relación con otras skills

### Relación con `dev-safety-guardrails`

Esta skill debe respetar siempre `dev-safety-guardrails`.

Eso implica, entre otras cosas:

- no abrir secretos ni credenciales
- no tocar `.env*`
- no modificar `.claude/settings.local.json`
- no tocar backups, signing, despliegues o CI/CD sin motivo explícito
- no hacer `git add`
- no hacer commits
- no hacer `git push`
- no instalar dependencias
- no borrar contenido
- no asumir permiso para inspeccionar contenido sensible más allá de lo estrictamente necesario

### Relación con `dev-project-intake`

`dev-project-intake` ayuda a entender qué es un proyecto.

`dev-worktree-audit` ayuda a entender en qué estado de higiene y riesgo está su árbol de trabajo ahora mismo.

### Relación con `dev-session-resume`

`dev-session-resume` reconstruye continuidad y contexto.

`dev-worktree-audit` revisa el estado material del repo: cambios locales, ruido, artefactos, zonas sensibles y riesgo antes de actuar o versionar.

---

## Resultado esperado

La salida de esta skill debería ayudar a responder, cuando sea posible:

- qué archivos están modificados
- qué archivos nuevos no están seguidos
- qué archivos aparecen borrados
- si hay cambios en zonas sensibles
- si hay artefactos generados o temporales
- si hay memoria de agentes o documentación viva modificada
- si hay cambios en CI/CD, release móvil o despliegue
- si hay señales de secretos o material que no debería versionarse
- si conviene revisar `.gitignore`
- qué hallazgos son de riesgo bajo, medio o alto

La skill debe ser diagnóstica, no correctiva.

---

## Alcance

Usar esta skill para auditar repositorios personales de desarrollo que puedan incluir:

- React
- TypeScript
- Vite
- Capacitor
- PWA
- Cloudflare
- Godot
- web clásico
- Node.js
- Python
- scripts
- memorias de agentes
- artefactos generados
- carpetas temporales o de build

---

## Límites operativos

Esta skill es solo de lectura y análisis.

No debe:

- crear archivos
- modificar archivos
- borrar archivos
- hacer `git add`
- hacer commits
- hacer `git push`
- hacer `git clean`
- hacer `git reset`
- instalar dependencias
- ejecutar builds por defecto
- ejecutar tests por defecto
- abrir secretos
- mostrar contenido sensible
- preparar staging automático
- corregir `.gitignore` automáticamente

No debe tocar Git salvo comandos seguros de lectura.

---

## Comandos permitidos de solo lectura

Esta skill puede usar únicamente comandos seguros y de solo lectura como:

- `git status --short`
- `git status --ignored --short`, solo si se justifica por sospecha de artefactos ignorados relevantes
- `git diff --stat`
- `git diff --name-only`
- `git diff --cached --stat`, solo si detecta que hay staging
- `git diff --cached --name-only`, solo si detecta que hay staging
- `git ls-files --others --exclude-standard`

No debe usar:

- comandos de escritura
- comandos de limpieza
- comandos de reset
- staging
- commit
- push
- ni otras operaciones que alteren el repositorio

---

## Regla clave: auditar sin arreglar

Esta skill debe limitarse a:

- detectar
- clasificar
- resumir
- recomendar revisión

No debe:

- limpiar el árbol
- mover archivos
- eliminar artefactos
- preparar staging
- decidir por sí sola qué debe commitearse

El objetivo es mejorar criterio, no automatizar acciones irreversibles.

---

## Reglas de exploración

### Exploración proporcional

La auditoría debe ser proporcional al tamaño del repositorio y al volumen de cambios.

Por tanto:

- no volcar listados gigantes si el repo es grande
- priorizar resúmenes útiles
- agrupar hallazgos por categorías
- profundizar solo en rutas relevantes o de riesgo
- evitar ruido innecesario si basta una vista sintética

### Priorizar señal sobre volumen

Si hay muchos archivos, la skill debe priorizar:

- zonas sensibles
- archivos nuevos sin seguimiento
- artefactos sospechosos
- cambios en documentación viva
- cambios de despliegue o CI/CD
- rutas con mayor riesgo de versionado incorrecto

---

## Repos no Git o estado Git no legible

Si la carpeta no está dentro de un repo Git, debe indicarlo claramente.

En ese caso:

- no debe ejecutar `git init`
- no debe modificar nada
- puede hacer una revisión estructural básica de carpetas y posibles zonas sensibles
- debe dejar claro que no hay estado Git auditable disponible

Si el estado Git no es legible:

- debe informar la limitación
- no debe inventar resultados
- puede ofrecer una lectura estructural básica en modo solo lectura si sigue siendo útil

---

## Qué debe buscar

### 1) Estado general del worktree

Detectar, cuando sea posible:

- archivos modificados
- archivos nuevos sin seguimiento
- archivos borrados
- renombrados si la vista de solo lectura los muestra
- volumen aproximado de cambios
- si el árbol parece limpio, razonable o ruidoso

Debe resumir primero el estado general antes de entrar en detalle.

---

### 2) Zonas sensibles modificadas

Señalar si hay cambios en rutas o familias delicadas, como:

- `.env*`
- credenciales
- certificados
- claves
- signing
- `.claude/`
- `.copilot/`
- `memory/`
- `backups/`
- CI/CD
- despliegues
- configuraciones locales
- `android/`
- `capacitor.config.*`
- Cloudflare config
- scripts operativos del sistema

No debe abrir ni mostrar contenido sensible. Solo debe marcar la categoría de riesgo y la ruta si hacerlo no expone información sensible.

---

### 3) Artefactos generados y ruido

Detectar señales de archivos que podrían no merecer versionado, por ejemplo:

- `dist/`
- `build/`
- outputs generados
- logs
- temporales
- cachés
- archivos de editor
- archivos de sistema
- resultados intermedios
- carpetas de dependencias
- material de pruebas ad hoc no integrado

La skill debe indicar si parecen:

- normales para el repo
- dudosos
- claramente ruido

---

### 4) Documentación viva y memoria de agentes

Detectar cambios en:

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/`
- `.copilot/`
- `memory/`

Debe diferenciar entre:

- documentación de producto o arquitectura
- memoria operativa
- cambios posiblemente esperables
- cambios que merecen revisión antes de commit

No debe reescribir nada.

---

### 5) CI/CD, release móvil y despliegue

Detectar si hay cambios en:

- `.github/workflows/`
- `.gitlab-ci.yml`
- `Jenkinsfile`
- scripts de pipeline
- runners
- configuración de despliegue
- `android/`
- `capacitor.config.*`
- ficheros de release móvil
- configuraciones de Cloudflare
- otros targets de publicación

Estos cambios deben marcarse con más cautela porque su impacto puede ser mayor.

---

### 6) Señales de versionado incorrecto

Intentar detectar pistas de que convendría revisar `.gitignore` o la disciplina de versionado, por ejemplo:

- muchos archivos generados sin seguimiento
- presencia repetida de temporales
- artefactos de build mezclados con código fuente
- archivos locales que parecen no portables
- outputs de herramientas de agente
- caches, logs o dumps accidentales
- cambios frecuentes en rutas que deberían ignorarse

La skill no debe editar `.gitignore`, solo señalar la necesidad de revisarlo.

---

### 7) Riesgo por categorías

La skill debe clasificar hallazgos por riesgo:

#### Riesgo bajo

Cambios normales y previsibles, por ejemplo:

- código fuente esperado
- docs esperadas
- ajustes locales no sensibles ya controlados
- pequeños archivos de soporte sin señales de peligro

#### Riesgo medio

Cambios que merecen revisión antes de commit, por ejemplo:

- documentación viva importante
- memoria de agentes
- artefactos dudosos
- nuevos archivos no seguidos en rutas relevantes
- cambios amplios en muchas carpetas
- señales de `.gitignore` incompleto

#### Riesgo alto

Cambios con potencial de exposición, publicación accidental o rotura, por ejemplo:

- secretos o ficheros que parecen sensibles
- signing
- CI/CD
- despliegues
- configuración local delicada
- release móvil
- archivos que no deberían versionarse claramente
- cambios en rutas con impacto operacional alto

---

## Prohibición de diff completo por defecto

No debe ejecutar ni mostrar `git diff` completo por defecto.

No debe mostrar contenido de archivos modificados por defecto.

Si se necesita revisar contenido:

- debe proponerse una revisión posterior
- debe hacerse por rutas concretas
- debe evitar rutas sensibles
- debe priorizar revisión humana

---

## Qué no debe hacer

No debe:

- editar el repo
- limpiar archivos
- mover temporales
- borrar artefactos
- tocar Git más allá de lectura segura
- abrir secretos
- asumir que todo archivo no seguido debe ignorarse
- asumir que todo archivo modificado debe ir a commit
- resolver staging automáticamente
- hacer recomendaciones agresivas sin distinguir riesgo

---

## Estrategia de lectura recomendada

Cuando esta skill se use, conviene seguir un orden parecido a este:

1. obtener una vista global del worktree
2. identificar volumen y tipo de cambios
3. localizar zonas sensibles o de alto impacto
4. detectar artefactos, temporales y ruido
5. revisar documentación viva y memoria de agentes
6. detectar señales de mal `.gitignore`
7. clasificar hallazgos por riesgo
8. proponer el siguiente paso seguro

---

## Formato de salida recomendado

La respuesta debería organizarse, cuando sea posible, en secciones como estas:

- Resumen de auditoría
- Estado de confianza
- Estado general del worktree
- Hallazgos de riesgo alto
- Hallazgos de riesgo medio
- Hallazgos de riesgo bajo
- Zonas sensibles afectadas
- Artefactos o ruido detectado
- Documentación y memoria modificadas
- Señales para revisar `.gitignore`
- Preparación segura para commit
- Rutas que conviene revisar a mano
- Siguiente paso seguro

---

## Resumen de auditoría

La salida debe incluir obligatoriamente una sección breve llamada `Resumen de auditoría`.

Debe resumir, si es posible:

- estado general
- volumen aproximado de cambios
- riesgo principal
- si hay zonas sensibles afectadas
- si hay ruido o artefactos
- si conviene revisar `.gitignore`
- siguiente paso seguro

Si falta información, indicarlo sin inventarla.

---

## Estado de confianza

La salida debe incluir obligatoriamente una sección llamada `Estado de confianza`.

Debe elegir uno de estos estados:

- **Verde**: worktree limpio o cambios esperados y de bajo riesgo
- **Ámbar**: hay cambios o ruido que conviene revisar antes de continuar o commitear
- **Rojo**: hay zonas sensibles, posibles secretos, CI/CD, signing, despliegue o cambios de alto impacto

Debe indicar:

- color elegido
- justificación breve
- condición que haría bajar o subir el nivel de riesgo

---

## Propuesta de revisión de diff

Si la skill recomienda revisar cambios con más detalle:

- debe proponerlo por rutas concretas
- debe evitar rutas sensibles
- no debe pedir revisar “todo el diff” sin priorización
- debe señalar primero qué rutas merecen atención y por qué

---

## Preparación segura para commit

La skill puede ayudar a preparar una revisión humana previa al commit.

Puede:

- sugerir grupos lógicos de archivos para revisar
- indicar qué rutas parecen candidatas a commit
- indicar qué rutas conviene excluir o revisar con más cuidado

No debe:

- hacer `git add`
- sugerir `git add .`
- sugerir staging masivo
- decidir automáticamente qué entra en commit
- sustituir la revisión humana

Debe priorizar revisión humana y staging deliberado por rutas concretas.

---

## Próximo paso seguro

La skill debe terminar proponiendo un siguiente paso que sea:

- pequeño
- reversible
- centrado en revisión
- seguro respecto a zonas sensibles
- útil para reducir riesgo antes de continuar o commitear

Puede proponer como máximo 2 o 3 pasos opcionales adicionales.

No debe convertir la auditoría en una operación de limpieza automática ni en una preparación de commit encubierta.

---

## Cuándo usar esta skill

Usarla cuando:

- vas a seguir trabajando en un repo y quieres saber si el árbol está limpio
- vas a cerrar una sesión y quieres revisar qué queda suelto
- vas a preparar un commit y quieres detectar riesgos antes
- sospechas que hay temporales, artefactos o ruido
- quieres comprobar si se tocó memoria de agentes, docs o zonas sensibles
- quieres saber si conviene revisar `.gitignore`

---

## Cuándo no usar esta skill

No usarla como skill principal cuando:

- la tarea es entender el proyecto desde cero
- la tarea es reconstruir contexto funcional o continuidad
- el usuario quiere ya implementar un cambio concreto
- la necesidad real es hacer una auditoría profunda de seguridad
- no estás en un repo o no hay árbol de trabajo que auditar
- el usuario quiere ejecutar limpieza, staging o commits, porque eso requiere otra decisión explícita

---

## Señales de escalado

Si durante la auditoría aparece la necesidad de:

- revisar diff detallado en rutas concretas
- inspeccionar archivos sensibles
- decidir qué debe stagedarse
- proponer limpieza manual
- revisar `.gitignore`
- revisar despliegues, CI/CD o signing
- verificar si un archivo contiene secreto real

entonces la skill debe detenerse en la auditoría y recomendar una revisión explícita posterior, no actuar por su cuenta.

---

## Criterio de calidad

Una buena ejecución de esta skill:

- da visibilidad real del estado del repo
- no genera ruido innecesario
- detecta zonas sensibles
- clasifica bien los riesgos
- distingue entre código, docs, memoria y artefactos
- ayuda a evitar commits torpes
- propone una revisión siguiente pequeña y segura

---

## Regla final

Si esta skill duda entre:

- profundizar más
- o resumir y pedir revisión humana

debe preferir resumir y pedir revisión humana.
