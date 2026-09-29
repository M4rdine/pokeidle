/**
 * A folha de contato dos EFEITOS e PROJÉTEIS, para a curadoria caber numa olhada.
 *
 * O `.dat` não guarda nome: são 658 efeitos e 89 projéteis identificados só por número. Escolher
 * qual é "fogo" e qual é "água" só se faz OLHANDO, e olhar 747 animações uma a uma não acontece.
 * Aqui elas saem numa grade, na ordem impressa, e a curadoria vira contar célula.
 *
 * O quadro mostrado é o DO MEIO. O começo de um efeito é quase sempre quase vazio — um lampejo, um
 * ponto — e uma folha feita com o primeiro quadro mostra uma página em branco.
 *
 *   pnpm assets folha-animacoes --tipo efeito --de 1 --ate 120 --out /tmp/folha.png
 *   pnpm assets folha-animacoes --tipo projetil --escala 6 --colunas 9
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { efeitoFramePath, loadCatalog, projetilFramePath } from '../src/extract.js'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'

const EXTRAIDO = 'assets/extracted-otp2019'
const BYTES = 4

const arg = (nome: string): string | null => {
  const i = process.argv.indexOf(`--${nome}`)
  return i < 0 ? null : (process.argv[i + 1] ?? null)
}
const num = (nome: string, padrao: number): number => Number(arg(nome) ?? padrao)

async function main(): Promise<void> {
  const tipo = arg('tipo') ?? 'efeito'
  if (tipo !== 'efeito' && tipo !== 'projetil') throw new Error('--tipo aceita "efeito" ou "projetil"')
  const escala = num('escala', 4)
  const colunas = num('colunas', 10)
  const saida = arg('out') ?? `assets/candidatos/folha-${tipo}.png`

  const catalogo = await loadCatalog(EXTRAIDO)
  const todos = tipo === 'efeito' ? catalogo.effects : catalogo.missiles
  const de = num('de', 1)
  const ate = num('ate', Number.MAX_SAFE_INTEGER)
  const lista = todos.filter((a) => a.id >= de && a.id <= ate)
  if (lista.length === 0) throw new Error(`nenhum ${tipo} entre ${de} e ${ate}`)

  /* Célula de dois tiles: cabe o efeito de 2×2 sem espremer, e o de 1×1 sobra centrado. */
  const CEL = 32 * 2 * escala
  const VAO = Math.max(4, escala)
  const linhas = Math.ceil(lista.length / colunas)
  const largura = colunas * (CEL + VAO) + VAO
  const altura = linhas * (CEL + VAO) + VAO
  const alvo: RgbaImage = { width: largura, height: altura, data: new Uint8Array(largura * altura * BYTES) }
  // Fundo escuro: quase todo efeito é claro e brilhante, e sobre branco some.
  for (let i = 0; i < alvo.data.length; i += BYTES) {
    alvo.data[i] = 24; alvo.data[i + 1] = 26; alvo.data[i + 2] = 34; alvo.data[i + 3] = 255
  }

  for (const [posicao, a] of lista.entries()) {
    const caminho = tipo === 'efeito'
      ? efeitoFramePath(EXTRAIDO, a.id, Math.floor(a.phases / 2))
      : projetilFramePath(EXTRAIDO, a.id, 0, 0)
    let img: RgbaImage
    try { img = decodePng(await readFile(caminho)) } catch { continue }
    const ox = VAO + (posicao % colunas) * (CEL + VAO)
    const oy = VAO + Math.floor(posicao / colunas) * (CEL + VAO)
    for (let y = 0; y < Math.min(CEL, img.height * escala); y++) {
      for (let x = 0; x < Math.min(CEL, img.width * escala); x++) {
        const de2 = (Math.floor(y / escala) * img.width + Math.floor(x / escala)) * BYTES
        if (img.data[de2 + 3] === 0) continue
        alvo.data.set(img.data.subarray(de2, de2 + BYTES), ((oy + y) * largura + ox + x) * BYTES)
      }
    }
  }

  await mkdir(dirname(saida), { recursive: true })
  await writeFile(saida, encodePng(alvo))
  console.log(`${saida} · ${lista.length} ${tipo}(s), ${colunas} por linha`)
  for (let l = 0; l < linhas; l++) {
    const ids = lista.slice(l * colunas, (l + 1) * colunas).map((a) => String(a.id).padStart(3))
    console.log(`  linha ${String(l).padStart(2)}: ${ids.join(' ')}`)
  }
}

await main()
