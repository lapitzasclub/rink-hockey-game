/**
 * Compara lotes de humo sin que un agente tenga que leer el JSON (ahorro de tokens).
 *
 * Uso:
 *   node tools/bal-compare.mjs <base.txt> <nuevo.txt> [--keys a,b,c]   base frente a nuevo, por modo y extra
 *   node tools/bal-compare.mjs <lote.txt> --sides                       azul frente a rojo dentro de cada lote
 *
 * Lee todas las líneas `[smoke-agg] {json}` de cada archivo. Una diferencia solo cuenta si los
 * IC 95 % no se solapan: se marca ↑ / ↓; si se solapan, «=». Sin dependencias.
 */
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] ?? '' : null }
const keysArg = flag('--keys')
const sides = args.includes('--sides')
const files = args.filter(a => !a.startsWith('--'))

const DEFAULT_KEYS = ['goalsPerMin', 'redMinusBluePerMin', 'goalsBluePerMin', 'goalsRedPerMin', 'shotsBluePerMin', 'shotsRedPerMin',
  'savePctBlue', 'savePctRed', 'passPct', 'possessionBluePct', 'stealsPerMin']

/** Lotes de un archivo indexados por «modo · extra». */
function loadAggs(path) {
  const out = new Map()
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const i = line.indexOf('[smoke-agg] {')
    if (i < 0) continue
    const j = JSON.parse(line.slice(i + '[smoke-agg] '.length))
    out.set(`${j.mode} · ${j.extra || '-'}`, j)
  }
  return out
}

const fmt = (s) => s && typeof s.mean === 'number' ? `${s.mean.toFixed(2)} ± ${s.ci95.toFixed(2)}` : '—'
function verdict(a, b) {
  if (!a || !b || typeof a.mean !== 'number' || typeof b.mean !== 'number') return '?'
  if (b.mean - b.ci95 > a.mean + a.ci95) return '↑'
  if (b.mean + b.ci95 < a.mean - a.ci95) return '↓'
  return '='
}
const pad = (s, n) => String(s).padEnd(n)

if (sides) {
  // Simetría: pares azul/rojo del mismo lote
  const pairs = [['goalsBluePerMin', 'goalsRedPerMin'], ['shotsBluePerMin', 'shotsRedPerMin'], ['savePctBlue', 'savePctRed'],
    ['passesDoneBluePerMin', 'passesDoneRedPerMin'], ['shotQualityBlue', 'shotQualityRed'], ['savePctBlueHi', 'savePctRedHi'], ['savePctBlueLo', 'savePctRedLo']]
  for (const path of files) {
    for (const [label, j] of loadAggs(path)) {
      console.log(`\n${path} — ${label} (n ${j.runs})`)
      for (const [kb, kr] of pairs) {
        if (!j[kb] && !j[kr]) continue
        console.log(`  ${pad(kb.replace('Blue', '·'), 22)} azul ${pad(fmt(j[kb]), 16)} rojo ${pad(fmt(j[kr]), 16)} rojo vs azul ${verdict(j[kb], j[kr])}`)
      }
      const fails = ['failed', 'consoleErrors', 'jams', 'badPlayerFrames'].filter(k => j[k]).map(k => `${k} ${j[k]}`)
      if (fails.length) console.log(`  ⚠ ${fails.join(' · ')}`)
    }
  }
  process.exit(0)
}

if (files.length !== 2) {
  console.error('Uso: node tools/bal-compare.mjs <base.txt> <nuevo.txt> [--keys a,b]  |  <lote.txt> --sides')
  process.exit(1)
}
const [base, next] = files.map(loadAggs)
const keys = keysArg ? keysArg.split(',') : DEFAULT_KEYS
for (const [label, b] of next) {
  const a = base.get(label) ?? [...base.values()].find(x => x.mode === b.mode)
  console.log(`\n${label}  (base n ${a?.runs ?? 0} · nuevo n ${b.runs})`)
  if (!a) { console.log('  sin base con el mismo modo'); continue }
  for (const k of keys) {
    if (!a[k] && !b[k]) continue
    console.log(`  ${pad(k, 22)} ${pad(fmt(a[k]), 16)} → ${pad(fmt(b[k]), 16)} ${verdict(a[k], b[k])}`)
  }
  const fails = ['failed', 'consoleErrors', 'jams', 'badPlayerFrames'].filter(k => b[k]).map(k => `${k} ${b[k]}`)
  if (fails.length) console.log(`  ⚠ ${fails.join(' · ')}`)
}
