import { GAME_WIDTH } from '../../game/constants'
import type { TeamColor } from '../../game/types'
import { createFigure } from './labFigures'
import type { LabBuild, LabBuildCtx } from './labScenes'

/** Equipos de los sancionados de demo (`pen=N`): 2 azules y 1 rojo, y así sucesivamente. */
const PEN_TEAMS: TeamColor[] = ['blue', 'blue', 'red']
/** Fin de sanción de la demo: muy lejos, para que el contador muestre un tiempo fijo. */
const PEN_UNTIL_MS = 90000

/** Lado lejano: banquillos, mesa de oficiales y, con `pen=N`, N jugadores sancionados sentados. */
export function officialsScene(ctx: LabBuildCtx): LabBuild {
  const seats = { blue: 0, red: 0 }
  const figures = Array.from({ length: ctx.params.pen }, (_, i) => {
    const team = PEN_TEAMS[i % PEN_TEAMS.length]
    const fig = createFigure(ctx.scene, `lab-pen-${i}`, { team, role: 'defender', x: 0, y: 0 }, ctx.ball)
    fig.player.suspendedUntil = PEN_UNTIL_MS
    fig.player.container.setData('penSeat', seats[team]++)
    return fig
  })
  return { figures, frame: { sx: GAME_WIDTH / 2, sy: 95, zoom: 2 } }
}
