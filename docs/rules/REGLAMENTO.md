# Reglamento de referencia (World Skate, Rules of the Game 2026)

Extracto de los artículos que toca `/regla`. Los agentes leen esto y **no** el PDF ni la web. Fuente: [rulebook-2026-en.pdf](https://hoqueipt.com/media/docs/rulebook-2026-en.pdf) (WS-RHTC Rules of the Game 2026, págs. 7–8 y 42). Si un paquete necesita otro artículo, el coordinador lo añade aquí antes de despachar.

## Art. 5 — Inicio y reinicio del juego (saque de centro)

| # | Texto (EN, literal) | Qué exige al juego |
|---|---|---|
| 5.2 | At the start of each period of the match and after a goal is scored, the ball is positioned at the centre of the centre circle. The game begins with a pass once the referee blows the whistle. | Bola en el punto central; tras el pitido **el que saca juega la bola** (no sale conduciéndola). |
| 5.3 | The visiting team starts the first period of the match or extra time. The home team starts the second period of the match or extra time. | 1.ª parte y 1.ª prórroga: visitante. 2.ª: local. |
| 5.4 | The team that suffers a goal restarts the match from the centre circle, except: a. If the goal was obtained at the end of any period of the match. b. The goals obtained in the penalty shootout of the tiebreaker of a match. | Saca el que encaja; sin saque si el gol cierra un periodo o es de la tanda. |
| 5.5 | In the execution of the centre pass all players remain in their half of the rink and only two of the players on the team making the pass can remain within the central circle. | Todos en su mitad; dentro del círculo solo dos del equipo que saca. Rivales fuera. |
| 5.6 | After the whistle of the main referees the ball is in play, and the opposing players can get it. | El rival puede entrar a por la bola desde el pitido. |
| 5.7 | In the execution of the centre pass the ball can be sent to the opposing half of the rink or kept in their own half. The team then has five seconds to move it into the attacking zone. | Pase hacia delante o hacia atrás; **5 s** para llevarla a campo rival. Incumplir → libre indirecto (como el tiempo de posesión). |
| 5.8 | If the player in charge of the execution of the centre pass decides, after the referee's whistle, to shoot directly at the opponent's goal and manages to score a goal without the ball touching any other player, it will not be valid. The match will be resumed with an indirect free hit from one of the lower corners of the penalty area more near the place where the ball entered. | Gol directo de saque **anulado** → libre indirecto desde la esquina inferior del área más cercana a donde entró. |

Art. 6.1: «The start or restart of the match can only be done by using the flat parts of the stick.» (Sin efecto en el juego: no modelamos la cara del stick.)

## Art. 7.3 — Goles no válidos

> A goal is not valid if it is the result of: a. Any deflection, on the skates or any part of the body of a player of the attacking team. b. The execution of an indirect free hit or a centre pass, when the ball enters directly into the goal of the opposing team, without having touched the goal or being played by another player. c. Purposefully hitting the ball over the top of the goal either to make a shot or a pass. […] the game is restarted with a faceoff that takes place from any of the lower corners of the relevant penalty area.

Art. 7.4: un gol a la vez que la señal de fin de periodo vale y no hay saque de centro.

## Campo (Reglamento técnico, art. 2)

- 2.8: línea divisoria; zona defensiva = la del equipo que saca de centro; zona de ataque = la defensiva del rival.
- 2.9: círculo central de **3 m de radio**; delimita la posición de los rivales en el saque.
- 2.10: punto de saque, círculo de 10 cm en el centro del círculo central.

## Estado en el juego (2026-11-21)

| Regla | Estado | Paquete |
|---|---|---|
| 5.2 juega la bola tras el pitido | ✅ apunta y suelta pase o tiro; pase automático a los 3 s | R-01 |
| 5.3 visitante abre | ✅ abre el rojo visitante; el azul la 2.ª parte (no hay prórroga) | R-04 |
| 5.4 saca el que encaja | ✅ | — |
| 5.5 colocación | ✅ (`matchFlow.kickoffTarget`) | — |
| 5.6 balón en juego al pitar | ✅ | — |
| 5.7 cinco segundos | ✅ `PASSIVITY.kickoffMs` desde la suelta, solo reglamento | R-02 |
| 5.8 / 7.3.b gol directo de saque o libre indirecto | ✅ anulado y reanudado en la esquina del área (`directRestart.ts`) | R-03 |
