---
name: js-refactor-500-lines
description: Analiza archivos JavaScript/TypeScript grandes o complejos y propone refactors pequeños, seguros y progresivos para mejorar mantenibilidad sin cambiar comportamiento, especialmente en proyectos SPA, PWA y apps híbridas.
---

# js-refactor-500-lines

## Propósito

Esta skill sirve para analizar archivos JavaScript/TypeScript/JSX/TSX que han crecido demasiado o se han vuelto difíciles de mantener.

Su objetivo es detectar oportunidades de refactor pequeñas, seguras y progresivas que mejoren claridad, separación de responsabilidades y reutilización, sin cambiar comportamiento salvo petición explícita.

No existe para “embellecer” código ni para imponer arquitectura por estética. Existe para ayudar a decidir cuándo un archivo merece una pasada de refactor y cuál sería la forma más segura de hacerla.

---

## Relación con otras skills

### Relación con `dev-safety-guardrails`

Esta skill debe respetar siempre `dev-safety-guardrails`.

Eso implica, entre otras cosas:

- no tocar secretos ni configuraciones sensibles
- no instalar dependencias nuevas sin justificación y confirmación
- no hacer `git add`
- no hacer commits automáticos
- no hacer `git push`
- no tocar despliegues, signing, CI/CD o configuraciones locales delicadas salvo petición explícita
- priorizar cambios pequeños, explicados y revisables

### Relación con `js-spa-dev-standards`

Esta skill debe aplicar y reforzar `js-spa-dev-standards`.

Eso implica especialmente:

- separación entre dominio y UI
- archivos razonablemente acotados
- mobile-first
- consideración de apps híbridas web/Android/iOS cuando aplique
- estilos mantenibles
- centralización razonable de storage
- JSDoc obligatorio para funciones
- evitar dependencias nuevas sin necesidad real

Si ambas skills empujan en direcciones distintas, debe preferirse la opción más simple y menos invasiva.

---

## Resultado esperado

La salida de esta skill debería ayudar a identificar, cuando sea posible:

- archivos cercanos o superiores a 500 líneas
- componentes demasiado grandes
- JSX difícil de seguir
- `useEffect` demasiado cargados
- funciones internas que deberían extraerse
- hooks reutilizables
- constantes o enums que deberían moverse fuera
- literales mágicos
- tipos/modelos que deberían extraerse
- utilidades reutilizables
- lógica de dominio mezclada con UI
- estilos acoplados o duplicados
- acceso repetido a `localStorage` o `sessionStorage`
- duplicación de lógica
- zonas donde añadir o mejorar JSDoc

La skill debe orientar refactors pequeños y seguros, no rediseños agresivos.

---

## Alcance

Usar esta skill en proyectos:

- JavaScript
- TypeScript
- React
- Vite
- SPA
- PWA
- apps híbridas con Capacitor
- interfaces con JSX o TSX

Especialmente cuando un archivo ya es difícil de leer, de revisar o de extender.

---

## Límites operativos

Esta skill no debe asumir refactor automático masivo.

Si se usa en modo de análisis o propuesta:

- no crear archivos
- no modificar archivos
- no instalar dependencias
- no ejecutar builds por defecto
- no ejecutar tests por defecto
- no tocar Git
- no tocar configuraciones sensibles
- no cambiar comportamiento

Si en otra tarea se usa para ejecutar cambios, debe hacerlo en pasos pequeños y explícitos.

---

## Modo análisis vs modo edición

### Modo análisis

En modo análisis, la skill solo debe:

- identificar oportunidades
- explicar problemas de mantenibilidad
- proponer pasos pequeños
- señalar riesgos
- recomendar validaciones

No debe editar ni mezclar propuestas con ejecución real.

### Modo edición

En modo edición, la skill solo debe actuar si el usuario lo pide explícitamente.

Aun así, debe:

- mantener cambios pequeños
- separar bien cada paso
- evitar refactors masivos
- preservar comportamiento salvo petición explícita

### Separación obligatoria

No debe mezclar análisis y ejecución sin confirmación.

Si propone cambios:

- debe separarlos claramente de cualquier edición real
- debe dejar claro qué es diagnóstico y qué sería una acción concreta posterior

---

## Regla clave: refactorizar por claridad, no por estética

No refactorizar por estética.

Solo conviene extraer, mover o dividir cuando eso realmente mejora una o varias de estas cosas:

- claridad
- legibilidad
- separación de responsabilidades
- reutilización
- testabilidad
- mantenibilidad
- facilidad de revisión

No crear:

- hooks
- utilidades
- componentes
- enums
- tipos
- abstracciones

si no mejoran de forma real el código.

---

## Regla de tamaño orientativa

### Umbral de 500 líneas

Intentar que los archivos no superen unas **500 líneas** cuando sea razonable.

No es un límite dogmático.

Sí es una señal de revisión cuando se combina con síntomas como:

- mezcla de responsabilidades
- muchos estados y efectos
- JSX largo
- helpers enterrados
- lógica difícil de seguir
- constantes y tipos dispersos
- duplicación
- bloques difíciles de aislar

La skill no debe recomendar dividir un archivo solo por pasar de 500 líneas si sigue siendo claro y estable.

---

## Qué debe buscar

### 1) Tamaño y densidad del archivo

Detectar si el archivo:

- está cerca o por encima de 500 líneas
- concentra demasiadas responsabilidades
- tiene bloques difíciles de leer
- mezcla render, estado, efectos, dominio y utilidades
- obliga a hacer mucho scroll para entender lo esencial

La pregunta no es solo cuánto mide, sino cuánta complejidad concentra.

---

### 2) Componentes demasiado grandes

Detectar señales como:

- componente principal enorme
- JSX con demasiados bloques condicionales
- handlers largos
- mezcla de layout, negocio y persistencia
- subpartes visuales que podrían aislarse
- secciones repetidas o claramente separables

No dividir por dividir. Solo cuando mejore lectura o reutilización.

---

### 3) JSX difícil de seguir

Detectar si el JSX:

- tiene demasiada lógica inline
- mezcla render con demasiadas ternarias o condiciones
- contiene bloques visuales largos y repetidos
- queda enterrado entre helpers o efectos
- dificulta localizar la estructura real de la UI

En esos casos, conviene considerar:

- subcomponentes
- variables de render
- funciones de render nombradas
- extracción de bloques con responsabilidad clara

---

### 4) `useEffect` demasiado cargados

Detectar `useEffect` que:

- hacen demasiadas cosas
- mezclan sincronización, persistencia, derivación y listeners
- tienen dependencias difíciles de justificar
- usan condicionales complejos
- contienen demasiada lógica inline

La skill debe proponer separar o simplificar solo si mejora legibilidad y control.

---

### 5) Funciones internas que deberían extraerse

Detectar funciones internas que merecen extraerse cuando:

- tienen lógica relevante
- son reutilizables
- ocultan intención dentro de un componente muy grande
- dificultan leer el flujo principal
- podrían vivir mejor como helper, utilidad o función nombrada

Todas las funciones existentes o extraídas deben tener JSDoc.

---

### 6) Hooks reutilizables

Detectar si hay lógica de estado o efectos que sería mejor mover a un hook porque:

- se reutiliza
- ensucia demasiado el componente
- encapsula sincronización o persistencia
- coordina comportamiento complejo
- mejora la lectura del componente principal

No crear hooks solo por moda.

---

### 7) Constantes, enums y literales mágicos

Detectar si conviene extraer:

- constantes de configuración
- límites numéricos
- categorías
- etiquetas repetidas
- variantes de estado
- enums o uniones tipadas
- tokens de comportamiento o UI

Evitar literales mágicos repetidos cuando tienen significado claro.

---

### 8) Tipos y modelos

Detectar si conviene extraer:

- tipos de dominio
- contratos de resultados
- tipos de props
- estructuras persistidas
- modelos intermedios
- mapeos entre capas

La skill debe favorecer que el dominio no quede implícito ni disperso.

---

### 9) Utilidades reutilizables

Detectar si hay lógica pura que merezca vivir fuera del componente:

- validaciones
- formateos
- transformaciones
- adaptadores
- comparadores
- mapeadores
- constructores de datos derivados

Solo si mejora claridad o reutilización real.

---

### 10) Dominio mezclado con UI

Detectar si se está mezclando demasiado:

- reglas de negocio en JSX
- evaluadores dentro del render
- decisiones de dominio en handlers visuales
- persistencia local acoplada al render
- formateos o decisiones clínicas incrustadas en componentes

Aquí suele haber oportunidades de refactor de alto valor.

---

### 11) Estilos acoplados o duplicados

Detectar si hay:

- estilos repetidos
- decisiones visuales copiadas
- tokens hardcodeados demasiadas veces
- lógica visual acoplada a componentes enormes
- falta de separación entre estilos locales y tema global

La skill debe proponer extracción prudente, no rehacer todo el sistema visual.

---

### 12) Persistencia local repetida

Detectar acceso repetido o disperso a:

- `localStorage`
- `sessionStorage`

Si aparece en muchos sitios, conviene sugerir centralización razonable.

---

### 13) Duplicación de lógica

Detectar:

- bloques parecidos
- transformaciones repetidas
- handlers similares
- render repetido con pequeñas variantes
- lógica duplicada entre páginas/componentes

La skill debe señalar dónde conviene extraer y dónde no merece la pena aún.

---

### 14) JSDoc ausente o mejorable

Detectar funciones sin JSDoc o con JSDoc pobre, redundante o mecánico.

Reglas:

- todas las funciones deben tener JSDoc
- callbacks inline extremadamente simples pueden quedar sin JSDoc
- si un callback inline tiene lógica relevante, debe extraerse a función nombrada con JSDoc

La skill debe señalar tanto ausencia como calidad insuficiente.

---

## Patrones existentes antes de extraer

Antes de proponer nuevos archivos o carpetas, revisar si el repo ya tiene patrones para:

- `components/`
- `hooks/`
- `utils/`
- `types/`
- `constants/`
- `data/`
- `services/`
- `styles/`

No inventar una estructura nueva si el proyecto ya tiene una convención clara.

Si no hay convención clara:

- proponer la opción más simple y explícita
- evitar reorganizaciones grandes
- priorizar coherencia local sobre arquitectura idealizada

---

## Qué no debe hacer

No debe:

- proponer reescrituras completas de un archivo por defecto
- partir un archivo en demasiadas piezas de golpe
- mover código sin una mejora clara
- cambiar comportamiento salvo petición explícita
- convertir una revisión de mantenibilidad en una migración arquitectónica
- empujar hooks o utilidades artificiales
- usar el límite de 500 líneas como dogma

---

## Estrategia recomendada de refactor

Cuando detecte oportunidades, la skill debería priorizar algo parecido a esto:

1. identificar el cuello de botella principal del archivo
2. proponer el cambio más pequeño que más claridad aporte
3. preferir una extracción cada vez
4. mantener comportamiento intacto
5. mejorar JSDoc en funciones afectadas
6. reevaluar si hace falta otro paso después

La idea es trabajar por iteraciones, no por cirugía masiva.

---

## Validación de comportamiento

Todo refactor propuesto debe indicar cómo validar que no cambia comportamiento.

Puede sugerir:

- tests unitarios existentes
- nuevos tests recomendados
- revisión manual concreta
- `npm run lint`
- `npm run build`
- `npm run test`

Estas comprobaciones son recomendaciones de validación.

No debe ejecutarlas automáticamente salvo petición explícita del usuario.

---

## Formato de salida recomendado

La respuesta debería organizarse, cuando sea posible, en secciones como estas:

- Resumen del archivo o zona analizada
- Señales de complejidad detectadas
- Oportunidades de refactor de alto valor
- Oportunidades de refactor opcionales
- Riesgos de refactor
- Plan de refactor mínimo
- Qué no tocar todavía
- Propuesta de siguiente paso pequeño
- Pasos opcionales posteriores

---

## Plan de refactor mínimo

La salida debe incluir obligatoriamente una sección llamada `Plan de refactor mínimo`.

Debe incluir:

- objetivo del refactor
- extracción o cambio propuesto
- archivos afectados
- riesgo estimado
- validación recomendada
- qué no tocar todavía

Este plan debe ser pequeño, revisable y orientado a una sola mejora clara cada vez.

---

## Prioridad de propuestas

La skill debe priorizar propuestas como:

### Prioridad alta

- extraer lógica de dominio fuera de UI
- dividir `useEffect` demasiado cargados
- extraer funciones internas con lógica relevante
- aislar persistencia repetida
- mejorar JSDoc obligatorio
- separar JSX claramente ilegible

### Prioridad media

- mover constantes, enums y tipos
- extraer utilidades reutilizables
- mejorar organización local del archivo
- reducir literales mágicos

### Prioridad baja

- microajustes cosméticos
- renombres no necesarios
- reorganización estética sin mejora clara
- subdivisiones excesivas

---

## Riesgos de refactor

Antes de actuar, esta skill debe vigilar riesgos como:

- cambiar comportamiento sin querer
- romper dependencias implícitas
- extraer demasiado y empeorar navegabilidad
- generar archivos pequeños pero poco cohesionados
- introducir abstracciones que el proyecto no necesita
- convertir JSDoc en algo redundante o mecánico
- tocar demasiadas capas a la vez

---

## Próximo paso seguro

La skill debe terminar proponiendo un siguiente paso que sea:

- pequeño
- reversible
- fácil de revisar
- de bajo riesgo
- orientado a una mejora clara de mantenibilidad
- sin cambio de comportamiento

Puede proponer como máximo 2 o 3 pasos opcionales adicionales.

No debe convertir la propuesta en un plan grande de refactor por fases salvo que el usuario lo pida explícitamente.

---

## Cuándo usar esta skill

Usarla cuando:

- un archivo JS/TS/JSX/TSX está creciendo demasiado
- un componente React cuesta seguirlo
- hay demasiada mezcla entre UI y dominio
- sospechas que conviene extraer hooks, utilidades, tipos o constantes
- quieres una propuesta de refactor pequeña antes de tocar nada
- quieres mejorar mantenibilidad sin rediseñar el proyecto

---

## Cuándo no usar esta skill

No usarla como skill principal cuando:

- el archivo es pequeño y ya es claro
- la tarea real es funcional y urgente, no de mantenibilidad
- el problema es de seguridad, despliegue o CI/CD
- lo que toca es intake, continuidad o auditoría de worktree
- el usuario quiere una reescritura grande, no un refactor progresivo
- aún no se entiende el proyecto ni el estilo del repo

---

## Criterio de calidad

Una buena aplicación de esta skill:

- detecta complejidad real y no solo tamaño
- propone poco pero útil
- respeta el estilo del proyecto
- evita cambios innecesarios
- mejora claridad sin romper comportamiento
- refuerza separación entre UI y dominio
- mantiene JSDoc correcto en funciones afectadas

---

## Regla final

Si dudas entre:

- extraer una pieza más
- o parar tras una mejora clara y revisable

prefiere parar.
