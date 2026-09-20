import { describe, expect, it } from 'vitest'
import { cropRegion, type Rect } from '../src/region-import.js'

/** Mapa 4×3 cujos gids codificam a posição: 100 + y*10 + x, para o recorte ser conferível de olho. */
const mapa = {
  orientation: 'orthogonal' as const,
  width: 4,
  height: 3,
  tilewidth: 32,
  tileheight: 32,
  tilesets: [{ firstgid: 1 }],
  layers: [
    { type: 'tilelayer' as const, name: 'ground', data: [100, 101, 102, 103, 110, 111, 112, 113, 120, 121, 122, 123] },
    { type: 'tilelayer' as const, name: 'detail', data: Array.from({ length: 12 }, () => 0) },
    { type: 'tilelayer' as const, name: 'blocking', data: Array.from({ length: 12 }, () => 0) },
    {
      type: 'objectgroup' as const,
      name: 'objects',
      objects: [
        { id: 1, class: 'spawnPoint', x: 64, y: 32, width: 32, height: 32 },
        { id: 2, class: 'pokecenter', x: 96, y: 64, width: 32, height: 32 },
        { id: 9, class: 'spawnPoint', x: 0, y: 0, width: 32, height: 32 },
      ],
    },
  ],
}

const rect: Rect = { x: 2, y: 1, width: 2, height: 2 }

describe('cropRegion', () => {
  it('recorta as camadas de tile no retângulo pedido', () => {
    const recorte = cropRegion(mapa, rect)
    expect([recorte.width, recorte.height]).toEqual([2, 2])
    const ground = recorte.layers.find((l) => l.name === 'ground')
    expect(ground && 'data' in ground ? ground.data : null).toEqual([112, 113, 122, 123])
  })

  it('mantém apenas os objetos dentro do retângulo e traduz as coordenadas', () => {
    const recorte = cropRegion(mapa, rect)
    const grupo = recorte.layers.find((l) => l.type === 'objectgroup')
    const objs = grupo && 'objects' in grupo ? grupo.objects : []
    expect(objs.map((o) => o.id)).toEqual([1, 2])
    // (64,32) em pixels é o tile (2,1); dentro de um recorte que começa em (2,1) vira (0,0)
    expect(objs[0]).toMatchObject({ id: 1, x: 0, y: 0 })
    // (96,64) é o tile (3,2) → (1,1) → 32,32
    expect(objs[1]).toMatchObject({ id: 2, x: 32, y: 32 })
  })

  it('não altera o mapa de entrada', () => {
    const copia = JSON.parse(JSON.stringify(mapa))
    cropRegion(mapa, rect)
    expect(mapa).toEqual(copia)
  })

  it('recusa retângulo que sai dos limites do mapa', () => {
    expect(() => cropRegion(mapa, { x: 3, y: 0, width: 2, height: 2 })).toThrow(/fora dos limites/)
    expect(() => cropRegion(mapa, { x: 0, y: 0, width: 0, height: 2 })).toThrow(/largura e altura/)
  })

  it('preserva camada opcional ausente sem inventar dados', () => {
    const recorte = cropRegion(mapa, rect)
    expect(recorte.layers.some((l) => l.name === 'canopy')).toBe(false)
  })
})
