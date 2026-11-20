import * as Phaser from 'phaser'
import { PASSIVITY } from '../constants'
import { ARCADE_FONT } from '../render/arcadeFx'
import { bakeGraphics } from '../render/bake'
import { teamKit } from '../render/puppet/kit'
import { equipoDeHueco } from '../externalMatch'
import type { PassivityState } from '../systems/rules'

/**
 * Cuenta atrás de tiempo de posesión y de aviso de juego pasivo (B-10), bajo el
 * videomarcador y entre los sancionados. Fondo horneado (una franja del color del
 * equipo con la bola, una imagen por equipo); el texto solo cambia con el segundo.
 * Se crea dentro de createHud, así entra en el grupo de arriba a la izquierda de HudLayout.
 */
const CX = 16 + 300 / 2
const CY = 6 + 58 + 20
const W = 156
const H = 26
const STRIPE = 18

export function createPassivityHud(scene: Phaser.Scene) {
  const external = equipoDeHueco('blue') !== null
  const pill = (team: 'blue' | 'red', fallback: number) => {
    const g = scene.add.graphics().setDepth(50)
    g.fillStyle(0x050b13, 0.88)
    g.fillRoundedRect(CX - W / 2, CY - H / 2, W, H, 9)
    g.fillStyle(external ? teamKit(team).jersey : fallback, 1)
    g.fillRoundedRect(CX - W / 2, CY - H / 2, STRIPE, H, { tl: 9, bl: 9, tr: 0, br: 0 })
    g.lineStyle(2, 0xffe36a, 0.75)
    g.strokeRoundedRect(CX - W / 2, CY - H / 2, W, H, 9)
    return bakeGraphics(g, `passivity-${team}`).setVisible(false)
  }
  const bg = { blue: pill('blue', 0x1f6fd1), red: pill('red', 0xd12a3c) }
  const text = scene.add.text(CX + STRIPE / 2, CY, '', {
    fontFamily: ARCADE_FONT, fontSize: '15px', color: '#ffe36a', stroke: '#050b13', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(51).setVisible(false)

  let shown = ''
  return {
    /**
     * Lee el estado del último paso; solo toca el texto si cambia el tipo, el equipo o el segundo.
     * En los parones (gol, falta, saque) los contadores no avanzan: se oculta.
     */
    update(ps: PassivityState, now: number) {
      const kind = now - ps.lastStep <= PASSIVITY.resumeGapMs ? ps.hudKind : null
      const key = kind ? `${kind}|${ps.hudTeam}|${Math.ceil(ps.hudMs / 1000)}` : ''
      if (key === shown) return
      shown = key
      bg.blue.setVisible(kind !== null && ps.hudTeam === 'blue')
      bg.red.setVisible(kind !== null && ps.hudTeam === 'red')
      text.setVisible(kind !== null)
      if (kind) text.setText(`${kind === 'possession' ? 'POSESIÓN' : 'PASIVO'} ${Math.ceil(ps.hudMs / 1000)}`)
    },
  }
}

export type PassivityHud = ReturnType<typeof createPassivityHud>
