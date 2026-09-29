/**
 * O atlas publicado tem de apontar para a imagem PELO CONTEÚDO dela.
 *
 * O defeito que isto previne é silencioso: `tiles.png` e `tiles.json` em URL fixa, cada um com uma
 * hora de cache e nada obrigando os dois a serem da mesma geração. O navegador busca o JSON novo,
 * reaproveita o PNG velho do cache, e desenha as coordenadas de um atlas contra os pixels de outro
 * — cenário com tile trocado, sem erro nenhum no console.
 *
 * Um atlas publicado por ferramenta antiga (ou copiado à mão) volta a ter o par frouxo sem avisar,
 * e é por isso que o guarda olha o ARQUIVO PUBLICADO e não o código que o gera.
 */
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const PUBLICADO = join('..', '..', 'packages', 'server', 'public', 'atlas')
const ATLASES = ['tiles', 'pokemon', 'golpes'] as const
/** O mesmo piso que o servidor exige em `politicaDoAtlas` para conceder um ano de cache. */
const VERSAO_MINIMA = 8

interface Folha { readonly meta: { readonly image: string } }

describe('atlas publicado é endereçado pelo conteúdo', () => {
  it.each(ATLASES)('%s: o JSON aponta para o PNG com um prefixo do hash dele', async (base) => {
    const [folha, png] = await Promise.all([
      readFile(join(PUBLICADO, `${base}.json`), 'utf8').then((t) => JSON.parse(t) as Folha),
      readFile(join(PUBLICADO, `${base}.png`)),
    ])
    const esperado = new RegExp(`^${base}\\.png\\?v=([0-9a-f]{${VERSAO_MINIMA},})$`)
    const casado = esperado.exec(folha.meta.image)
    expect(casado, `meta.image de ${base}.json é "${folha.meta.image}"`).not.toBeNull()

    const hash = createHash('sha1').update(png).digest('hex')
    // Prefixo, e não igualdade: o build escolhe quantos dígitos gastar, e o servidor aceita
    // qualquer prefixo longo o bastante. Não há constante para as duas pontas discordarem.
    expect(hash.startsWith(casado![1]!), `${casado![1]!} não é prefixo de ${hash}`).toBe(true)
  })
})
