/**
 * Partido externo («enlace de partido» v1, productor: loyola-hockey-matches).
 *
 * La URL llega como `#partido=<base64url(JSON UTF-8)>`. El payload es entrada
 * NO confiable: se valida a mano, campo a campo, y si algo esencial falla se
 * descarta entero (el juego sigue como siempre y avisa por consola). El juego
 * nunca descarga escudos: solo usa los data URL del payload.
 *
 * Los equipos del partido ocupan los huecos internos 'blue' (el que controla la
 * persona) y 'red' (IA); el marcador sí respeta local-izquierda / visitante-derecha.
 */
import type { TeamColor } from './types'

export type Lado = 'local' | 'visitante'

export interface EquipacionExterna {
  camiseta: number
  pantalon: number
  medias: number
  detalle: number
  dorsal: number
}

export interface JugadorExterno {
  nombre: string
  dorsal: string | null
  rol: 'portero' | 'jugador'
  titular: boolean
  capitan: boolean
}

export interface EquipoExterno {
  nombre: string
  abrev: string
  /** Data URL ya validado (image/png|webp|jpeg) o null. */
  escudo: string | null
  equipacion: EquipacionExterna
  segunda: boolean
  plantilla: JugadorExterno[]
  /** Dorsales finales de la 5 en pista: [portero, campo×4]; los huecos ya están generados. */
  dorsales: string[]
  /** Nombres de la 5 en pista, en el mismo orden que `dorsales`; null en los huecos generados. */
  nombres: (string | null)[]
}

export interface PartidoExterno {
  partidoId: string
  competicion: string | null
  fecha: string | null
  hora: string | null
  pista: string | null
  sugerido: Lado | null
  local: EquipoExterno
  visitante: EquipoExterno
}

const MAX_FRAGMENTO = 48_000
const MAX_ESCUDO = 16_000
const RE_COLOR = /^#[0-9a-fA-F]{6}$/
const RE_ESCUDO = /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/
const RE_DORSAL = /^\d{1,3}$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}$/
/** Dorsales de relleno para huecos sin plantilla; se saltan los ya usados por el equipo. */
const DORSALES_CAMPO = ['4', '7', '9', '10', '5', '8', '11', '6', '3', '2', '12', '13', '14', '15']

let partido: PartidoExterno | null = null
let humano: Lado = 'local'
const escudos: Record<Lado, HTMLImageElement | null> = { local: null, visitante: null }

// ─── Validación ──────────────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Texto recortado y sin caracteres de control; null si no es texto o queda vacío. */
function texto(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  // eslint-disable-next-line no-control-regex
  const t = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return t || null
}

const color = (v: unknown): number | null => (typeof v === 'string' && RE_COLOR.test(v) ? parseInt(v.slice(1), 16) : null)

/**
 * Dorsal normalizado sin ceros a la izquierda («02» → «2»): así se pinta en la
 * camiseta y así se comparan los repetidos. Acepta también un entero 0–999.
 */
function dorsal(v: unknown): string | null {
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 999 ? String(v) : null
  return typeof v === 'string' && RE_DORSAL.test(v.trim()) ? String(Number(v.trim())) : null
}

function jugador(v: unknown): JugadorExterno | null {
  if (!esObjeto(v)) return null
  return {
    nombre: texto(v.nombre, 24) ?? '',
    dorsal: dorsal(v.dorsal),
    rol: v.rol === 'portero' ? 'portero' : 'jugador',
    titular: v.titular === true,
    capitan: v.capitan === true,
  }
}

/**
 * Portero y 4 de campo según el contrato: primero los titulares de cada rol, en
 * el orden del payload, y se completa con suplentes. Los dorsales ausentes o
 * repetidos se generan sin chocar con los reales de la 5 en pista.
 */
export function enPista(plantilla: JugadorExterno[]): { dorsales: string[], nombres: (string | null)[] } {
  const primeros = (rol: JugadorExterno['rol'], n: number) => {
    const delRol = plantilla.filter(j => j.rol === rol)
    return [...delRol.filter(j => j.titular), ...delRol.filter(j => !j.titular)].slice(0, n)
  }
  const campo = primeros('jugador', 4)
  const cinco = [primeros('portero', 1)[0], ...Array.from({ length: 4 }, (_, i) => campo[i])]
  // Primera pasada: los dorsales reales; el primero que lo trae se lo queda y el repetido pasa a generado
  const usados = new Set<string>()
  const dorsales: (string | null)[] = cinco.map(j => {
    if (!j?.dorsal || usados.has(j.dorsal)) return null
    usados.add(j.dorsal)
    return j.dorsal
  })
  // Segunda pasada: los huecos, sin pisar ninguno real aunque venga después
  const libre = (pool: string[]) => {
    let d = pool.find(n => !usados.has(n))
    for (let n = 20; d === undefined; n++) if (!usados.has(String(n))) d = String(n)
    usados.add(d)
    return d
  }
  return {
    dorsales: dorsales.map((d, i) => d ?? libre(i === 0 ? ['1', ...DORSALES_CAMPO] : DORSALES_CAMPO)),
    nombres: cinco.map(j => j?.nombre || null),
  }
}

function equipo(v: unknown, lado: Lado): EquipoExterno | null {
  if (!esObjeto(v)) return null
  const nombre = texto(v.nombre, 40)
  if (!nombre) return null
  const abrevRaw = texto(v.abrev, 5)?.toUpperCase()
  const eq = esObjeto(v.equipacion) ? v.equipacion : null
  const equipacion = eq && {
    camiseta: color(eq.camiseta), pantalon: color(eq.pantalon), medias: color(eq.medias),
    detalle: color(eq.detalle), dorsal: color(eq.dorsal),
  }
  if (!equipacion || Object.values(equipacion).some(c => c === null)) {
    console.warn(`[partido] equipación inválida en «${lado}»`)
    return null
  }
  const escudo = typeof v.escudo === 'string' && v.escudo.length <= MAX_ESCUDO && RE_ESCUDO.test(v.escudo) ? v.escudo : null
  const plantilla = (Array.isArray(v.plantilla) ? v.plantilla.slice(0, 14) : [])
    .map(jugador).filter((j): j is JugadorExterno => j !== null)
  return {
    nombre,
    abrev: abrevRaw ?? nombre.replace(/\s/g, '').slice(0, 3).toUpperCase(),
    escudo,
    equipacion: equipacion as EquipacionExterna,
    segunda: v.segunda === true,
    plantilla,
    ...enPista(plantilla),
  }
}

/** Valida un payload ya parseado; null (con aviso por consola) si no sirve. */
export function validarPartido(raw: unknown): PartidoExterno | null {
  if (!esObjeto(raw)) return null
  if (raw.v !== 1) {
    console.warn(`[partido] versión no soportada (${String(raw.v)}); se ignora`)
    return null
  }
  const local = equipo(raw.local, 'local')
  const visitante = equipo(raw.visitante, 'visitante')
  if (!local || !visitante) {
    console.warn('[partido] faltan equipos válidos; se ignora')
    return null
  }
  return {
    partidoId: texto(raw.partidoId, 60) ?? '',
    competicion: texto(raw.competicion, 60),
    fecha: typeof raw.fecha === 'string' && RE_FECHA.test(raw.fecha) ? raw.fecha : null,
    hora: typeof raw.hora === 'string' && RE_HORA.test(raw.hora) ? raw.hora : null,
    pista: texto(raw.pista, 60),
    sugerido: raw.sugerido === 'local' || raw.sugerido === 'visitante' ? raw.sugerido : null,
    local,
    visitante,
  }
}

/** base64url (sin relleno) → texto UTF-8; lanza si no es base64 ni UTF-8 válido. */
function decodificar(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

/** Lee `#partido=` de un fragmento; null si no está o no es válido. */
export function leerPartidoDeHash(hash: string): PartidoExterno | null {
  const m = /^#partido=([A-Za-z0-9_-]*)$/.exec(hash)
  if (!m) {
    if (hash.startsWith('#partido=')) console.warn('[partido] fragmento con caracteres no válidos; se ignora')
    return null
  }
  if (hash.length > MAX_FRAGMENTO) {
    console.warn('[partido] fragmento demasiado largo; se ignora')
    return null
  }
  try {
    return validarPartido(JSON.parse(decodificar(m[1])))
  } catch (e) {
    console.warn('[partido] no se pudo decodificar el payload; se ignora', e)
    return null
  }
}

// ─── Estado y acceso ─────────────────────────────────────────────────────────

/** Carga una imagen desde un data URL ya validado; null si falla o tarda demasiado. */
function cargarImagen(dataUrl: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new Image()
    const t = setTimeout(() => resolve(null), 2000)
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 0 ? img : null) }
    img.onerror = () => { clearTimeout(t); resolve(null) }
    img.src = dataUrl
  })
}

/** Lee el partido del fragmento y decodifica los escudos. Se espera antes de crear el juego. */
export async function initPartidoExterno(hash = window.location.hash): Promise<void> {
  partido = leerPartidoDeHash(hash)
  escudos.local = escudos.visitante = null
  if (!partido) return
  humano = partido.sugerido ?? 'local'
  const [l, v] = await Promise.all([
    partido.local.escudo ? cargarImagen(partido.local.escudo) : null,
    partido.visitante.escudo ? cargarImagen(partido.visitante.escudo) : null,
  ])
  escudos.local = l
  escudos.visitante = v
}

export function getPartidoExterno(): PartidoExterno | null {
  return partido
}

/** Vuelve al modo normal en esta sesión («Partido libre»). El hash no se toca: recargar la pestaña restaura el partido. */
export function descartarPartido() {
  partido = null
  humano = 'local'
  escudos.local = escudos.visitante = null
}

export function getLadoHumano(): Lado {
  return humano
}

export function setLadoHumano(lado: Lado) {
  humano = lado
}

/** Lado del partido (local/visitante) que juega en un hueco interno: la persona es 'blue'. */
export function ladoDeHueco(hueco: TeamColor): Lado {
  const contrario: Lado = humano === 'local' ? 'visitante' : 'local'
  return hueco === 'blue' ? humano : contrario
}

/** Equipo externo que ocupa un hueco interno, o null en el modo normal. */
export function equipoDeHueco(hueco: TeamColor): EquipoExterno | null {
  return partido ? partido[ladoDeHueco(hueco)] : null
}

/** Nombre del equipo de un hueco para textos y locutor; `normal` en el modo de siempre. */
export function nombreDeHueco(hueco: TeamColor, normal: string): string {
  return equipoDeHueco(hueco)?.nombre ?? normal
}

/** Clave de textura del escudo de un lado, tras `registrarEscudos`; null si no hay. */
export function claveEscudo(lado: Lado): string | null {
  return escudos[lado] ? `escudo-${lado}` : null
}

/** Añade los escudos a las texturas de la escena (idempotente: el gestor es global del juego). */
export function registrarEscudos(textures: { exists(key: string): boolean; addImage(key: string, img: HTMLImageElement): unknown }) {
  for (const lado of ['local', 'visitante'] as const) {
    const img = escudos[lado]
    if (img && !textures.exists(`escudo-${lado}`)) textures.addImage(`escudo-${lado}`, img)
  }
}
