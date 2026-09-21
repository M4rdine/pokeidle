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

const TOKENS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles', 'tokens.css')

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
  { frente: 'tinta', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'corpo sobre a folha' },
  { frente: 'tinta', fundo: 'papel-alto', minimo: TEXTO_NORMAL, onde: 'corpo sobre superfície levantada' },
  { frente: 'tinta', fundo: 'papel-cava', minimo: TEXTO_NORMAL, onde: 'corpo sobre superfície afundada' },
  { frente: 'tinta', fundo: 'marca', minimo: TEXTO_NORMAL, onde: 'linha grifada' },
  { frente: 'tinta-fraca', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'rótulo discreto sobre a folha' },
  { frente: 'tinta-fraca', fundo: 'papel-alto', minimo: TEXTO_NORMAL, onde: 'rótulo discreto levantado' },
  { frente: 'tinta-fraca', fundo: 'papel-cava', minimo: TEXTO_NORMAL, onde: 'rótulo discreto afundado' },
  { frente: 'ouro', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'valor em moeda' },
  { frente: 'ouro', fundo: 'papel-alto', minimo: TEXTO_NORMAL, onde: 'valor em moeda no cabeçalho' },
  { frente: 'perigo', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'mensagem de erro' },
  { frente: 'perigo', fundo: 'papel-alto', minimo: TEXTO_NORMAL, onde: 'erro em superfície levantada' },
  { frente: 'ok', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'confirmação' },
  { frente: 'ok', fundo: 'papel-alto', minimo: TEXTO_NORMAL, onde: 'confirmação levantada' },
  { frente: 'xp', fundo: 'papel', minimo: TEXTO_NORMAL, onde: 'rótulo de experiência' },
  // Ação primária e seleção: o couro invertido, com o papel por cima.
  { frente: 'papel-alto', fundo: 'couro-sombra', minimo: TEXTO_NORMAL, onde: 'texto do botão primário' },
  { frente: 'papel-alto', fundo: 'mesa', minimo: TEXTO_NORMAL, onde: 'texto sobre a mesa' },
  // Limites de componente e preenchimento de medidor: 3:1 basta, não são texto.
  { frente: 'couro', fundo: 'papel', minimo: TEXTO_GRANDE, onde: 'traço da moldura sobre a folha' },
  { frente: 'couro-sombra', fundo: 'papel', minimo: TEXTO_GRANDE, onde: 'anel de foco sobre a folha' },
  { frente: 'couro-sombra', fundo: 'papel-alto', minimo: TEXTO_GRANDE, onde: 'anel de foco sobre o levantado' },
  // O trilho do medidor é uma fenda cortada no papel: o que aparece no fundo dela é a mesa. Daí
  // o preenchimento ser medido contra `--mesa`, e não contra uma superfície de papel.
  { frente: 'hp', fundo: 'mesa', minimo: TEXTO_GRANDE, onde: 'barra de vida na fenda' },
  { frente: 'xp-cheio', fundo: 'mesa', minimo: TEXTO_GRANDE, onde: 'barra de experiência na fenda' },
  { frente: 'ouro-cheio', fundo: 'mesa', minimo: TEXTO_GRANDE, onde: 'preenchimento de moeda' },
  { frente: 'marca-borda', fundo: 'papel', minimo: TEXTO_GRANDE, onde: 'borda do grifo' },
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
