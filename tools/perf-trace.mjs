#!/usr/bin/env node
/**
 * Resumen de una traza de rendimiento de Chrome (docs/perf/WORKFLOW.md §3): tiempo
 * propio y total por función a partir de las muestras de CPU. Sirve para trazas
 * guardadas con DevTools (Performance → Save profile) o con el MCP chrome-devtools
 * (`performance_stop_trace` con `filePath`), en .json o .json.gz.
 *
 * Uso: node tools/perf-trace.mjs <traza.json[.gz]> [--top 40] [--filter MatchScene]
 *
 * Ojo: con ralentización de CPU emulada, las pausas del hilo se atribuyen a la
 * función que estaba corriendo; una hoja trivial (un `has`, un setter) con mucho
 * tiempo propio suele ser ese artefacto. Fíate de los totales por subsistema.
 */
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const args = process.argv.slice(2)
const file = args.find(a => !a.startsWith('--'))
if (!file) {
  console.error('Uso: node tools/perf-trace.mjs <traza.json[.gz]> [--top N] [--filter texto]')
  process.exit(1)
}
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def }
const TOP = Number(opt('top', 40))
const FILTER = opt('filter', '')

let buf = readFileSync(file)
if (file.endsWith('.gz')) buf = gunzipSync(buf)
const data = JSON.parse(buf.toString())
const events = Array.isArray(data) ? data : data.traceEvents

const nodes = new Map()
const samples = []
for (const e of events) {
  if (e.name !== 'ProfileChunk') continue
  const c = e.args?.data?.cpuProfile
  if (!c) continue
  for (const n of c.nodes ?? []) nodes.set(n.id, n)
  const td = e.args.data.timeDeltas ?? []
  ;(c.samples ?? []).forEach((s, i) => samples.push([s, td[i] ?? 0]))
}
if (!samples.length) {
  console.error('La traza no trae muestras de CPU (¿se grabó sin "JavaScript samples"?).')
  process.exit(1)
}

const parentOf = new Map()
for (const n of nodes.values()) if (n.parent) parentOf.set(n.id, n.parent)
const keyOf = (n) => {
  const f = n.callFrame
  const url = (f.url || '').replace(/^.*\//, '').replace(/\?.*$/, '')
  return `${f.functionName || '(anónima)'} ${url}${url ? `:${f.lineNumber + 1}` : ''}`
}
const self = new Map()
const total = new Map()
let sum = 0
for (const [id, dt] of samples) {
  const n = nodes.get(id)
  if (!n) continue
  const k = keyOf(n)
  self.set(k, (self.get(k) || 0) + dt)
  sum += dt
  const seen = new Set()
  for (let cur = id; cur; cur = parentOf.get(cur)) {
    const kk = keyOf(nodes.get(cur))
    if (seen.has(kk)) continue
    seen.add(kk)
    total.set(kk, (total.get(kk) || 0) + dt)
  }
}
const table = (m) => [...m.entries()]
  .filter(([k]) => !FILTER || k.includes(FILTER))
  .sort((a, b) => b[1] - a[1]).slice(0, TOP)
  .map(([k, v]) => `${(v / 1000).toFixed(1).padStart(9)} ms ${(100 * v / sum).toFixed(1).padStart(5)} %  ${k}`).join('\n')
console.log(`muestras: ${(sum / 1000).toFixed(0)} ms`)
console.log('── tiempo propio ──\n' + table(self))
console.log('── tiempo total ──\n' + table(total))
