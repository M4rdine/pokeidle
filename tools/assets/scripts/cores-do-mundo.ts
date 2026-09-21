/**
 * Mede no atlas a cor canônica de cada material do mundo e imprime a paleta.
 *
 * Existe porque a paleta da interface não é inventada: o papel da caderneta é a areia dos tiles,
 * o couro é a terra batida da trilha, a barra de vida é o campo. Quando o tileset mudar, esta é
 * a fonte dos valores novos de `packages/client/src/styles/tokens.css` — sem ela, a próxima
 * geração de terreno faz a interface e o mapa deixarem de ser o mesmo mundo, em silêncio.
 *
 * Uso: `pnpm cores` na raiz.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const ATLAS = join(RAIZ, 'assets', 'atlas')
/** Margem descartada em cada lado do tile: a beirada carrega a borda do vizinho. */
const MARGEM = 8

interface Quadro { readonly frame: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } }

/** Onde cada material do mundo aparece puro, e para que ele serve na interface. */
const MATERIAIS: readonly { readonly material: string; readonly tile: string; readonly papel: string }[] = [
  { material: 'areia', tile: 'campo-areia-bbbb', papel: '--papel: a folha da caderneta' },
  { material: 'caminho', tile: 'campo-caminho-bbbb', papel: '--couro: a moldura' },
  { material: 'caverna', tile: 'pedra-caverna-bbbb', papel: '--couro-sombra e --mesa' },
  { material: 'campo', tile: 'campo-caminho-aaaa', papel: '--hp' },
  { material: 'agua', tile: 'campo-agua-bbbb', papel: '--xp (escurecida para ler sobre papel)' },
  { material: 'pedra', tile: 'pedra-caverna-aaaa', papel: '—' },
  { material: 'grama-alta', tile: 'campo-alta-bbbb', papel: '—' },
]

/** Média do miolo do tile, ignorando a margem onde mora a borda do material vizinho. */
function media(img: RgbaImage, quadro: Quadro): readonly [number, number, number] {
  const { x, y, w, h } = quadro.frame
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let py = y + MARGEM; py < y + h - MARGEM; py++) {
    for (let px = x + MARGEM; px < x + w - MARGEM; px++) {
      const o = (py * img.width + px) * 4
      r += img.data[o]!
      g += img.data[o + 1]!
      b += img.data[o + 2]!
      n += 1
    }
  }
  if (n === 0) throw new Error('tile menor que as duas margens; nada a medir')
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

const hex = ([r, g, b]: readonly [number, number, number]): string =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`

async function main(): Promise<void> {
  const img = decodePng(await readFile(join(ATLAS, 'tiles.png')))
  const { frames } = JSON.parse(await readFile(join(ATLAS, 'tiles.json'), 'utf8')) as { frames: Record<string, Quadro> }

  const linhas = MATERIAIS.map(({ material, tile, papel }) => {
    const quadro = frames[tile]
    if (quadro === undefined) return `${material.padEnd(11)} —        tile "${tile}" não está no atlas`
    return `${material.padEnd(11)} ${hex(media(img, quadro))}  ${papel}`
  })
  process.stdout.write(`${linhas.join('\n')}\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
