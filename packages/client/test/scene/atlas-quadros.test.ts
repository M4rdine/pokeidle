/**
 * O atlas publicado: todo quadro de Pokémon é QUADRADO.
 *
 * Este caso existe por causa de um defeito que viveu no repositório desde a primeira construção do
 * atlas e que nenhum teste via. O empacotador grava `w = image.width`, sem conferir nada, e uma
 * folha de origem do dump veio com 64×32 e o bicho desenhado na metade direita: o Charmander
 * ganhou quadro retangular, e todo consumidor que escala pelo lado do quadro passou a desenhá-lo
 * pela METADE do tamanho dos vizinhos e deslocado.
 *
 * Nada quebrava — o jogo rodava, os testes passavam, e o erro só aparecia a olho nu na tela do
 * inicial, onde os três ficam lado a lado para serem comparados. É o tipo de defeito que só um
 * teste sobre o ARTEFATO pega, porque ele não está em nenhum código.
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A partir do diretório do pacote: sob happy-dom, `import.meta.url` não é um caminho de arquivo.
const ATLAS = resolve(process.cwd(), '../server/public/atlas/pokemon.json')

describe('o atlas publicado', () => {
  it('não tem quadro retangular: a grade é de células quadradas', async () => {
    const folha = JSON.parse(await readFile(ATLAS, 'utf8')) as {
      frames: Record<string, { frame: { w: number; h: number } }>
    }
    const nomes = Object.keys(folha.frames)
    expect(nomes.length).toBeGreaterThan(0)
    const tortos = nomes.filter((n) => folha.frames[n]!.frame.w !== folha.frames[n]!.frame.h)
    expect(tortos).toEqual([])
  })
})
