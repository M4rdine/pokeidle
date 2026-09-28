/**
 * Corrige os retângulos do atlas de Pokémon já publicado, medindo a folha.
 *
 * Roda sobre `pokemon.png` + `pokemon.json` e não precisa do dump: a arte já está certa na folha,
 * o que estava errado era o recorte anunciado sobre ela. Ver `apertar-quadros.ts` para o porquê.
 *
 *   pnpm apertar-atlas            confere e lista o que mudaria
 *   pnpm apertar-atlas --gravar   grava o pokemon.json corrigido
 */
import { readFile, writeFile } from 'node:fs/promises'
import { decodePng } from '../src/png.js'
import { aoQuadrado, grupoDoQuadro, limitesDoConteudo, unir, type Caixa } from '../src/apertar-quadros.js'

const PASTA = 'packages/server/public/atlas'

interface QuadroDoAtlas { frame: Caixa; spriteSourceSize: Caixa; sourceSize: { w: number; h: number } }
interface Folha {
  frames: Record<string, QuadroDoAtlas>
  meta: { image: string; cell: { w: number; h: number }; padding: number }
}

async function main(): Promise<void> {
  const gravar = process.argv.includes('--gravar')
  const folha = JSON.parse(await readFile(`${PASTA}/pokemon.json`, 'utf8')) as Folha
  const imagem = decodePng(await readFile(`${PASTA}/${folha.meta.image}`))
  const { cell } = folha.meta

  /*
   * A caixa do conteúdo de cada GRUPO: a união das fases, para o passo da caminhada não saltar.
   *
   * EM COORDENADAS DA CÉLULA, não da folha. As fases de um mesmo grupo ficam em células
   * diferentes da grade, então unir as caixas em coordenadas da folha produz um retângulo
   * atravessando três células — foi exatamente o que aconteceu na primeira versão, e todo quadro
   * de 32 "cresceu" para 64.
   */
  const porGrupo = new Map<string, Caixa>()
  for (const [nome, q] of Object.entries(folha.frames)) {
    // A célula é o lugar reservado ao quadro na grade, e é ela que limita o crescimento: o
    // retângulo anunciado pode ser menor que a célula, nunca o contrário.
    const celula: Caixa = { x: q.frame.x, y: q.frame.y, w: cell.w, h: cell.h }
    const conteudo = limitesDoConteudo(imagem.data, imagem.width, celula)
    if (!conteudo) continue
    const local: Caixa = { x: conteudo.x - celula.x, y: conteudo.y - celula.y, w: conteudo.w, h: conteudo.h }
    const grupo = grupoDoQuadro(nome)
    const anterior = porGrupo.get(grupo)
    porGrupo.set(grupo, anterior ? unir(anterior, local) : local)
  }

  /*
   * SÓ OS QUADROS NÃO QUADRADOS.
   *
   * A grade é de células quadradas e toda espécie sã tem quadro quadrado — 32 ou 64. Um quadro
   * retangular é, por construção, um PNG de origem com margem morta que ninguém conferiu: é o
   * defeito, e é o recorte dele que precisa ser refeito.
   *
   * Apertar TODOS contra o conteúdo seria outra coisa: mudaria 605 dos 640, encolhendo cada
   * espécie para a própria silhueta e reancorando o jogo inteiro. Isso não é consertar o defeito,
   * é recortar o atlas de novo — e não é o que este roteiro se propõe a fazer.
   */
  let mudados = 0
  const relatorio: string[] = []
  for (const [nome, q] of Object.entries(folha.frames)) {
    if (q.frame.w === q.frame.h) continue
    const local = porGrupo.get(grupoDoQuadro(nome))
    if (!local) continue
    const celula: Caixa = { x: q.frame.x, y: q.frame.y, w: cell.w, h: cell.h }
    // De volta para a folha, na célula DESTE quadro.
    const conteudo: Caixa = { x: celula.x + local.x, y: celula.y + local.y, w: local.w, h: local.h }
    const novo = aoQuadrado(conteudo, celula)
    if (novo.x === q.frame.x && novo.y === q.frame.y && novo.w === q.frame.w && novo.h === q.frame.h) continue
    mudados++
    if (relatorio.length < 6) relatorio.push(`  ${nome}: ${q.frame.w}x${q.frame.h} em (${q.frame.x},${q.frame.y}) → ${novo.w}x${novo.h} em (${novo.x},${novo.y})`)
    q.frame = novo
    q.spriteSourceSize = { x: 0, y: 0, w: novo.w, h: novo.h }
    q.sourceSize = { w: novo.w, h: novo.h }
  }

  console.log(`${mudados} de ${Object.keys(folha.frames).length} quadros fora do conteúdo`)
  for (const linha of relatorio) console.log(linha)
  if (mudados > relatorio.length) console.log(`  … e mais ${mudados - relatorio.length}`)
  if (!gravar) { console.log('\nnada gravado; rode com --gravar'); return }
  await writeFile(`${PASTA}/pokemon.json`, `${JSON.stringify(folha, null, 2)}\n`)
  console.log(`\ngravado em ${PASTA}/pokemon.json`)
}

await main()
