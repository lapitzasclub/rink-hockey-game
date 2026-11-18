#!/usr/bin/env node
/**
 * Banco de rendimiento headless (docs/perf/WORKFLOW.md). Sin dependencias: lanza
 * Chrome/Edge con depuración remota y habla CDP con el WebSocket nativo de Node.
 *
 * Abre `?lab=match&mode=<modo>&ai=1&perfMs=<ms>` (IA contra IA en tiempo real con
 * render), aplica ralentización de CPU y viewport de dispositivo, y lee la línea
 * `[perf] {json}` que escribe src/game/perf/perfMonitor.ts. Con varias corridas
 * da la mediana de cada métrica.
 *
 * Uso:
 *   node tools/perf-bench.mjs --base http://127.0.0.1:5181/ --mode arcade --cpu 4 --runs 3
 *   node tools/perf-bench.mjs --profile movil          (perfil: escritorio | portatil | movil | movil-bajo)
 *   node tools/perf-bench.mjs --profile movil --json   (solo la línea [perf-bench] {json})
 *
 * Opciones: --base URL, --mode arcade|reglamento, --cpu N, --viewport WxHxDPR[,mobile],
 *   --ms N (medición), --warm N, --runs N, --soft (WebGL por software, SwiftShader: simula una GPU muy
 *   débil y mide sobre todo el coste de rellenar píxeles; por defecto se usa la GPU real),
 *   --query "a=1&b=2" (parámetros extra), --menu (mide el menú en vez del partido), --json.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Perfiles de dispositivo: CPU ralentizada y viewport (ancho × alto × DPR). */
const PROFILES = {
  escritorio: { cpu: 1, viewport: '1920x1080x1' },
  portatil: { cpu: 2, viewport: '1366x768x1' },
  movil: { cpu: 4, viewport: '844x390x3,mobile' },
  'movil-bajo': { cpu: 6, viewport: '740x360x2,mobile' },
}

function parseArgs(argv) {
  const a = { base: 'http://127.0.0.1:5173/', mode: 'arcade', cpu: 4, viewport: '1280x720x1', ms: 10000, warm: 2500, runs: 1, soft: false, query: '', menu: false, json: false }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i].replace(/^--/, '')
    if (k === 'soft' || k === 'menu' || k === 'json') { a[k] = true; continue }
    const v = argv[++i]
    if (k === 'profile') {
      const p = PROFILES[v]
      if (!p) throw new Error(`Perfil desconocido: ${v}. Opciones: ${Object.keys(PROFILES).join(', ')}`)
      Object.assign(a, p, { profile: v })
    } else if (k in a) a[k] = typeof a[k] === 'number' ? Number(v) : v
    else throw new Error(`Opción desconocida: --${k}`)
  }
  return a
}

function findBrowser() {
  const env = process.env
  const list = [
    `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const hit = list.find(p => p && existsSync(p))
  if (!hit) throw new Error('No se encontró Chrome ni Edge.')
  return hit
}

/** Cliente CDP mínimo sobre una sesión plana. */
class Cdp {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.listeners = []
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString())
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`))
        else resolve(msg.result)
      } else if (msg.method) {
        for (const l of this.listeners) l(msg)
      }
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
  on(fn) { this.listeners.push(fn) }
}

/** Navegadores abiertos: si el banco se interrumpe, que no queden procesos headless. */
const live = new Set()
const killAll = () => { for (const p of live) { try { p.kill() } catch { /* ya cerrado */ } } }
process.once('exit', killAll)
process.once('SIGINT', () => { killAll(); process.exit(130) })
process.once('SIGTERM', () => { killAll(); process.exit(143) })

async function launch(browser, soft, width, height) {
  const profile = mkdtempSync(join(tmpdir(), 'rh-perf-'))
  const flags = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
    `--window-size=${width},${height}`,
    // Sin esto Chrome frena rAF y temporizadores de una pestaña que cree oculta
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  ]
  if (soft) flags.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader')
  else flags.push('--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=default')
  const proc = spawn(browser, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] })
  live.add(proc)
  proc.once('exit', () => live.delete(proc))
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = ''
    const timer = setTimeout(() => reject(new Error('Chrome no abrió el puerto de depuración')), 20000)
    proc.stderr.on('data', (d) => {
      buf += d.toString()
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) { clearTimeout(timer); resolve(m[1]) }
    })
    proc.on('exit', (code) => reject(new Error(`Chrome salió con código ${code}`)))
  })
  return { proc, wsUrl, profile }
}

async function runOnce(a, browser) {
  const [dims, flag] = a.viewport.split(',')
  const [w, h, dpr] = dims.split('x').map(Number)
  const mobile = flag === 'mobile'
  const { proc, wsUrl, profile } = await launch(browser, a.soft, w, h)
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve); ws.addEventListener('error', reject) })
  const cdp = new Cdp(ws)
  try {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
    const s = (m, p) => cdp.send(m, p, sessionId)
    await s('Runtime.enable')
    await s('Page.enable')
    await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr || 1, mobile, screenOrientation: { type: 'landscapePrimary', angle: 90 } })
    if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 })
    if (a.cpu > 1) await s('Emulation.setCPUThrottlingRate', { rate: a.cpu })
    await s('Emulation.setFocusEmulationEnabled', { enabled: true })

    const errors = []
    const result = new Promise((resolve) => {
      cdp.on((msg) => {
        if (msg.sessionId !== sessionId) return
        if (msg.method === 'Runtime.consoleAPICalled') {
          const text = (msg.params.args ?? []).map(x => x.value ?? x.description ?? '').join(' ')
          if (text.startsWith('[perf] ')) resolve(JSON.parse(text.slice(7)))
          else if (msg.params.type === 'error') errors.push(text.slice(0, 200))
        } else if (msg.method === 'Runtime.exceptionThrown') {
          errors.push((msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text ?? '').slice(0, 200))
        }
      })
    })
    const base = a.base.endsWith('/') ? a.base : `${a.base}/`
    const scene = a.menu ? '' : `lab=match&mode=${a.mode}&ai=1&`
    const url = `${base}?${scene}perfMs=${a.ms}&perfWarm=${a.warm}${a.query ? `&${a.query}` : ''}`
    await s('Page.navigate', { url })
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Sin [perf] a tiempo')), a.ms * Math.max(2, a.cpu) + a.warm * 2 + 30000))
    const report = await Promise.race([result, timeout])
    return { ...report, errors }
  } finally {
    try { ws.close() } catch { /* ya cerrado */ }
    proc.kill()
    await new Promise(r => setTimeout(r, 400))
    try { rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome puede tardar en soltarlo */ }
  }
}

const median = (xs) => { const s = [...xs].sort((x, y) => x - y); return s[Math.floor((s.length - 1) / 2)] }

async function main() {
  const a = parseArgs(process.argv.slice(2))
  const browser = findBrowser()
  const runs = []
  for (let i = 0; i < a.runs; i++) {
    const r = await runOnce(a, browser)
    runs.push(r)
    if (!a.json) console.log(`run ${i + 1}/${a.runs}: ${r.fps} fps · frame p50 ${r.frameMs.p50} p95 ${r.frameMs.p95} ms · lógica ${r.updateMs.avg} · render ${r.renderMs.avg} (p95 ${r.renderMs.p95}) ms · tirones ${r.jank} · errores ${r.errors.length}`)
  }
  const pick = (f) => median(runs.map(f))
  const agg = {
    profile: a.profile ?? null, mode: a.menu ? 'menu' : a.mode, cpu: a.cpu, viewport: a.viewport, soft: a.soft, runs: runs.length,
    fps: pick(r => r.fps),
    frameP50: pick(r => r.frameMs.p50), frameP95: pick(r => r.frameMs.p95), frameP99: pick(r => r.frameMs.p99),
    updateAvg: pick(r => r.updateMs.avg), updateP95: pick(r => r.updateMs.p95),
    renderAvg: pick(r => r.renderMs.avg), renderP95: pick(r => r.renderMs.p95),
    jankPerMin: pick(r => r.jank / Math.max(1, r.ms) * 60000),
    errors: runs.reduce((n, r) => n + r.errors.length, 0),
    env: runs[0]?.env, quality: runs[0]?.quality ?? '',
  }
  if (!a.json) {
    console.log(`mediana: ${agg.fps} fps · frame p95 ${agg.frameP95} ms · lógica ${agg.updateAvg} ms · render ${agg.renderAvg} ms (p95 ${agg.renderP95}) · tirones/min ${agg.jankPerMin.toFixed(1)}`)
    if (agg.errors) console.log('errores:', runs.flatMap(r => r.errors).slice(0, 5))
  }
  console.log('[perf-bench] ' + JSON.stringify(agg))
}

main().catch((e) => { console.error(e.message); process.exit(1) })
