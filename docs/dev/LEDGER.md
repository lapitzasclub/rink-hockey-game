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
| 2026-11-21 | regla R-06 apuntado del libre indirecto | regla-builder (sonnet) | 1 | 30 | 0,9 | aceptado | no vio el indicador (la IA suelta al pitar); el coordinador añadió `kind=free` al laboratorio y reforzó el trazo |
| 2026-11-21 | regla R-99 cierre (humo 20 × 2) | coordinador | — | — | — | humo aceptado | falta el partido del usuario |
| 2026-11-21 | evo E-19 celebraciones y parones | gfx-engineer (opus) + perf-qa (haiku) | 2 | 146 + 38 | 43,8 + 3,9 | aceptado | 305 herramientas; encargo sin presupuesto (anterior a §3.9): 241 en la 1.ª ronda; con tope M la 2.ª fueron 64. QA con los dos humos en paralelo: 9 herramientas |
| 2026-11-21 | evo E-99 banco movil-bajo (1.ª medida) | perf-qa (haiku) | 1 | 23 | 10,2 | dudoso | reglamento −20 % pero coincidió con E-20/E-21 arrancando: no medir con agentes vivos en la máquina |
| 2026-11-21 | evo E-20 reacciones en juego | gfx-engineer (opus) + perf-qa (haiku) | 2 | 155 + 43 + 42 | 13,2 + 15,8 + 4,5 | aceptado | 1.ª ronda pasó el tope M (107 herramientas); la 2.ª (S) se fue a 123 herramientas en 16 min: el tope de herramientas no se respeta, vigilar |
| 2026-11-21 | evo E-21 ceremonia y goles con peso | gfx-engineer (opus) + perf-qa (haiku) | 2 | 165 + 72 + 47 | 18,1 + 28,0 + 18,5 | aceptado | 1.ª ronda pasó el tope M; la 2.ª (S) 133 herramientas: los topes de herramientas no frenan a gfx-engineer. QA juntó humo y banco en un encargo |
| 2026-11-21 | perf P-14 regresión de E-16 (bisección, arreglo y cierre de E-99) | perf-qa (haiku) + perf-engineer (opus) + perf-qa (haiku) ×2 | 2 | ~40 + 76 + 21 + 49 + 28 | — + 11,5 + 7,7 + 18,5 + 5,7 | aceptado (parcial) | la bisección en haiku encontró el commit; la 2.ª ronda de opus midió antes de recortar y evitó empeorar media: 20 herramientas. Topes respetados (45 y 20) |
| 2026-11-21 | bug: libre pegado a la valla bloquea el saque | coordinador | 1 | — | ~10 | hecho | trivial sin agente; caso nuevo `wall=1` en el laboratorio; la 1.ª captura salió en arcade (pasar `mode=reglamento`) |
