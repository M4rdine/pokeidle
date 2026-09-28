/**
 * Toda área PUBLICADA tem que ser jogável a pé.
 *
 * Existia um guarda parecido, mas ele olha o mapa desenhado no Tiled — e as áreas recortadas do
 * mundo OpenTibia já não vêm de lá. O buraco apareceu na prática: o Pico Rochoso foi publicado com
 * o rhydon nascendo DENTRO DA ROCHA, sem erro em lugar nenhum, porque o importador realocava a
 * entrada e o Centro e esquecia os nascimentos.
 *
 * Este guarda não sabe de onde o mapa veio, e é essa a graça: vale para o desenhado, para o
 * recortado e para o que ainda vier.
 */
import { describe, expect, it } from 'vitest'
import { rawData } from '../src/data-files.js'

interface Ponto { readonly x: number; readonly y: number }
interface Hunt {
  readonly id: string
  readonly width: number
  readonly height: number
  readonly layers: { readonly blocking: readonly boolean[] }
  readonly spawnPoint: Ponto
  readonly pokecenter: Ponto
  readonly spawns: readonly Ponto[]
}

const hunts = rawData.hunts as unknown as readonly Hunt[]

/** Tudo que se alcança a pé a partir de um ponto, andando em cruz. */
function alcancavel(h: Hunt, de: Ponto): Set<number> {
  const vistos = new Set<number>([de.y * h.width + de.x])
  const fila: Ponto[] = [de]
  while (fila.length > 0) {
    const { x, y } = fila.pop()!
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= h.width || ny >= h.height) continue
      const i = ny * h.width + nx
      if (vistos.has(i) || h.layers.blocking[i]) continue
      vistos.add(i)
      fila.push({ x: nx, y: ny })
    }
  }
  return vistos
}

const pontos = (h: Hunt): { nome: string; p: Ponto }[] => [
  { nome: 'entrada', p: h.spawnPoint },
  { nome: 'Centro Pokémon', p: h.pokecenter },
  ...h.spawns.map((p, i) => ({ nome: `nascimento ${i}`, p })),
]

describe('toda área publicada é jogável a pé', () => {
  it('entrada, Centro e todo nascimento caem em tile andável', () => {
    const presos = hunts.flatMap((h) =>
      pontos(h)
        .filter(({ p }) => h.layers.blocking[p.y * h.width + p.x])
        .map(({ nome, p }) => `${h.id}: ${nome} em (${p.x},${p.y}) está dentro de parede`))
    expect(presos).toEqual([])
  })

  it('e todos se alcançam a partir da entrada', () => {
    const isolados = hunts.flatMap((h) => {
      const daEntrada = alcancavel(h, h.spawnPoint)
      return pontos(h)
        .filter(({ p }) => !daEntrada.has(p.y * h.width + p.x))
        .map(({ nome, p }) => `${h.id}: ${nome} em (${p.x},${p.y}) não se alcança da entrada`)
    })
    expect(isolados).toEqual([])
  })
})
