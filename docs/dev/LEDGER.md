# Registro de gasto por paquete

Una fila por paquete cerrado, de cualquier workflow (`/dev`, `/gfx`, `/perf`, `/bal`, `/lanz`, `/evo`). Tokens y duración salen de la notificación de fin de cada agente; se suman las rondas. Sirve para ver qué tipo de trabajo sale caro y ajustar el enrutado de [WORKFLOW.md](./WORKFLOW.md) §1.

| Fecha | Paquete | Agentes (modelo) | Rondas | Tokens (k) | Duración (min) | Resultado | Nota |
|---|---|---|---|---|---|---|---|
| 2026-11-21 | evo · referencia de humo (20 × 2 modos) | perf-qa (haiku) | 1 | 32 | 5,4 | hecho | medida delegada en haiku: el coste de esperar el humo no lo paga opus |
| 2026-11-21 | evo E-17 animación secundaria | gfx-engineer (opus) | 1 | 136 | 24,9 | aceptado | 141 herramientas; buena parte en capturas y en el EBUSY de Vite con gfx-shot dentro del worktree |
| 2026-11-21 | evo E-15 física de patinaje | ai-engineer (opus) + perf-qa (haiku) | 1 | 153 + 38 | 36,9 + 5,9 | aceptado | opus pasó 22 corridas de humo propias: bajar a 5 por modo en la verificación propia |
| 2026-11-21 | evo E-18 modelo de cerca | gfx-engineer (opus) | 1 | 68 | 16,8 | aceptado | encargo con tope de capturas: la mitad de tokens que E-17; dejó una línea suelta en main fuera de su worktree |
| 2026-11-21 | evo E-16 partículas de pista | gfx-engineer (opus) | 2 | 166 | 47,2 | aceptado | 197 herramientas: el más caro; demasiadas capturas en vivo buscando el momento del golpe; mejor la escena demo |
| 2026-11-21 | regla R-05 contadores del saque y base | regla-builder (sonnet) + regla-qa (haiku) | 1 | 39 + 20 | 11,1 + 10,6 | aceptado | encargo con rangos: 33 herramientas; QA pasó los dos modos en paralelo (paso fijo, no afecta a los contadores) |
| 2026-11-21 | regla R-01 saque de centro con pase | regla-builder (sonnet) + regla-qa (haiku) | 1 | 49 + 44 | 1,9 + 3,7 | aceptado | bajó de opus a sonnet al copiar el apuntado del libre; QA lanzó los dos humos en paralelo otra vez: fijar la orden en regla-qa.md |
| 2026-11-21 | regla R-02 cinco segundos tras el saque | regla-builder (sonnet) | 1 | 31 | 0,8 | aceptado | Node bloqueado por NVM (firma); reinstalado; humo de aceptación lo pasó el coordinador |
| 2026-11-21 | regla R-03 gol directo anulado | regla-builder (sonnet) | 1 | 55 | 9,2 | aceptado | el caso forzado no llegaba a puerta y arcade descartaba el libre: lo arregló el coordinador (~10 líneas) con trazas en consola |
