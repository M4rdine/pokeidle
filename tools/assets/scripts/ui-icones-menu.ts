/**
 * Os seis ícones do menu de funções, desenhados pixel a pixel.
 *
 * POR QUE À MÃO, e não gerados: foram tentados três estilos do Retro Diffusion — `tile_object`,
 * `mc_item` e `1_bit` — e os três falharam pelo mesmo motivo, que não é o prompt. Um gerador
 * produz ILUSTRAÇÃO; um ícone é SÍMBOLO. O `tile_object` encheu o quadro de textura de pergaminho;
 * o `mc_item` devolveu papel amassado bonito e ilegível; o `1_bit` desenhou um livro limpo a
 * 64 px cujo contorno some inteiro quando reduzido a 16. Símbolo de 16 px precisa de cada pixel
 * decidido, e essa decisão não é delegável.
 *
 * Desenhar aqui custa zero, fica determinístico, e o conjunto sai coerente de verdade — os seis
 * compartilham peso de traço e caixa, o que nenhum sorteio garante.
 *
 * COMO LER O DESENHO: cada ícone é uma grade de 16×16 em texto.
 *   `.` transparente   `#` tinta (claro)   `+` madeira (meio-tom, para o miolo)
 *
 * Uso: `pnpm icones-menu` na raiz. As PNGs geradas são versionadas.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const SAIDA = join(RAIZ, 'packages', 'client', 'src', 'styles', 'ui')
const LADO = 16

/** As duas tintas do conjunto, iguais às da repintura dos ícones de controle. */
const TINTA = [0xf2, 0xe7, 0xd6, 0xff] as const
const MEIO = [0xa9, 0x7c, 0x5c, 0xff] as const
const VAZIO = [0, 0, 0, 0] as const

/** Alfinete de lugar: o símbolo de mapa que se lê a 16 px. Um mapa dobrado não se lê. */
const MAPA = [
  '................',
  '.....######.....',
  '...##########...',
  '..####++++####..',
  '.###++++++++###.',
  '.##+++####+++##.',
  '.##+++####+++##.',
  '.##+++####+++##.',
  '.###++++++++###.',
  '..####++++####..',
  '...##########...',
  '....########....',
  '.....######.....',
  '......####......',
  '.......##.......',
  '................',
]

/**
 * Bola de captura: no gênero ela é o símbolo do time antes de ser o de qualquer outra coisa.
 * Metade de cima em tinta, metade de baixo em meio-tom e o botão claro no meio — com três
 * valores só dá para ter dois, e é o contraste entre as metades que diz "bola".
 */
const TIME = [
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '.##############.',
  '.##############.',
  '.##############.',
  '.+++++####+++++.',
  '.+++++####+++++.',
  '.++++++++++++++.',
  '.++++++++++++++.',
  '..++++++++++++..',
  '...++++++++++...',
  '.....++++++.....',
  '................',
  '................',
]

const MOCHILA = [
  '................',
  '......####......',
  '.....##++##.....',
  '....##++++##....',
  '...##++++++##...',
  '..############..',
  '.##++++++++++##.',
  '.##++++++++++##.',
  '.##++######++##.',
  '.##++#++++#++##.',
  '.##++######++##.',
  '.##++++++++++##.',
  '.##++++++++++##.',
  '..############..',
  '................',
  '................',
]

/**
 * Livro aberto. A primeira versão desenhava as duas metades sem lombada e a 16 px elas se liam
 * como duas barras soltas; a coluna clara no meio é o que faz virar livro.
 */
const POKEDEX = [
  '................',
  '................',
  '..####....####..',
  '.######..######.',
  '.##++##..##++##.',
  '.##++######++##.',
  '.##++++##++++##.',
  '.##++++##++++##.',
  '.##++++##++++##.',
  '.##++++##++++##.',
  '.##++++##++++##.',
  '.###+++##+++###.',
  '..############..',
  '................',
  '................',
  '................',
]

/**
 * Moeda, com uma marca clara no meio. Duas versões antes desta falharam: uma moeda com marca em
 * cruz lia-se ROLA, e uma pilha de três moedas achatadas lia-se PRATELEIRA. O que faz virar
 * dinheiro é a borda redonda grossa com uma marca vertical só.
 */
const LOJA = [
  '................',
  '.....######.....',
  '...##########...',
  '..############..',
  '.####++++++####.',
  '.###++++++++###.',
  '.###+++##+++###.',
  '.###+++##+++###.',
  '.###+++##+++###.',
  '.###++++++++###.',
  '.####++++++####.',
  '..############..',
  '...##########...',
  '.....######.....',
  '................',
  '................',
]

/**
 * Engrenagem: corpo redondo com furo no meio e quatro dentes. Com seis ou oito dentes, a 16 px
 * eles se encostam e o contorno vira um círculo serrilhado. A versão anterior alargava o corpo
 * até a borda do quadro e a silhueta virava um retângulo com caroços — lia-se olho, não
 * engrenagem. O corpo precisa ser mais estreito que os dentes para a silhueta ter mordida.
 */
const CONFIGURACOES = [
  '................',
  '......####......',
  '......####......',
  '...##########...',
  '...##########...',
  '...###++++###...',
  '.#####++++#####.',
  '.#####++++#####.',
  '.#####++++#####.',
  '.#####++++#####.',
  '...###++++###...',
  '...##########...',
  '...##########...',
  '......####......',
  '......####......',
  '................',
]

const ICONES: readonly { readonly nome: string; readonly grade: readonly string[] }[] = [
  { nome: 'mapa', grade: MAPA },
  { nome: 'time', grade: TIME },
  { nome: 'mochila', grade: MOCHILA },
  { nome: 'pokedex', grade: POKEDEX },
  { nome: 'loja', grade: LOJA },
  { nome: 'configuracoes', grade: CONFIGURACOES },
]

/**
 * Converte a grade de texto em imagem. Valida o formato em vez de confiar: uma linha a mais ou um
 * caractere fora do alfabeto viraria um ícone torto que só se descobre olhando a tela.
 */
function desenhar(nome: string, grade: readonly string[]): RgbaImage {
  if (grade.length !== LADO) throw new Error(`ícone ${nome}: ${grade.length} linhas, esperava ${LADO}`)
  const data = new Uint8Array(LADO * LADO * 4)
  grade.forEach((linha, y) => {
    if (linha.length !== LADO) throw new Error(`ícone ${nome}, linha ${y}: ${linha.length} colunas, esperava ${LADO}`)
    for (let x = 0; x < LADO; x++) {
      const c = linha[x]!
      const cor = c === '#' ? TINTA : c === '+' ? MEIO : c === '.' ? VAZIO : null
      if (cor === null) throw new Error(`ícone ${nome}, linha ${y}, coluna ${x}: caractere "${c}" não é . # ou +`)
      data.set(cor, (y * LADO + x) * 4)
    }
  })
  return { width: LADO, height: LADO, data }
}

async function main(): Promise<void> {
  await mkdir(SAIDA, { recursive: true })
  for (const { nome, grade } of ICONES) {
    const alvo = join(SAIDA, `icone-${nome}.png`)
    await writeFile(alvo, encodePng(desenhar(nome, grade)))
    process.stdout.write(`${nome.padEnd(16)} ${alvo}\n`)
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
