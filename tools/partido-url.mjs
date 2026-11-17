/**
 * Genera la URL de un «enlace de partido» v1 (#partido=<base64url(JSON UTF-8)>).
 *
 * Uso:  node tools/partido-url.mjs [payload.json] [urlJuego]
 *   payload.json  por defecto tools/partido-ejemplo.json
 *   urlJuego      por defecto http://localhost:5173/
 * Sin dependencias. El resultado se pega en el navegador o se pasa a gfx-shot.ps1 en -Query.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const aqui = dirname(fileURLToPath(import.meta.url))
const archivo = process.argv[2] ?? resolve(aqui, 'partido-ejemplo.json')
const base = (process.argv[3] ?? 'http://localhost:5173/').replace(/#.*$/, '')

const json = JSON.stringify(JSON.parse(readFileSync(archivo, 'utf8')))
const fragmento = Buffer.from(json, 'utf8').toString('base64url')
const url = `${base}#partido=${fragmento}`
if (`#partido=${fragmento}`.length > 48000) console.error('AVISO: el fragmento supera 48000 caracteres; el juego lo descartará.')
console.log(url)
