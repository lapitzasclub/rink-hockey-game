# Convención de comentarios y estilo interno

## Objetivo

Mantener el código fácil de retomar por otros agentes y por humanos, sin caer en comentarios de ruido.

## Regla general

No comentar lo obvio. Sí comentar:

- intención de un módulo,
- decisiones de diseño no evidentes,
- orden importante de ejecución,
- heurísticas o simplificaciones temporales,
- límites conocidos del sistema,
- cualquier regla de juego que no se deduzca rápido leyendo el código.

## Qué evitar

- Comentarios que repiten literalmente el nombre de la variable o de la línea.
- Bloques enormes de texto que envejecen mal.
- Explicar sintaxis básica de TypeScript o Phaser.

## Dónde comentar

### Obligatorio o muy recomendable

- escena principal,
- systems,
- reglas de partido,
- IA,
- posesión/colisiones,
- heurísticas de pase o tiro,
- cualquier código con orden de ejecución sensible.

### Opcional

- helpers triviales,
- wiring simple,
- getters evidentes.

## Formato preferido

- Comentarios cortos de bloque con `/** ... */` en funciones o módulos clave.
- Comentarios inline solo cuando una línea concreta lo necesite de verdad.
- Redacción clara en español.

## Criterio de calidad

Si borras el comentario y el siguiente agente tarda bastante más en entender la intención, el comentario probablemente sí era útil.
