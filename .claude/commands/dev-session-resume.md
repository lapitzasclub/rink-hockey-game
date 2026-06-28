---
name: dev-session-resume
description: Reconstruye el estado actual de un proyecto ya trabajado para retomarlo con contexto. Resume qué se estaba haciendo, qué decisiones recientes importan, qué parece pendiente, qué riesgos existen y cuál es el siguiente paso seguro, sin modificar nada.
---

# dev-session-resume

## Propósito

Esta skill sirve para retomar un proyecto en el que ya se ha trabajado antes.

Su objetivo es reconstruir el estado actual de la sesión o del proyecto con el mínimo contexto necesario para continuar de forma segura y útil. No está orientada a descubrir un proyecto desde cero, sino a responder qué se estaba haciendo, qué decisiones recientes parecen importantes, qué tareas siguen abiertas, qué riesgos o bloqueos existen y cuál sería el siguiente paso razonable.

Debe diferenciar claramente entre hechos documentados e inferencias. No debe editar nada, ni consolidar memorias, ni reescribir documentos de continuidad.

---

## Relación con otras skills

### Relación con `dev-safety-guardrails`

Esta skill debe respetar siempre los límites de `dev-safety-guardrails`.

Eso implica, entre otras cosas:

- no abrir secretos ni credenciales
- no tocar `.env*`
- no modificar `.claude/settings.local.json`
- no tocar signing, despliegues, CI/CD o backups
- no tocar Git
- no hacer `git add`, commits ni `git push`
- no instalar dependencias
- no reescribir memoria operativa

### Relación con `dev-project-intake`

`dev-project-intake` sirve para entender un proyecto al abrirlo o retomarlo desde una vista general.

`dev-session-resume` va un paso más allá: no solo describe qué es el proyecto, sino en qué estado parece estar ahora mismo, qué continuidad existe y qué conviene hacer a continuación.

Si falta contexto estructural básico, esta skill puede recomendar usar antes o junto con `dev-project-intake`.

---

## Resultado esperado

La salida de esta skill debería ayudar a responder, cuando sea posible:

- qué se estaba haciendo
- qué decisiones recientes parecen relevantes
- qué documentos o memorias conviene leer
- qué tareas parecen pendientes
- qué bloqueos, riesgos o dudas existen
- cuál es el siguiente paso seguro
- qué está confirmado por documentos
- qué es una inferencia razonable pero no confirmada

La skill debe producir una reconstrucción útil, no una cronología exhaustiva.

---

## Alcance

Usar esta skill en proyectos donde ya exista trabajo previo y pueda haber continuidad en fuentes como:

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/`
- `.copilot/`
- `.claude/`
- `memory/`
- worklogs
- roadmap
- next-steps
- notas de sesión o continuidad

---

## Límites operativos

Esta skill es solo de lectura y análisis.

No debe:

- crear archivos
- modificar archivos
- instalar dependencias
- ejecutar builds por defecto
- ejecutar tests por defecto
- tocar Git de ninguna forma
- hacer `git add`
- hacer commits
- hacer `git push`
- abrir secretos, credenciales o materiales sensibles
- reescribir `CLAUDE.md`, `AGENTS.md`, `.copilot/`, `.claude/`, `memory/` o `docs/`

Si el usuario quiere convertir la reconstrucción en una acción concreta, eso debe pasar en una tarea posterior.

---

## Regla clave: separar hechos de inferencias

Esta skill debe distinguir siempre entre:

### Hechos confirmados

Información encontrada de forma explícita en documentos, memorias, worklogs, roadmaps, notas o estructura observable.

### Inferencias

Conclusiones razonables derivadas de señales parciales, pero no afirmadas explícitamente por la documentación.

La respuesta debe marcarlo con claridad.

Nunca debe presentar como hecho algo que solo parece probable.

Si hay poca base documental, debe decirlo.

---

## Reglas de exploración

### Exploración proporcional

La exploración debe ser proporcional al objetivo y al tamaño del repositorio.

Por tanto:

- no listar árboles completos del repo si es grande
- no volcar listados enormes
- priorizar una lectura resumida y orientada a continuidad
- profundizar solo en documentos y carpetas que ayuden a reconstruir estado
- evitar ruido estructural que no aporte contexto útil

### Priorizar continuidad sobre inventario

Esta skill no debe intentar catalogar todo el proyecto.

Debe priorizar aquello que ayude a responder:

- dónde se quedó el trabajo
- qué decisiones recientes pesan más
- qué sigue pendiente
- qué conviene leer ahora mismo

### Recencia prudente

Si hay varios worklogs, roadmaps, notas o memorias, puede priorizar fuentes más recientes solo si las fechas o el contexto lo justifican.

No debe asumir que el archivo más recientemente modificado es automáticamente la fuente correcta.

Si la recencia no está clara:

- indicarlo como incertidumbre
- evitar presentar una versión temporal como definitiva sin apoyo suficiente

---

## Qué debe buscar

### 1) Estado reciente del trabajo

Intentar identificar:

- última fase visible del proyecto
- cambios o hitos recientes documentados
- foco activo más reciente
- si hay señales de pausa, transición o cierre parcial
- si parece haber una tarea interrumpida o un hilo abierto

Fuentes útiles:

- `CLAUDE.md`
- `AGENTS.md`
- `README.md`
- `docs/`
- worklogs
- roadmap
- next-steps
- `memory/`
- `.copilot/`
- notas de continuidad

---

### 2) Decisiones recientes relevantes

Buscar decisiones que parezcan afectar al trabajo siguiente, por ejemplo:

- cambios de arquitectura
- convenciones nuevas
- límites de diseño
- decisiones sobre runtime o despliegue
- reglas de documentación
- prioridades de producto
- deudas técnicas reconocidas
- exclusiones explícitas

La skill debe resumir las decisiones más importantes, no todas las frases interesantes.

---

### 3) Tareas pendientes o siguientes pasos aparentes

Detectar si existen:

- listas de siguientes pasos
- backlog activo
- TODOs documentados
- fases en progreso
- tareas marcadas como pendientes
- trabajo que se intuye incompleto por contexto

La skill debe diferenciar:

- tareas explícitamente pendientes
- tareas inferidas como probables

---

### 4) Documentos que conviene leer primero

Proponer un orden de lectura breve y útil para retomar el trabajo.

Suele tener prioridad, si aplica:

1. `CLAUDE.md`
2. `AGENTS.md`
3. última memoria o worklog relevante
4. `README.md`
5. `ARCHITECTURE.md`
6. `docs/` específicos del área activa
7. roadmap o next-steps

Si hay contradicciones o varias fuentes fuertes, indicarlo.

---

### 5) Memoria de agentes y continuidad

Detectar si existe memoria operativa útil para retomar el proyecto.

Regla de lectura:

- se permite leer `CLAUDE.md`, `AGENTS.md`, `README.md`, `ARCHITECTURE.md` y `docs/` si son relevantes
- `.claude/`, `.copilot/` y `memory/` solo deben leerse si la tarea lo requiere realmente
- no deben reescribirse
- no debe exponerse contenido sensible o local

La skill debe indicar:

- qué fuentes de continuidad existen
- cuáles parecen más activas
- cuáles parecen históricas o residuales
- cuáles merecen lectura inmediata

---

### 6) Bloqueos, riesgos o incertidumbres

Intentar detectar:

- dependencias no confirmadas
- contradicciones documentales
- tareas paradas por falta de decisión
- zonas delicadas del proyecto
- áreas con deuda técnica conocida
- puntos donde una acción precipitada podría romper continuidad

También debe señalar si hay falta de contexto suficiente para afirmar el estado con seguridad.

---

### 7) Conflictos entre fuentes

Si `README.md`, `CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/`, worklogs o memorias parecen contradecirse, debe indicarse como posible conflicto.

En ese caso:

- no inventar una jerarquía
- no asumir que la fuente más reciente es automáticamente la correcta si no está claro
- señalar qué documentos parecen entrar en conflicto
- explicar brevemente el área de conflicto
- recomendar revisión manual antes de actuar

---

### 8) Qué está confirmado y qué no

La salida debe dejar explícito:

- qué puntos están confirmados por lectura directa
- qué puntos son inferencias
- qué puntos siguen siendo inciertos
- qué haría falta revisar para reducir incertidumbre

Esto es una parte central de la skill, no un detalle opcional.

---

## Qué no debe hacer

No debe:

- editar archivos
- crear notas o resúmenes persistidos
- consolidar memorias
- reescribir worklogs
- actualizar roadmaps
- tocar Git
- ejecutar builds por defecto
- ejecutar tests por defecto
- entrar en secretos o signing
- hacer una auditoría técnica profunda no pedida
- convertir una reconstrucción de contexto en un plan de ejecución agresivo

---

## Estrategia de lectura recomendada

Cuando esta skill se use, conviene seguir un orden parecido a este:

1. identificar las fuentes de continuidad más probables
2. leer documentación canónica relevante
3. localizar memoria o worklogs recientes si hace falta
4. detectar decisiones activas y pendientes
5. resumir riesgos, bloqueos e incertidumbres
6. proponer el siguiente paso seguro
7. separar claramente hechos de inferencias

La prioridad es reconstruir continuidad, no exhaustividad.

---

## Formato de salida recomendado

La respuesta debería organizarse, cuando sea posible, en secciones como estas:

- Resumen de reentrada
- Semáforo de continuidad
- Qué se estaba haciendo
- Decisiones recientes relevantes
- Pendientes aparentes
- Bloqueos o riesgos
- Qué leer primero
- Hechos confirmados
- Inferencias
- Incertidumbres
- Siguiente paso seguro

---

## Resumen de reentrada

La salida debe incluir obligatoriamente una sección breve llamada `Resumen de reentrada`, situada al inicio o al final.

Debe resumir, si es posible:

- Proyecto
- Estado aparente
- Foco reciente
- Pendiente principal
- Riesgo o bloqueo principal
- Documentos que leer ya
- Siguiente paso seguro

Si falta información, indicarlo sin inventarla.

---

## Semáforo de continuidad

La salida debe incluir obligatoriamente una sección compacta llamada `Semáforo de continuidad`.

Debe elegir uno de estos estados:

- **Verde**: hay contexto suficiente para continuar con bajo riesgo
- **Ámbar**: se puede continuar, pero hay incertidumbres relevantes
- **Rojo**: no conviene continuar sin revisar antes contradicciones, falta de contexto o riesgos

Debe indicar:

- el color elegido
- una justificación breve y concreta

---

## Próximo paso seguro

La skill debe terminar proponiendo un siguiente paso que sea:

- pequeño
- reversible
- coherente con la documentación encontrada
- seguro respecto a zonas sensibles
- útil para reducir incertidumbre o avanzar con contexto

Puede proponer como máximo 2 o 3 pasos opcionales adicionales.

No debe convertir la reentrada en una planificación completa o agresiva.

Si no hay base suficiente para proponer acción concreta, debe recomendar primero una lectura adicional o una aclaración humana.

---

## Cuándo usar esta skill

Usarla cuando:

- se retoma un proyecto tras una pausa
- ha habido trabajo previo y hace falta reconstruir continuidad
- existen memorias, worklogs o notas de sesión
- no está claro en qué punto quedó el trabajo
- un agente nuevo necesita continuar desde un estado previo
- se quiere decidir el siguiente paso con contexto antes de editar nada

---

## Cuándo no usar esta skill

No usarla como skill principal cuando:

- el proyecto se abre por primera vez y aún falta una vista general básica
- la tarea es puramente de implementación inmediata
- hace falta una auditoría de seguridad, versionado o despliegue
- el usuario ya sabe exactamente qué tocar y no necesita reconstrucción de contexto
- no hay señales de trabajo previo ni memoria útil
- la pregunta es puramente conceptual y no requiere continuidad documental

---

## Señales de escalado

Si durante el análisis aparece la necesidad de:

- editar archivos
- instalar dependencias
- ejecutar build o test
- revisar CI/CD
- tocar despliegues
- inspeccionar configuración local
- abrir memoria de agentes profunda sin base suficiente
- entrar en zonas sensibles o credenciales

entonces la skill debe detenerse en el análisis y recomendar confirmación explícita o una skill posterior más específica.

---

## Criterio de calidad

Una buena ejecución de esta skill:

- reduce el coste de retomar el proyecto
- distingue hechos de inferencias con claridad
- no sobrelee zonas sensibles
- detecta decisiones y pendientes relevantes
- no inventa estado cuando falta evidencia
- propone un siguiente paso realmente seguro
- deja claro qué falta por verificar

---

## Regla final

Si esta skill duda entre:

- rellenar huecos con suposiciones
- o admitir incertidumbre

debe admitir incertidumbre.
