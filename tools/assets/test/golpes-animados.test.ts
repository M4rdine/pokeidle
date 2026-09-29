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
import { efeitoAnimName, projetilFrameName, type TypeName } from '@pokeidle/shared'
import { loadManifest } from '../src/manifest.js'

const DADOS = join('..', '..', 'packages', 'shared', 'data')
/** O atlas PUBLICADO é versionado; o dump de onde ele sai, não. Ver o segundo caso. */
const ATLAS = join('..', '..', 'packages', 'server', 'public', 'atlas', 'golpes.json')

interface FolhaDeGolpes {
  readonly frames: Readonly<Record<string, unknown>>
  readonly animations: Readonly<Record<string, readonly string[]>>
}

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

  it('todo id declarado tem quadro no atlas PUBLICADO, com o nome que o cliente pede', async () => {
    /*
     * Contra o ATLAS, e não contra o dump: o dump é material de origem e não entra no git, então
     * um teste que o lê passa aqui e reprova no CI — foi o que aconteceu, e o Deploy foi pulado.
     *
     * E conferir o publicado é mais forte do que conferir o catálogo: ele pega também o manifest
     * editado sem reconstruir o atlas, que é o caminho por onde um tipo perderia a animação sem
     * ninguém ver — o cliente cai calado no desenho genérico.
     */
    const [manifest, folha] = await Promise.all([
      loadManifest('manifest.json'),
      readFile(ATLAS, 'utf8').then((t) => JSON.parse(t) as FolhaDeGolpes),
    ])
    const orfaos = (manifest.golpes ?? []).flatMap((g) => [
      // A célula do meio (1,1) do padrão 3×3 não é usada: nada voa para onde já está.
      ...(g.projetil === undefined ? [] : [[2, 1], [0, 1], [1, 0], [1, 2]]
        .filter(([px, py]) => !(projetilFrameName(g.projetil!, px!, py!) in folha.frames))
        .map(([px, py]) => `${g.type}: falta o projétil ${g.projetil} na direção ${px}${py}`)),
      ...(g.efeito !== undefined && !(efeitoAnimName(g.efeito) in folha.animations)
        ? [`${g.type}: falta a animação do efeito ${g.efeito}`] : []),
    ])
    expect(orfaos).toEqual([])
  })
})
