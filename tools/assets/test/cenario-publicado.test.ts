/**
 * DE ONDE VEM CADA TILE QUE O JOGO SERVE.
 *
 * O guarda anterior conferia o `maps/kanto.tmj` — a FONTE do Tiled — e por isso deixou de valer
 * exatamente onde mais precisava valer: o Pico Rochoso virou recorte de um mapa OpenTibia, saiu do
 * `.tmj`, e o teste continuou verde enquanto o mapa publicado se enchia de sprite do Tibia. Um
 * guarda que passa por não olhar é pior que nenhum, porque ele dá a garantia por escrito.
 *
 * Este confere o que o SERVIDOR ENTREGA, e é estrito nos dois sentidos:
 *
 *  - área desenhada não pode ter um tile que não venha de conjunto, transição ou prop do manifesto
 *    — é o que separa "arte própria" de "fan pack redistribuído";
 *  - área de mapa externo só pode ter tile `otbm-`, e precisa estar NOMEADA aqui embaixo.
 *
 * Conferir o publicado em vez da fonte é estritamente mais forte: o `.tmj` só chega ao jogo
 * passando por aqui.
 */
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const HUNTS = join('..', '..', 'packages', 'shared', 'data', 'hunts')

/**
 * As áreas que NÃO são arte própria.
 *
 * Pôr um id aqui é um ato deliberado, e ele não vem sozinho: a seção de licença do README diz
 * quais áreas usam sprite de terceiro, e essa lista tem que continuar batendo com esta. É por isso
 * que o teste exige igualdade exata, e não "contém" — uma área nova de mapa externo reprova até
 * alguém decidir declará-la nos dois lugares.
 *
 * TRÊS ÁREAS FICARAM DE FORA, cada uma por um motivo medido:
 *
 *  - `campo-inicial` é a vitrine da arte própria — é ela que o README mostra para provar que o
 *    pipeline desenha cenário;
 *  - `praia-longa` porque o mundo OpenTibia não TEM praia: areia é 4% da superfície inteira dele,
 *    e o melhor recorte possível saiu uma costa de mato. Seria mentir no nome da área;
 *  - `usina-velha` porque o recorte a PIOROU. Ela já era o elo fraco do jogo por matchup, e com
 *    caverna passou de 0,3 para 1,7 quedas por dez minutos. Trocar por uma caverna mais aberta
 *    levou a 4,7 — porque salão deixa quatro selvagens cercarem, e corredor só deixa um passar.
 *    Converter era piorar, então ela ficou como estava.
 */
const DE_MAPA_EXTERNO: ReadonlySet<string> = new Set([
  // Sete cavernas, dos andares 8 e 9 do mundo OpenTibia.
  'pico-rochoso', 'entrada-da-caverna', 'caverna-funda', 'gruta-umida',
  'tunel-rocha', 'trilha-da-vitoria', 'cume-indigo',
  // Seis de superfície, do andar 7.
  'bosque-denso', 'mata-fechada', 'campo-safari', 'trilha-pedregosa',
  'margem-do-lago', 'ilhas-espuma',
])

interface Hunt {
  readonly id: string
  readonly origem?: string
  readonly layers: {
    readonly ground: readonly (string | null)[]
    readonly detail: readonly (string | null)[]
    readonly canopy?: readonly (string | null)[]
  }
}

interface Manifest {
  readonly terrainSets: readonly { readonly name: string }[]
  readonly transitions: readonly { readonly name: string }[]
  readonly props: readonly { readonly name: string }[]
}

const lerHunts = async (): Promise<Hunt[]> => {
  const arquivos = (await readdir(HUNTS)).filter((f) => f.endsWith('.json')).sort()
  return Promise.all(arquivos.map(async (f) => JSON.parse(await readFile(join(HUNTS, f), 'utf8')) as Hunt))
}

/* Só as camadas de DESENHO: `blocking` é um vetor de booleanos, e iterá-lo junto já fez um guarda
 * deste projeto conferir os nomes "true" e "false". */
const tilesDe = (h: Hunt): Set<string> =>
  new Set([...h.layers.ground, ...h.layers.detail, ...(h.layers.canopy ?? [])].filter((t): t is string => t !== null))

describe('a origem do cenário de cada área publicada', () => {
  it('área desenhada usa só conjunto, transição ou prop do manifesto', async () => {
    const manifest = JSON.parse(await readFile('manifest.json', 'utf8')) as Manifest
    const comeca = (n: string, nomes: readonly { name: string }[]): boolean =>
      nomes.some((x) => n === x.name || n.startsWith(`${x.name}-`))
    const desenhado = (n: string): boolean =>
      comeca(n, manifest.terrainSets) || comeca(n, manifest.transitions) || comeca(n, manifest.props)

    const intrusos = (await lerHunts())
      .filter((h) => !DE_MAPA_EXTERNO.has(h.id))
      .flatMap((h) => [...tilesDe(h)].filter((n) => !desenhado(n)).map((n) => `${h.id}: ${n}`))
    expect(intrusos).toEqual([])
  })

  it('área de mapa externo usa só tile do recorte, e não mistura arte própria', async () => {
    const misturados = (await lerHunts())
      .filter((h) => DE_MAPA_EXTERNO.has(h.id))
      .flatMap((h) => [...tilesDe(h)].filter((n) => !n.startsWith('otbm-')).map((n) => `${h.id}: ${n}`))
    expect(misturados).toEqual([])
  })

  it('a lista de áreas de mapa externo bate com o que os arquivos declaram', async () => {
    // Sem isto, converter mais uma área passaria despercebido — e o README ficaria mentindo de novo.
    const declaram = (await lerHunts()).filter((h) => h.origem === 'otbm').map((h) => h.id).sort()
    expect(declaram).toEqual([...DE_MAPA_EXTERNO].sort())
  })

  it('nenhum mapa vem vazio: um mapa sem tiles passaria em tudo sem provar nada', async () => {
    const magros = (await lerHunts()).map((h) => ({ id: h.id, n: tilesDe(h).size })).filter((m) => m.n < 20)
    expect(magros).toEqual([])
  })
})
