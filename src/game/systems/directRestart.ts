type Team = 'blue' | 'red'
type Kind = 'kickoff' | 'free-hit'

/**
 * R-03 · gol directo anulado (art. 5.8 y 7.3.b): un saque de centro o un libre indirecto que entra
 * en la portería rival sin que la bola toque a otro jugador, al portero ni un poste no vale.
 * `markDirect` se llama al soltar la bola; cualquier toque la limpia con `clearDirect`.
 */
let direct: { team: Team, kind: Kind, takerId: string } | null = null

export function markDirect(team: Team, kind: Kind, takerId: string) {
  direct = { team, kind, takerId }
}

export function clearDirect() {
  direct = null
}

/** Si el gol de `scorer` es un directo sin tocar a nadie, devuelve de qué saque viene; si no, null. */
export function directFor(scorer: Team): Kind | null {
  return direct && direct.team === scorer ? direct.kind : null
}

/** Medida del humo: goles anulados por equipo que marca. */
export const directStats = { goalsAnnulled: { blue: 0, red: 0 } }

export function resetDirectStats() {
  directStats.goalsAnnulled.blue = 0
  directStats.goalsAnnulled.red = 0
}

/** Solo laboratorio (DEV): `?koshot=1` hace que el que saca de la IA tire a puerta en vez de pasar. */
export const koShot = import.meta.env.DEV && new URLSearchParams(window.location.search).get('koshot') === '1'
