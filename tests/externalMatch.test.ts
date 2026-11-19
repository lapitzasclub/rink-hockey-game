// Contrato `#partido=` v1: dorsales y 5 en pista. Ejecutar con `npm test` (node --test, sin dependencias).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { enPista, validarPartido, type JugadorExterno } from '../src/game/externalMatch.ts'

const j = (nombre: string, dorsal: string | null, rol: JugadorExterno['rol'] = 'jugador', titular = false): JugadorExterno =>
  ({ nombre, dorsal, rol, titular, capitan: false })

const equipacion = { camiseta: '#1f4fa8', pantalon: '#ffffff', medias: '#ffffff', detalle: '#ffffff', dorsal: '#ffffff' }
const payload = (plantilla: unknown[]) => ({
  v: 1, partidoId: 't',
  local: { nombre: 'Local', equipacion, plantilla },
  visitante: { nombre: 'Visitante', equipacion, plantilla: [] },
})

test('14 jugadores, 2 porteros, 5 titulares desordenados y dorsales nulos', () => {
  const plantilla = [
    j('Suplente A', '3'),
    j('Portero 2', '13', 'portero'),
    j('Tit Campo 1', null, 'jugador', true),
    j('Suplente B', '5'),
    j('Tit Campo 2', '4', 'jugador', true),
    j('Portero Tit', null, 'portero', true),
    j('Suplente C', null),
    j('Tit Campo 3', '10', 'jugador', true),
    j('Suplente D', '8'),
    j('Tit Campo 4', '7', 'jugador', true),
    j('Suplente E', '9'),
    j('Suplente F', '11'),
    j('Suplente G', '12'),
    j('Suplente H', '14'),
  ]
  const { dorsales, nombres } = enPista(plantilla)
  assert.deepEqual(nombres, ['Portero Tit', 'Tit Campo 1', 'Tit Campo 2', 'Tit Campo 3', 'Tit Campo 4'])
  // El portero sin dorsal recibe el 1; el de campo sin dorsal no pisa el 4 ni el 7 reales que vienen después
  assert.equal(dorsales[0], '1')
  assert.deepEqual(dorsales.slice(2), ['4', '10', '7'])
  assert.equal(dorsales[1], '9')
  assert.equal(new Set(dorsales).size, 5)
})

test('con más de 4 titulares de campo entran los 4 primeros; sin portero titular, el primer portero', () => {
  const plantilla = [
    j('P1', '1', 'portero'), j('P2', '13', 'portero'),
    ...[1, 2, 3, 4, 5].map(n => j(`T${n}`, String(n + 1), 'jugador', true)),
    j('S1', '20'),
  ]
  const { nombres } = enPista(plantilla)
  assert.deepEqual(nombres, ['P1', 'T1', 'T2', 'T3', 'T4'])
})

test('pocos titulares: se completa con suplentes en orden; sin plantilla, todo generado', () => {
  assert.deepEqual(enPista([j('Solo', '7', 'jugador', true), j('S', '8')]).nombres, [null, 'Solo', 'S', null, null])
  const vacio = enPista([])
  assert.deepEqual(vacio.nombres, [null, null, null, null, null])
  assert.equal(new Set(vacio.dorsales).size, 5)
  assert.equal(vacio.dorsales[0], '1')
})

test('dorsales con cero a la izquierda se normalizan y cuentan como repetidos', () => {
  const p = validarPartido(payload([
    { nombre: 'Portera', dorsal: '01', rol: 'portero', titular: true },
    { nombre: 'Dos', dorsal: '02', rol: 'jugador', titular: true },
    { nombre: 'Otro dos', dorsal: '2', rol: 'jugador', titular: true },
    { nombre: 'Nueve', dorsal: '09', rol: 'jugador', titular: true },
    { nombre: 'Num', dorsal: 7, rol: 'jugador', titular: true },
  ]))
  assert.ok(p)
  assert.equal(p.local.plantilla[1].dorsal, '2')
  assert.equal(p.local.plantilla[3].dorsal, '9')
  const d = p.local.dorsales
  assert.equal(d[0], '1')
  assert.equal(d[1], '2')
  assert.notEqual(d[2], '2')
  assert.equal(d[3], '9')
  assert.equal(d[4], '7')
  assert.equal(new Set(d).size, 5)
})

test('dorsales no válidos quedan como ausentes', () => {
  const p = validarPartido(payload([
    { nombre: 'A', dorsal: 'diez', rol: 'jugador', titular: true },
    { nombre: 'B', dorsal: '1000', rol: 'jugador' },
    { nombre: 'C', dorsal: -3, rol: 'jugador' },
    { nombre: 'D', dorsal: null, rol: 'jugador' },
  ]))
  assert.ok(p)
  assert.deepEqual(p.local.plantilla.map(x => x.dorsal), [null, null, null, null])
})
