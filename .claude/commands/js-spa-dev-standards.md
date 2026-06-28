---
name: js-spa-dev-standards
description: Estándares de desarrollo para proyectos JavaScript/TypeScript basados en SPA, PWA y apps híbridas. Prioriza cambios pequeños, separación de dominio y UI, tipado claro, estilos mantenibles y evolución segura del código sin romper el estilo del proyecto.
---

# js-spa-dev-standards

## Propósito

Esta skill define criterios de desarrollo para proyectos JavaScript/TypeScript orientados a:

- SPA
- PWA
- apps híbridas con Capacitor
- interfaces React/Vite y ecosistemas similares

Su objetivo es ayudar a mantener el código legible, modular, revisable y coherente con el estilo del proyecto, evitando crecimiento desordenado y refactors improvisados.

No sustituye las reglas de seguridad ni la documentación específica de cada repo. Sirve como capa de criterio técnico para implementar, refactorizar o revisar cambios en este tipo de proyectos.

---

## Relación con `dev-safety-guardrails`

Esta skill debe respetar siempre `dev-safety-guardrails`.

Eso implica, entre otras cosas:

- no abrir secretos ni credenciales
- no tocar `.env*`
- no modificar configuraciones locales sensibles sin petición explícita
- no instalar dependencias nuevas sin justificación y confirmación
- no hacer `git add`
- no hacer commits automáticos
- no hacer `git push`
- no tocar despliegues, signing, CI/CD o configuraciones delicadas salvo petición explícita
- priorizar cambios pequeños, explicados y revisables

Si una decisión técnica choca con una limitación de seguridad, prevalece la seguridad.

---

## Objetivo de calidad

El código resultante debe tender a ser:

- legible
- modular
- tipado
- coherente
- móvil primero
- fácil de revisar
- fácil de seguir por otro agente o por el usuario
- razonablemente preparado para evolucionar sin acumulación rápida de deuda

---

## Principios generales

- Priorizar cambios pequeños, revisables y coherentes con el estilo existente.
- No meter arquitectura nueva si el problema no la necesita.
- Separar lógica de dominio de la UI.
- Evitar componentes gigantes o archivos inflados.
- Si un archivo crece demasiado, hacer pasadas de refactor razonables.
- Mantener el enfoque mobile-first.
- Si la app es híbrida, pensar siempre en web, Android e iOS.
- Reutilizar patrones existentes del repo antes de inventar otros.
- No añadir dependencias nuevas sin una razón clara y proporcional.

---

## Tamaño y crecimiento de archivos

### Regla de tamaño razonable

Intentar que los archivos no superen unas **500 líneas** cuando sea razonable.

No es un límite dogmático, pero sí una señal clara de revisión.

Si un archivo crece, conviene evaluar si procede extraer:

- constantes
- enums
- componentes
- funciones
- hooks
- utilidades
- tipos/modelos

### Señales de que toca extraer

Revisar si un archivo merece partición cuando ocurra una o varias de estas señales:

- mezcla demasiadas responsabilidades
- contiene UI, dominio, efectos y utilidades todo junto
- cuesta localizar la lógica importante
- repite bloques parecidos
- el componente principal queda enterrado entre helpers
- aparecen varios `useEffect` grandes o estados muy mezclados
- leer el archivo completo deja de ser cómodo

La extracción debe ser útil y no ornamental.

---

## Estructura lógica recomendada

### Separación entre dominio y UI

Siempre que sea razonable:

- la UI debe renderizar
- la lógica de dominio debe vivir fuera de los componentes visuales
- las transformaciones o evaluaciones deben estar separadas de los detalles de render

Ejemplos típicos de separación:

- cálculo clínico o de negocio → utilidades/evaluadores
- render de formularios → componentes/páginas
- persistencia local → capa de storage centralizada
- formateo → helpers específicos

### Componentes

Preferir componentes:

- pequeños o medianos
- con una responsabilidad clara
- fáciles de leer de arriba abajo
- sin mezclar demasiada lógica de negocio

Evitar:

- componentes “todo en uno”
- árboles de JSX enormes con lógica incrustada
- múltiples responsabilidades acopladas dentro del mismo archivo

### Hooks

Extraer hooks cuando haya:

- estado reutilizable
- efectos reutilizables
- coordinación de eventos repetida
- lógica de interacción o sincronización que ensucia el componente

Evitar crear hooks por deporte. Deben existir porque aclaran o reutilizan comportamiento.

### Utilidades

Extraer utilidades cuando:

- hay lógica pura reutilizable
- hay formateos repetidos
- hay validaciones repetidas
- hay mapeos de datos o adaptadores
- la lógica no depende del render

### Tipos y modelos

Tipar modelos de dominio de forma explícita cuando el proyecto use TypeScript.

Especialmente:

- entidades principales
- resultados de evaluadores
- estructuras persistidas
- contratos entre capas
- props complejas
- estructuras de formularios o resultados

Evitar que el dominio quede implícito en objetos sueltos sin contrato.

---

## JSDoc y comentarios

### JSDoc obligatorio para todas las funciones

Todas las funciones deben tener **JSDoc**.

Esto incluye:

- funciones exportadas
- funciones internas
- helpers locales
- hooks
- evaluadores
- mapeadores
- adaptadores
- handlers nombrados
- funciones de componentes

El JSDoc debe explicar, cuando aplique:

- intención
- parámetros
- retorno
- efectos secundarios
- supuestos
- restricciones
- ejemplo de uso si ayuda

El JSDoc no debe ser mecánico ni limitarse a repetir el nombre de la función.

### Excepción limitada para callbacks inline

Los callbacks inline extremadamente simples pueden no llevar JSDoc si documentarlos empeora la legibilidad.

Si un callback inline empieza a tener lógica relevante:

- debe extraerse a una función nombrada
- esa función debe llevar JSDoc

### Constantes relevantes

Documentar constantes relevantes cuando:

- representen reglas
- agrupen tokens de UI
- controlen límites
- codifiquen categorías o tablas
- encapsulen decisiones no obvias

### Comentarios normales

JSDoc es obligatorio para funciones.

Los comentarios normales deben reservarse para:

- lógica difícil
- decisiones no obvias
- workarounds
- restricciones de plataforma
- dependencias de una convención externa
- motivos de un orden o condición especial

Evitar:

- comentar lo obvio
- describir línea por línea lo que ya se entiende leyendo el código

---

## Estado, efectos y hooks React

### `useEffect`

Evitar `useEffect` demasiado cargados.

Si un `useEffect`:

- hace demasiadas cosas
- mezcla fetch, sincronización, listeners y derivación
- tiene condicionales difíciles de seguir
- depende de demasiadas variables

entonces conviene dividirlo, extraer lógica o replantear el flujo.

### Dependencias de `useEffect`

Revisar siempre dependencias de `useEffect`.

Objetivos:

- evitar cierres obsoletos
- evitar efectos que corren sin control
- evitar dependencias omitidas por conveniencia
- evitar bucles por referencias inestables

Si una dependencia se omite deliberadamente, debe estar muy justificado.

### Estado reutilizable

Extraer hooks cuando el estado:

- se repite
- es complejo
- mezcla persistencia, derivación y UI
- necesita aislarse para mantener legibilidad

---

## Persistencia local

Centralizar acceso a:

- `localStorage`
- `sessionStorage`

Evitar lecturas y escrituras dispersas por múltiples componentes si existe una alternativa razonable.

La capa de persistencia debe intentar ser:

- defensiva
- reutilizable
- fácil de testear
- clara respecto a claves, defaults y errores

Evitar duplicar claves mágicas y ramificaciones repetidas.

---

## Estilos y sistema visual

### Mobile-first

Mantener siempre diseño **mobile-first**.

Eso implica:

- pensar primero en pantallas pequeñas
- no asumir desktop como layout base
- evitar soluciones que solo se vean bien en escritorio
- validar jerarquía, espaciado y legibilidad en móvil

### Apps híbridas

Si la app es híbrida, considerar:

- web
- Android
- iOS

Tener cuidado con:

- safe areas
- navegación
- teclado virtual
- interacción táctil
- densidad visual
- diferencias de plataforma

### Estilos por componente

Preferir estilos por componente o por área funcional cuando sea razonable.

Objetivo:

- mantener cercanía entre UI y estilos
- reducir efectos colaterales
- hacer refactors localizados más fáciles

### Hoja global de app

Mantener una hoja global para variables y tema general, normalmente:

- claro
- oscuro

Allí deberían vivir:

- variables de color
- tokens globales
- espaciados base
- radios
- superficies
- sombras si existen
- otras decisiones globales consistentes

### Tokens y repetición

Evolucionar estilos desde variables/tokens.

Evitar hardcodear repetidamente:

- colores
- espaciados
- radios
- tamaños recurrentes
- duraciones de transición
- valores semánticos repetidos

Si un valor aparece varias veces y expresa una decisión de diseño, probablemente debe convertirse en token.

---

## Buenas prácticas obligatorias o preferentes

### Separar dominio de UI

La lógica de dominio no debe quedar enterrada en JSX ni en handlers largos si puede separarse limpiamente.

### Evitar componentes gigantes

Si un componente empieza a crecer demasiado:

- dividir subcomponentes
- extraer hooks
- extraer helpers
- mover tipos y constantes fuera

### Evitar literales mágicos

No dispersar cadenas, números o categorías repetidas sin una abstracción mínima cuando tengan significado de dominio o diseño.

### Tipar modelos de dominio

Las entidades y resultados principales deben tener tipos claros.

### Cubrir estados relevantes

Cuando aplique, cubrir explícitamente:

- loading
- error
- empty
- offline

No todos los flujos necesitan todo, pero si aplica, no dejar esos estados implícitos o sin resolver.

### No añadir dependencias nuevas sin justificación

Antes de añadir una dependencia:

- justificar qué problema resuelve
- comprobar si ya existe solución suficiente en el repo
- valorar coste de mantenimiento y tamaño conceptual

---

## Qué no debe fomentar esta skill

No debe empujar a:

- refactors masivos innecesarios
- mover archivos por gusto
- crear hooks, utilidades o tipos sin necesidad real
- introducir arquitectura excesiva para problemas pequeños
- duplicar patrones distintos para el mismo problema
- romper el estilo existente del proyecto por imponer uno nuevo
- añadir dependencias para problemas triviales

---

## Proceso de decisión recomendado

Antes de editar en un proyecto JS/SPA:

1. entender el patrón ya existente en el repo
2. detectar si el cambio es de UI, dominio, persistencia, estado o estilos
3. aplicar el cambio mínimo útil
4. evaluar si conviene extraer algo por crecimiento real
5. mantener consistencia con tokens, tipos y estructura existente
6. revisar si quedan estados no cubiertos (`loading/error/empty/offline`)
7. revisar si el resultado sigue siendo fácil de leer

---

## Señales de que conviene refactorizar

Refactorizar de forma razonable cuando aparezcan señales como:

- archivos acercándose o superando claramente las 500 líneas
- componente con demasiados estados y efectos
- JSX difícil de seguir
- duplicación de lógica
- duplicación de estilos o tokens
- acceso repetido a storage en varios puntos
- tipos implícitos o flojos en dominio importante
- demasiados literales mágicos
- efectos con dependencias frágiles

---

## Formato de salida esperado al aplicar esta skill

Cuando esta skill guíe una tarea, la respuesta o implementación debería tender a reflejar:

- cambios pequeños
- estructura clara
- separaciones razonables
- respeto por el estilo del repo
- uso prudente de comentarios y JSDoc
- atención a móvil y plataformas híbridas
- atención a estados de UI relevantes
- ausencia de complejidad innecesaria

---

## Cuándo usar esta skill

Usarla cuando:

- vayas a implementar o refactorizar en proyectos React/TypeScript/Vite
- trabajes sobre SPA o PWA
- trabajes sobre apps híbridas con Capacitor
- quieras revisar si una solución encaja con tus estándares personales
- necesites guiar una extracción de hooks, utilidades, tipos o componentes
- quieras mantener consistencia de estilos, tokens y diseño mobile-first

---

## Cuándo no usar esta skill

No usarla como skill principal cuando:

- la tarea es de seguridad o control de riesgos
- la tarea es solo de intake o continuidad
- el proyecto no pertenece al ecosistema JS/TS SPA o híbrido
- la tarea afecta sobre todo a backend, infra o CI/CD
- el problema es tan pequeño que aplicar este marco completo solo añadiría fricción
- el repo tiene una convención explícita incompatible y debes seguir la del proyecto

---

## Criterio de calidad

Una buena aplicación de esta skill:

- mejora legibilidad sin reventar el alcance
- reduce deuda sin sobreactuar
- mantiene la UI separada de la lógica relevante
- evita componentes excesivos
- deja el código más fácil de revisar
- respeta móvil, tema y plataformas híbridas
- no introduce complejidad gratuita

---

## Regla final

Si dudas entre:

- meter más estructura
- o dejar el cambio más simple y coherente

prefiere la opción más simple que siga siendo mantenible.
