# Registro de gasto por paquete

Una fila por paquete cerrado, de cualquier workflow (`/dev`, `/gfx`, `/perf`, `/bal`, `/lanz`, `/evo`). Tokens y duración salen de la notificación de fin de cada agente; se suman las rondas. Sirve para ver qué tipo de trabajo sale caro y ajustar el enrutado de [WORKFLOW.md](./WORKFLOW.md) §1.

| Fecha | Paquete | Agentes (modelo) | Rondas | Tokens (k) | Duración (min) | Resultado | Nota |
|---|---|---|---|---|---|---|---|
| 2026-11-21 | evo · referencia de humo (20 × 2 modos) | perf-qa (haiku) | 1 | 32 | 5,4 | hecho | medida delegada en haiku: el coste de esperar el humo no lo paga opus |
| 2026-11-21 | evo E-17 animación secundaria | gfx-engineer (opus) | 1 | 136 | 24,9 | aceptado | 141 herramientas; buena parte en capturas y en el EBUSY de Vite con gfx-shot dentro del worktree |
