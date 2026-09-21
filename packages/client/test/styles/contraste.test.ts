/**
 * O contraste da paleta, medido — não estimado.
 *
 * Existe porque contraste é a única parte do design que dá para errar sem ninguém ver: a tela
 * fica bonita, o texto discreto fica ilegível para quem mais precisa dele, e a revisão seguinte
 * elogia a hierarquia. Já aconteceu duas vezes neste projeto — o rótulo discreto media 4,2:1 e o
 * vermelho de erro media 3,2:1, os dois reprovando em texto normal enquanto pareciam certos.
 *
 * Os pares abaixo são os que a interface realmente pinta. Um par novo no CSS entra aqui junto.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ESTILOS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles')
const TOKENS = join(ESTILOS, 'tokens.css')

/** WCAG 2.2: texto normal 4,5:1; texto grande e limite de componente 3:1. */
const TEXTO_NORMAL = 4.5
const TEXTO_GRANDE = 3

type Rgb = readonly [number, number, number]

const doHex = (hex: string): Rgb => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Luminância relativa da WCAG: canal linearizado, depois a soma ponderada. */
function luminancia(cor: Rgb): number {
  const canal = (c: number): number => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const [r, g, b] = cor
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b)
}

function razao(a: Rgb, b: Rgb): number {
  const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number]
  return (claro + 0.05) / (escuro + 0.05)
}

async function paleta(): Promise<ReadonlyMap<string, Rgb>> {
  const texto = await readFile(TOKENS, 'utf8')
  const pares = [...texto.matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gim)]
  return new Map(pares.map((m) => [m[1]!, doHex(m[2]!)]))
}

/** frente sobre fundo, e o mínimo que o papel daquele texto exige. */
const PARES: readonly { readonly frente: string; readonly fundo: string; readonly minimo: number; readonly onde: string }[] = [
  { frente: 'texto', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'corpo sobre o painel' },
  { frente: 'texto', fundo: 'painel-alto', minimo: TEXTO_NORMAL, onde: 'corpo sobre o botão' },
  /*
   * As PONTAS DOS GRADIENTES. Desde que as superfícies deixaram de ser chapadas, o texto não cai
   * mais sobre `--painel`: ele cai sobre a faixa entre `--painel-topo` e `--painel-pe`. Medir só
   * o tom médio passaria a ser uma medição de uma cor que a tela não pinta em lugar nenhum —
   * exatamente o tipo de teste que vira enfeite. O topo é sempre o mais claro, e por isso o mais
   * apertado para tinta clara: é ele que define o mínimo.
   */
  { frente: 'texto', fundo: 'painel-topo', minimo: TEXTO_NORMAL, onde: 'corpo no alto do painel' },
  { frente: 'texto-fraco', fundo: 'painel-topo', minimo: TEXTO_NORMAL, onde: 'rótulo discreto no alto do painel' },
  { frente: 'texto', fundo: 'painel-alto-topo', minimo: TEXTO_NORMAL, onde: 'rótulo do botão, no alto dele' },
  { frente: 'texto-fraco', fundo: 'painel-alto-topo', minimo: TEXTO_NORMAL, onde: 'rótulo discreto no alto do botão' },
  { frente: 'texto', fundo: 'cava-pe', minimo: TEXTO_NORMAL, onde: 'corpo no pé da fenda' },
  { frente: 'texto-fraco', fundo: 'cava-pe', minimo: TEXTO_NORMAL, onde: 'rótulo discreto no pé da fenda' },
  { frente: 'ouro', fundo: 'painel-topo', minimo: TEXTO_NORMAL, onde: 'moeda no alto do painel' },
  { frente: 'perigo', fundo: 'painel-topo', minimo: TEXTO_NORMAL, onde: 'erro no alto do painel' },
  { frente: 'borda-forte', fundo: 'painel-topo', minimo: TEXTO_GRANDE, onde: 'fio de controle no alto do painel' },
  { frente: 'texto', fundo: 'cava', minimo: TEXTO_NORMAL, onde: 'corpo sobre a fenda' },
  { frente: 'texto', fundo: 'fundo', minimo: TEXTO_NORMAL, onde: 'corpo sobre o fundo da página' },
  { frente: 'texto-fraco', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'rótulo discreto no painel' },
  { frente: 'texto-fraco', fundo: 'painel-alto', minimo: TEXTO_NORMAL, onde: 'rótulo discreto no botão' },
  { frente: 'texto-fraco', fundo: 'cava', minimo: TEXTO_NORMAL, onde: 'rótulo discreto na fenda' },
  { frente: 'ouro', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'valor em moeda' },
  { frente: 'ouro', fundo: 'painel-alto', minimo: TEXTO_NORMAL, onde: 'moeda no cabeçalho' },
  { frente: 'perigo', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'mensagem de erro' },
  { frente: 'perigo', fundo: 'painel-alto', minimo: TEXTO_NORMAL, onde: 'erro em botão' },
  { frente: 'ok', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'confirmação' },
  { frente: 'xp', fundo: 'painel', minimo: TEXTO_NORMAL, onde: 'rótulo de experiência' },
  // A marca e a seleção são preenchimentos, e quem escreve em cima delas usa o par declarado.
  { frente: 'primaria-texto', fundo: 'primaria', minimo: TEXTO_NORMAL, onde: 'texto da ação primária' },
  { frente: 'selecao-texto', fundo: 'selecao', minimo: TEXTO_NORMAL, onde: 'texto da linha selecionada' },
  // Limites de componente e preenchimento de medidor: 3:1 basta, não são texto.
  { frente: 'borda-forte', fundo: 'painel', minimo: TEXTO_GRANDE, onde: 'fio que identifica um controle' },
  { frente: 'borda-forte', fundo: 'fundo', minimo: TEXTO_GRANDE, onde: 'fio de controle sobre o fundo' },
  { frente: 'primaria', fundo: 'painel', minimo: TEXTO_GRANDE, onde: 'a ação primária contra a superfície' },
  { frente: 'selecao', fundo: 'painel', minimo: TEXTO_GRANDE, onde: 'a seleção contra a superfície' },
  { frente: 'hp', fundo: 'cava', minimo: TEXTO_GRANDE, onde: 'barra de vida no trilho' },
  { frente: 'xp-cheio', fundo: 'cava', minimo: TEXTO_GRANDE, onde: 'barra de experiência no trilho' },
  { frente: 'ouro-cheio', fundo: 'cava', minimo: TEXTO_GRANDE, onde: 'preenchimento de moeda' },
]

describe('a paleta passa no contraste que a WCAG exige', () => {
  it('todo par que a interface pinta atinge o mínimo do seu papel', async () => {
    const cores = await paleta()
    const reprovados = PARES.flatMap(({ frente, fundo, minimo, onde }) => {
      const a = cores.get(frente)
      const b = cores.get(fundo)
      if (a === undefined || b === undefined) {
        return [`${onde}: token --${a === undefined ? frente : fundo} não existe em tokens.css`]
      }
      const medido = razao(a, b)
      return medido >= minimo
        ? []
        : [`${onde}: --${frente} sobre --${fundo} mede ${medido.toFixed(2)}:1, precisa de ${minimo}:1`]
    })
    expect(reprovados).toEqual([])
  })

  it('o rótulo de cada um dos dezoito tipos se lê sobre o seu matiz', async () => {
    // O selo de tipo é o elemento mais repetido da interface e o mais fácil de errar: são
    // dezoito cores, treze delas claras demais para texto branco. A primeira tentativa listou
    // como "claros" um conjunto quase invertido, e nada na tela denunciava — o selo continuava
    // bonito e o rótulo dentro dele, ilegível.
    const cores = await paleta()
    const folha = await readFile(join(ESTILOS, 'layout.css'), 'utf8')
    // Quem leva tinta clara está declarado numa regra só; o resto herda a escura.
    const regra = /\.type-[^{]*\{\s*color: var\(--tipo-claro\)/.exec(folha)?.[0] ?? ''
    const comBranco = new Set([...regra.matchAll(/\.type-([a-z]+)/g)].map((m) => m[1]!))

    const reprovados = [...cores.keys()]
      .filter((n) => n.startsWith('type-'))
      .flatMap((token) => {
        const tipo = token.slice('type-'.length)
        const matiz = cores.get(token)!
        const tinta = cores.get(comBranco.has(tipo) ? 'tipo-claro' : 'tipo-escuro')!
        const medido = razao(tinta, matiz)
        return medido >= TEXTO_NORMAL
          ? []
          : [`${tipo}: o rótulo mede ${medido.toFixed(2)}:1 sobre o matiz, precisa de ${TEXTO_NORMAL}:1`]
      })
    expect(reprovados).toEqual([])
  })

  it('a régua confere com os valores conhecidos da WCAG', async () => {
    // Sem esta âncora, um erro no cálculo faria todos os pares "passarem" e o teste viraria
    // enfeite. Preto sobre branco é 21:1 e branco sobre branco é 1:1, por definição.
    expect(razao([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
    expect(razao([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5)
    // #767676 sobre branco é o exemplo canônico de 4,54:1 — o limiar exato de texto normal.
    expect(razao([118, 118, 118], [255, 255, 255])).toBeGreaterThanOrEqual(4.5)
    expect(razao([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5)
  })
})
