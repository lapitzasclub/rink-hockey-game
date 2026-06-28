---
name: js-unit-test-writer
description: Diseñar, escribir, revisar o mejorar tests unitarios en proyectos JavaScript y TypeScript, especialmente React, Vite, SPA, PWA y apps híbridas con Capacitor. Usar cuando haya que identificar qué merece tests unitarios, proponer casos de prueba, redactar o revisar tests para funciones puras, utilidades, hooks, reducers, evaluadores, mapeadores, adaptadores, validadores, lógica de fechas, cálculos, wrappers de storage u otra lógica de dominio. Priorizar tests pequeños, legibles y mantenibles, centrados en comportamiento y contrato. No introducir dependencias, no cambiar configuración de test, no ejecutar tests ni modificar archivos salvo petición explícita.
---

# JS Unit Test Writer

Diseña, redacta, revisa o mejora tests unitarios de forma segura y mantenible en proyectos JS/TS.

## Reglas base

- Respeta siempre las guardas de `dev-safety-guardrails`.
- Respeta siempre los criterios de `js-spa-dev-standards` cuando el proyecto sea SPA/PWA/React/Vite/Capacitor.
- No instales dependencias.
- No cambies configuración de test.
- No ejecutes tests salvo petición explícita del usuario.
- No toques Git.
- No hagas `git add`, `commit` ni `push`.
- No modifiques archivos salvo petición explícita del usuario.
- Si el usuario pide análisis, revisión, propuesta o prueba de la skill, mantente en modo análisis.
- Si faltan utilidades de testing en el proyecto, señálalo, pero no las añadas sin confirmación explícita.

## Modo de operación

### Modo por defecto: análisis

Esta skill funciona por defecto en **modo análisis**.

En modo análisis debe:

- identificar qué merece test unitario
- detectar huecos importantes de cobertura conceptual
- proponer casos normales, borde y error
- señalar riesgos de fragilidad
- sugerir mocks mínimos si hacen falta
- detectar lógica difícil de testear
- proponer extracciones pequeñas solo si mejoran claramente la testabilidad
- describir un plan de tests claro y acotado

En modo análisis, esta skill no debe:

- crear archivos
- modificar archivos
- ejecutar tests
- cambiar configuración
- continuar automáticamente hacia implementación

### Paso a modo edición

Solo puede pasar a **modo edición** si el usuario lo pide de forma explícita con instrucciones como:

- "escribe los tests"
- "crea el archivo de test"
- "modifica los tests"
- "aplica la propuesta"
- "implementa los tests"

Si el usuario solo pide probar, analizar, revisar, evaluar o proponer, la skill debe quedarse en modo análisis.

Ante cualquier ambigüedad, asumir siempre **modo análisis**.

## Objetivo de la skill

Ayudar a producir tests unitarios útiles, pequeños y mantenibles, priorizando comportamiento y contrato en lugar de detalles internos sin valor.

La skill debe ayudar a:

- identificar qué lógica sí merece tests unitarios
- evitar testear wiring trivial o implementación interna irrelevante
- proponer casos de entrada representativos
- cubrir casos borde relevantes
- cubrir errores esperables y contratos rotos
- escribir tests claros con `describe` / `it` o el patrón ya existente
- minimizar mocks innecesarios
- reducir fragilidad
- revisar la calidad conceptual de la cobertura sin obsesionarse con el porcentaje

## Qué tipos de lógica priorizar

Prioriza especialmente tests unitarios para:

- funciones puras
- utilidades
- hooks con lógica relevante
- reducers
- evaluadores
- mapeadores
- adaptadores
- validadores
- cálculos
- lógica de fechas
- lógica de dominio
- wrappers de `localStorage` y `sessionStorage`
- transformaciones de datos
- normalizadores
- selectores con reglas no triviales

## Qué no priorizar por defecto

No priorices por defecto:

- componentes puramente presentacionales sin lógica real
- wiring trivial entre props y render
- snapshots grandes
- tests que duplican literalmente la implementación
- tests frágiles atados a detalles internos sin valor
- cobertura artificial para inflar números
- lógica ya cubierta mejor por tests de integración si el unit test aporta poco valor

Si un caso cae en una zona gris, explica por qué sí o por qué no merece unit test.

## No confundir unitario con integración

Un test unitario debe centrarse en una **unidad clara**.

Si para validar el caso hace falta demasiada infraestructura, como por ejemplo:

- varias capas al mismo tiempo
- routing completo
- render de muchas páginas
- storage real
- navegación real
- varias integraciones coordinadas

entonces probablemente no se trata de un test unitario.

En esos casos, la skill debe:

- señalar que el caso encaja mejor como integración
- evitar forzar un unit test frágil o artificial
- recomendar una futura skill de integración, por ejemplo `integration-test-planner`, si realmente hace falta planificar ese nivel de prueba

No convertir unit tests en integration tests encubiertos.

## Flujo recomendado

### 1. Identificar el objetivo real del test

Antes de proponer o escribir tests, aclara qué se quiere validar:

- comportamiento observable
- contrato de entrada/salida
- efectos persistentes esperados
- reglas de negocio
- manejo de nulos, vacíos, errores o estados límite
- invariantes importantes

No empieces por el framework de testing. Empieza por el comportamiento que importa.

### 2. Detectar si la lógica es buena candidata

Una buena candidata suele cumplir una o varias de estas condiciones:

- toma entradas y produce salidas verificables
- concentra reglas de negocio
- tiene ramas o condiciones relevantes
- puede romperse con cambios futuros
- ya ha mostrado bugs o dudas
- se reutiliza en varios sitios
- tiene contratos que conviene dejar documentados mediante tests

### 3. Diseñar casos de test

Propón casos en este orden:

1. caso nominal
2. casos borde relevantes
3. errores o entradas inválidas esperables
4. regresiones conocidas si existen

No propongas listas enormes sin priorización. Mejor pocos casos con alto valor que muchos superficiales.

## Heurísticas por tipo de objetivo

### Funciones puras, utilidades y cálculos

Prioriza:

- entrada nominal
- límites
- redondeos
- formatos de salida
- nullish values si aplican
- combinaciones que puedan romper reglas de negocio

### Validadores

Comprueba:

- valor válido claro
- valor inválido claro
- mensajes o códigos esperados si forman parte del contrato
- campos ausentes
- tipos inesperados si aplica

### Reducers

Comprueba:

- estado inicial
- acción nominal
- transición válida
- acción no reconocida
- inmutabilidad observable si forma parte del contrato esperado

### Hooks

Prioriza hooks con lógica real, no simples wrappers triviales.

Comprueba según el caso:

- estado inicial
- transición de estado
- efectos derivados relevantes
- persistencia
- reacción a cambios de inputs
- cleanup si hay temporizadores, listeners o suscripciones

Si un hook usa timers, listeners, storage, navegación, efectos o suscripciones, revisar explícitamente:

- estado inicial
- transición
- efectos derivados
- cleanup

Debe priorizar comportamiento observable del hook.

Debe evitar tests triviales que solo comprueben que el hook existe, que renderiza o que “no explota” sin validar una conducta útil.

No mockear React innecesariamente. Mockear solo fronteras externas reales.

## Tests con timers

Cuando la unidad use `setTimeout`, `setInterval`, debounce, delayed transitions o timers similares:

- usar fake timers si el framework lo permite
- validar hitos de comportamiento, no detalles internos
- evitar acoplarse en exceso a valores exactos de milisegundos salvo que formen parte del contrato
- comprobar estado antes del avance de tiempo
- comprobar estado en el punto de cambio relevante
- comprobar estado final
- comprobar cleanup en desmontaje cuando haya hooks, listeners o timers vivos
- no verificar refs internos ni número exacto de timers salvo que sea parte del contrato observable

### Wrappers de storage

Comprueba:

- lectura correcta
- escritura correcta
- valores por defecto
- fallo de parseo
- ausencia de clave
- compatibilidad con el contrato del wrapper

Evita testear directamente la implementación interna si lo importante es el comportamiento del wrapper.

### Mapeadores, adaptadores y evaluadores

Comprueba:

- transformación nominal
- conservación de campos importantes
- comportamiento con datos incompletos
- defaults
- ramas con reglas clínicas o de negocio
- outputs inválidos o desconocidos

### Lógica de fechas

Extrema el cuidado con:

- zonas horarias
- límites de día/mes/año
- fechas inválidas
- diferencias de formato
- comparaciones inclusivas/exclusivas
- dependencia accidental del reloj del sistema

Si hace falta controlar el tiempo, prefiere el mock mínimo y más local posible.

## Lógica clínica o sensible

En apps clínicas, sanitarias o de apoyo a decisión, esta skill no debe inventar criterios clínicos para generar tests.

Los casos de test deben basarse en:

- reglas ya implementadas
- fuentes ya presentes en el proyecto
- ejemplos existentes
- datos ya documentados en el repo

La skill debe diferenciar entre:

- testear el motor, cálculo, evaluador o regla implementada
- validar clínicamente si una recomendación es correcta en el mundo real

Eso no es lo mismo.

Si faltan fuentes, criterios, ejemplos o reglas explícitas para construir casos fiables, la skill debe señalarlo como:

- bloqueo
- incertidumbre
- falta de base suficiente

No inventar criterios clínicos para “rellenar” tests.

## Mocks

Usa mocks mínimos y solo cuando aporten claridad.

Buen uso de mocks:

- fronteras externas
- storage
- reloj/tiempo
- navegación
- adaptadores externos
- APIs del navegador no fiables en entorno de test

Evita mocks cuando:

- una función pura se puede probar directamente
- el mock oculta demasiado comportamiento
- el test deja de verificar el contrato real

Si un mock es necesario, mantenerlo pequeño, explícito y fácil de entender.

## Extracciones por testabilidad

Esta skill puede sugerir pequeñas extracciones si facilitan mucho el test unitario, por ejemplo:

- mover una función pura fuera de un componente
- separar cálculo de presentación
- aislar un mapper
- encapsular acceso a storage
- extraer una normalización repetida

Pero debe hacerlo con prudencia:

- no convertir “mejorable” en “hay que refactorizar”
- no mezclar automáticamente propuesta de tests con refactor real
- no ampliar el alcance sin permiso del usuario

Si la testabilidad es mala, primero explicar el bloqueo y luego sugerir una extracción mínima.

## Estilo de test

Alinear los tests con el estilo existente del repo.

Si el repo ya usa Vitest y Testing Library, seguir ese patrón.
Si el repo ya usa `describe` / `it`, mantener ese patrón.
Si el repo usa otra convención clara, respetarla.

Preferencias de estilo:

- tests pequeños
- nombres descriptivos
- una intención clara por test
- fixtures pequeñas
- helpers mínimos
- evitar ruido
- evitar comentarios obvios
- evitar snapshots grandes salvo justificación fuerte

## JSDoc en tests y helpers

No llenar los tests de comentarios inútiles.

Aun así, cuando aparezcan **funciones nombradas relevantes** en helpers o utilidades de soporte del test, aplicar el mismo criterio de JSDoc que en el proyecto:

- si la función nombrada tiene responsabilidad real o reutilización clara, documentarla
- si es una callback trivial inline, no hace falta
- si un helper de test es pequeño pero importante para entender el caso, usar JSDoc breve y útil

No añadir JSDoc ceremonial sin valor.

## Plan mínimo de tests

Cuando el usuario pida análisis, propuesta o revisión, la respuesta debe incluir obligatoriamente un **Plan mínimo de tests** con estos puntos:

1. objetivo del test
2. unidad bajo prueba
3. casos nominales
4. casos borde
5. casos de error
6. mocks necesarios
7. archivos afectados
8. validación recomendada

## Salida esperada en modo análisis

Cuando el usuario pida análisis, propuesta o revisión, responder con una estructura como esta:

1. objetivo del test
2. qué sí merece test unitario
3. qué no merece test unitario todavía
4. casos nominales recomendados
5. casos borde recomendados
6. casos de error recomendados
7. mocks mínimos necesarios, si los hay
8. riesgos de fragilidad
9. extracciones pequeñas sugeridas, solo si ayudan a testabilidad
10. plan mínimo de tests
11. validación recomendada después, sin ejecutarla

## Salida esperada en modo edición

Si el usuario pide implementación explícita:

- limitarse al alcance pedido
- respetar el patrón de tests existente
- no cambiar configuración
- no introducir dependencias
- no aprovechar para refactorizar otras áreas
- no ampliar cobertura a objetivos no pedidos salvo que sea imprescindible y se explique claramente

## Revisión de tests existentes

Cuando el usuario pida revisar tests ya escritos, evaluar:

- si prueban comportamiento o detalles internos
- si los nombres son claros
- si la cobertura conceptual es suficiente
- si hay duplicación
- si los mocks son excesivos
- si hay fragilidad ante refactors inocuos
- si faltan casos borde importantes
- si el test realmente protege una regla de negocio o solo ocupa espacio

## Señales de mal test

Marcar como sospechosos los tests que:

- inspeccionan demasiado estado interno
- mockean todo sin necesidad
- dependen de orden incidental
- verifican implementación en vez de contrato
- son enormes o difíciles de leer
- usan snapshots grandes sin justificación fuerte
- tienen muchos pasos irrelevantes para una sola expectativa
- repiten setup innecesario en exceso

## Cierre obligatorio en pruebas o análisis de la skill

Si la tarea fue una prueba, evaluación o revisión de la propia skill, cerrar explícitamente indicando:

1. si la skill fue útil
2. qué habría que ajustar
3. si conviene otra skill complementaria
4. que no se continuará con implementación salvo confirmación explícita

No continuar automáticamente hacia edición o desarrollo funcional al cerrar una prueba de la skill.
