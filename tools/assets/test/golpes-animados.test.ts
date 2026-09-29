/**
 * Todo tipo de golpe que o jogo usa precisa ter animação.
 *
 * O caminho de reserva existe e é silencioso de propósito — instalação com atlas antigo continua
 * jogável —, e é justamente por isso que um tipo esquecido não dá erro: o `textures[nome]` devolve
 * `undefined`, o cliente desenha o pontinho colorido, e ninguém procura o que não quebrou. Este
 * teste é quem procura.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { TypeName } from '@pokeidle/shared'
import { loadManifest } from '../src/manifest.js'
import { loadCatalog } from '../src/extract.js'

const DADOS = join('..', '..', 'packages', 'shared', 'data')

const tiposUsados = async (): Promise<TypeName[]> => {
  const moves = JSON.parse(await readFile(join(DADOS, 'moves.json'), 'utf8')) as { type: TypeName }[]
  return [...new Set(moves.map((m) => m.type))].sort()
}

describe('animação de golpe por tipo', () => {
  it('todo tipo que algum golpe usa tem projétil e efeito declarados', async () => {
    const manifest = await loadManifest('manifest.json')
    const declarados = new Map((manifest.golpes ?? []).map((g) => [g.type, g]))
    const faltando = (await tiposUsados()).flatMap((t) => {
      const g = declarados.get(t)
      if (!g) return [`${t}: sem entrada em "golpes"`]
      return [
        ...(g.projetil === undefined ? [`${t}: sem projétil`] : []),
        ...(g.efeito === undefined ? [`${t}: sem efeito`] : []),
      ]
    })
    expect(faltando).toEqual([])
  })

  it('todo id declarado existe no catálogo do dump', async () => {
    const [manifest, catalog] = await Promise.all([loadManifest('manifest.json'), loadCatalog('../../assets/extracted-otp2019')])
    const temProjetil = new Set(catalog.missiles.map((m) => m.id))
    const temEfeito = new Set(catalog.effects.map((e) => e.id))
    const orfaos = (manifest.golpes ?? []).flatMap((g) => [
      ...(g.projetil !== undefined && !temProjetil.has(g.projetil) ? [`${g.type}: projétil ${g.projetil} não existe`] : []),
      ...(g.efeito !== undefined && !temEfeito.has(g.efeito) ? [`${g.type}: efeito ${g.efeito} não existe`] : []),
    ])
    expect(orfaos).toEqual([])
  })
})
