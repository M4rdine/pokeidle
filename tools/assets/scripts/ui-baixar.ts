/**
 * Traz o acervo de sprites oficiais de item da PokeAPI para `tools/assets/ui/pokeapi/`.
 *
 * Este passo era PROMETIDO E NÃO EXISTIA: `ui-icones.ts` mandava rodar `pnpm icones-baixar`
 * quando faltava um sprite, e esse script nunca foi escrito — quem clonasse o repositório e
 * apagasse um PNG recebia uma instrução para um comando inexistente. As PNGs continuam
 * versionadas (o build normal não depende de rede); isto aqui é como elas se reproduzem.
 *
 * A licença está em `tools/assets/ui/pokeapi/LICENSE.md` e vale para tudo que este script baixa:
 * o repositório é CC0, a arte é copyright da The Pokémon Company, e os dois enunciados convivem
 * porque a renúncia é de quem montou a coleção, não da detentora da obra.
 *
 * Uso: `pnpm icones-baixar` na raiz. Depois, `pnpm icones` para gerar os ícones do cliente.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const DESTINO = join(RAIZ, 'tools', 'assets', 'ui', 'pokeapi')
const BASE = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites'

/**
 * Tudo que o acervo precisa ter, nos NOMES DA POKEAPI.
 *
 * Os seis primeiros são os itens do jogo, e o nome deles bate 1:1 com o `itemId` do nosso
 * registro — não é coincidência: o registro nasceu do mesmo acervo, via `tools/pokedata`. Os
 * outros respondem por funções da interface, e a escolha de cada um está documentada em
 * `ui-icones.ts`.
 */
const SPRITES: readonly string[] = [
  // Consumíveis e bolas do registro
  'potion', 'super-potion', 'hyper-potion',
  'poke-ball', 'great-ball', 'ultra-ball',
  'revive', 'max-revive',
  // Bolas situacionais: o bônus delas depende do estado da caçada, não de um número fixo
  'quick-ball', 'net-ball', 'nest-ball', 'repeat-ball', 'master-ball',
  // Pedras: o segundo caminho de evolução, para as linhas que não evoluem por nível
  'fire-stone', 'thunder-stone', 'moon-stone',
  // Ícones de função da interface
  'town-map', 'berry-pouch', 'medal-box', 'coin-case', 'machine-part',
]

/**
 * As insígnias, por número. São dezesseis porque o jogo tem dezesseis áreas — oito por região —,
 * e a numeração do acervo segue a ordem dos ginásios: 1 a 8 é Kanto, 9 a 16 é Johto.
 */
const INSIGNIAS: readonly number[] = Array.from({ length: 16 }, (_unused, i) => i + 1)

async function baixar(nome: string, pasta = 'items'): Promise<number> {
  const res = await fetch(`${BASE}/${pasta}/${nome}.png`)
  if (!res.ok) throw new Error(`${nome}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  // Um PNG começa com a assinatura de oito bytes. Sem esta checagem, uma página de erro do
  // GitHub entraria no acervo como se fosse imagem e só quebraria na hora de decodificar.
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!assinatura.every((b, i) => bytes[i] === b)) throw new Error(`${nome}: a resposta não é um PNG`)
  await writeFile(join(DESTINO, `${pasta === 'items' ? '' : `${pasta}-`}${nome}.png`), bytes)
  return bytes.length
}

async function main(): Promise<void> {
  await mkdir(DESTINO, { recursive: true })
  for (const nome of SPRITES) {
    const bytes = await baixar(nome)
    process.stdout.write(`${nome.padEnd(16)} ${String(bytes).padStart(6)} bytes\n`)
  }
  for (const n of INSIGNIAS) {
    const bytes = await baixar(String(n), 'badges')
    process.stdout.write(`${`insígnia ${n}`.padEnd(16)} ${String(bytes).padStart(6)} bytes\n`)
  }
  const total = SPRITES.length + INSIGNIAS.length
  process.stdout.write(`\n${total} sprites em ${DESTINO}\nAgora rode "pnpm icones".\n`)
}

main().catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
