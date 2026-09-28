/**
 * Recorta um pedaço do mapa OpenTibia e o transforma numa área de caçada nossa.
 *
 * É a inversão que este projeto precisava. Os dezesseis mapas foram DESENHADOS POR SCRIPT sobre uma
 * paleta de 46 peças, e pareciam isso: mancha chapada com aresta reta. Curar mais tiles não
 * conserta — paleta não desenha mapa. Aqui a geografia vem pronta, feita à mão por quem senta no
 * editor, e o manifest cresce atrás dela: o recorte é que decide a paleta, não o contrário.
 *
 * O QUE VEM DE FORA E O QUE CONTINUA NOSSO. Vem o chão, o que está empilhado e a colisão. Continuam
 * nossos os SPAWNS — espécies, níveis e ritmo —, o ponto de entrada e o Centro Pokémon: é o jogo
 * que define o que se caça ali, não o mapa.
 *
 *   pnpm assets importar-area <id-da-area> --x 248 --y 251 --z 7
 */
import { readFile, writeFile } from 'node:fs/promises'
import { lerMapa, type TileDoMapa } from '../src/otbm.js'
import { lerItensOtb } from '../src/otb-itens.js'
import { loadCatalog } from '../src/extract.js'
import { ehSujeira } from '../src/sujeira.js'

const MAPA = 'assets/otbm/map.otbm'
const ITENS = 'assets/otbm/items.otb'
const EXTRAIDO = 'assets/extracted-otp2019'
const MANIFEST = 'tools/assets/manifest.json'
const HUNTS = 'packages/shared/data/hunts'

/**
 * O nome do tile no nosso atlas. Vem do id de CLIENTE, que é o que aponta para um sprite, e do
 * PADRÃO, que é a variação.
 *
 * POR QUE O PADRÃO ENTRA NO NOME. Um item do Tibia não tem um desenho: tem uma grade deles, e o
 * cliente escolhe a célula pela POSIÇÃO do tile no mundo — `x % padrãoX`, `y % padrãoY`. O chão
 * desta caverna é 4×4, ou seja dezesseis desenhos, e a grama é 2×2. Importando só a variação zero,
 * um mapa inteiro sai carimbado com o mesmo quadradinho: é exatamente a chapação que fazia os
 * nossos mapas parecerem gerados por script, e ela não vinha do mapa — vinha daqui.
 *
 * A variação zero mantém o nome curto para não renomear o que já existe no manifest.
 */
const nomeDoTile = (clientId: number, padX: number, padY: number): string =>
  padX === 0 && padY === 0 ? `otbm-${clientId}` : `otbm-${clientId}-p${padX}${padY}`

interface Argumentos { readonly area: string; readonly x: number; readonly y: number; readonly z: number }

function argumentos(): Argumentos {
  const [area] = process.argv.slice(2)
  const valor = (nome: string): number => {
    const i = process.argv.indexOf(`--${nome}`)
    if (i < 0) throw new Error(`falta --${nome}`)
    return Number(process.argv[i + 1])
  }
  if (!area || area.startsWith('--')) throw new Error('uso: importar-area <id-da-area> --x N --y N --z N')
  return { area, x: valor('x'), y: valor('y'), z: valor('z') }
}

async function main(): Promise<void> {
  const { area, x: x0, y: y0, z } = argumentos()
  const alvo = `${HUNTS}/${area}.json`
  const nosso = JSON.parse(await readFile(alvo, 'utf8')) as {
    width: number; height: number
    layers: { ground: (string | null)[]; detail: (string | null)[]; blocking: boolean[]; canopy?: (string | null)[] }
    spawnPoint: { x: number; y: number }
    pokecenter: { x: number; y: number }
  }
  const { width: largura, height: altura } = nosso

  const mapa = lerMapa(await readFile(MAPA))
  const otb = lerItensOtb(await readFile(ITENS))
  const catalogo = await loadCatalog(EXTRAIDO)
  const porId = new Map(catalogo.items.map((i) => [i.id, i]))
  console.log(`${otb.descricao} · mapa ${mapa.largura}x${mapa.altura}`)

  const grade = new Map<string, TileDoMapa>()
  for (const t of mapa.tiles) if (t.z === z) grade.set(`${t.x},${t.y}`, t)

  const ground: (string | null)[] = []
  const detail: (string | null)[] = []
  const canopy: (string | null)[] = []
  const blocking: boolean[] = []
  const usados = new Map<string, { cid: number; padX: number; padY: number }>()
  let semTraducao = 0
  let sujeira = 0

  /** O id de cliente, ou `null` quando este servidor conhece um item que o nosso dump não tem. */
  const cliente = (idDeServidor: number): number | null => {
    const cid = otb.paraCliente.get(idDeServidor)
    if (cid === undefined || !porId.has(cid)) { semTraducao++; return null }
    return cid
  }

  const celulas = largura * altura
  ground.length = detail.length = canopy.length = blocking.length = celulas
  ground.fill(null); detail.fill(null); canopy.fill(null); blocking.fill(false)
  const indice = (dx: number, dy: number): number | null =>
    dx < 0 || dy < 0 || dx >= largura || dy >= altura ? null : dy * largura + dx

  /**
   * Põe um item numa camada, na célula (dx,dy).
   *
   * O ITEM GRANDE ANCORA NO CANTO INFERIOR-DIREITO e o desenho se estende para cima e para a
   * esquerda — é assim que o cliente o põe na tela. Na nossa grade cada célula guarda UM nome,
   * então ele entra como as peças do corte, uma por célula coberta.
   *
   * Vale para o CHÃO também, e não só para o que está empilhado: existe chão de 2×2 no mapa, e
   * tratá-lo como peça única fazia a área citar um nome que o atlas não tem — o build acusou
   * `otbm-1128` e foi assim que eu descobri.
   */
  const colocar = (camada: (string | null)[], dx: number, dy: number, cid: number): void => {
    const item = porId.get(cid)!
    // A variação sai da posição no MUNDO, não no recorte: é o que mantém a costura com o entorno.
    const padX = (x0 + dx) % item.patternX
    const padY = (y0 + dy) % item.patternY
    const nome = nomeDoTile(cid, padX, padY)
    usados.set(nome, { cid, padX, padY })
    if (item.width === 1 && item.height === 1) {
      const i = indice(dx, dy)
      if (i !== null) camada[i] = nome
      return
    }
    for (let py = 0; py < item.height; py++) {
      for (let px = 0; px < item.width; px++) {
        const j = indice(dx - (item.width - 1 - px), dy - (item.height - 1 - py))
        if (j !== null) camada[j] = `${nome}-x${px}-y${py}`
      }
    }
  }

  for (let dy = 0; dy < altura; dy++) {
    for (let dx = 0; dx < largura; dx++) {
      const i = dy * largura + dx
      const tile = grade.get(`${x0 + dx},${y0 + dy}`)
      const chaoCid = tile?.chao != null ? cliente(tile.chao) : null
      /*
       * SEM CHÃO, O TILE BLOQUEIA. Um buraco no recorte é borda do mundo: deixá-lo andável faria o
       * Pokémon sair do mapa pelo vazio.
       */
      if (chaoCid === null) { blocking[i] = true; continue }
      colocar(ground, dx, dy, chaoCid)
      if (porId.get(chaoCid)?.isBlocking) blocking[i] = true

      for (const idServidor of tile!.pilha) {
        const cid = cliente(idServidor)
        if (cid === null) continue
        const item = porId.get(cid)!
        /*
         * A SUJEIRA DO DIA EM QUE O MAPA FOI GRAVADO não entra: cadáver, poça e campo mágico
         * decairiam no servidor de origem e aqui ficariam para sempre. Ver `sujeira.ts`.
         */
        if (ehSujeira(item)) { sujeira++; continue }
        if (item.isBlocking) blocking[i] = true
        /*
         * ITEM ALTO VAI PARA A COPA, desenhada DEPOIS dos personagens: é o que faz o Pokémon passar
         * POR TRÁS da copa da árvore em vez de por cima dela.
         */
        colocar(item.height > 1 ? canopy : detail, dx, dy, cid)
      }
    }
  }

  // O ponto de entrada e o Centro precisam ser ANDÁVEIS: no mapa novo, o antigo pode ter caído
  // dentro de uma parede.
  const andavel = (p: { x: number; y: number }): boolean => !blocking[p.y * largura + p.x]
  const primeiroAndavel = (de: { x: number; y: number }): { x: number; y: number } => {
    if (andavel(de)) return de
    for (let r = 1; r < Math.max(largura, altura); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const p = { x: de.x + dx, y: de.y + dy }
        if (p.x >= 0 && p.y >= 0 && p.x < largura && p.y < altura && andavel(p)) return p
      }
    }
    throw new Error('o recorte não tem um tile andável: escolha outro pedaço do mundo')
  }

  const saida = {
    ...nosso,
    // Tira a área do contrato com o Tiled: a partir daqui a geografia é do `.otbm`, não do `.tmj`.
    origem: 'otbm' as const,
    layers: { ground, detail, blocking, canopy },
    spawnPoint: primeiroAndavel(nosso.spawnPoint),
    pokecenter: primeiroAndavel(nosso.pokecenter),
  }
  await writeFile(alvo, `${JSON.stringify(saida, null, 2)}\n`)

  // O manifest cresce atrás do recorte: registra exatamente os ids que ele usa, e nada mais.
  const manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) as { tiles: { name: string }[] }
  const jaTem = new Set(manifest.tiles.map((t) => t.name))
  const novas = [...usados]
    .filter(([nome]) => !jaTem.has(nome))
    .map(([name, { cid, padX, padY }]) => {
      const item = porId.get(cid)!
      const grande = item.width !== 1 || item.height !== 1
      return {
        name, itemId: cid, patternX: padX, patternY: padY,
        ...(grande && { slice: { cols: item.width, rows: item.height } }),
      }
    })
  manifest.tiles = [...manifest.tiles, ...novas]
  await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`)

  const paredes = blocking.filter(Boolean).length
  console.log(`${area}: ${largura}x${altura} de (${x0},${y0},${z})`)
  console.log(`  ${usados.size} tiles distintos · ${novas.length} novos no manifest`)
  console.log(`  parede em ${paredes} de ${blocking.length} tiles (${(100 * paredes / blocking.length).toFixed(0)}%)`)
  console.log(`  entrada em (${saida.spawnPoint.x},${saida.spawnPoint.y}) · centro em (${saida.pokecenter.x},${saida.pokecenter.y})`)
  if (sujeira > 0) console.log(`  ${sujeira} cadáver/poça/campo mágico varridos do recorte`)
  /*
   * A DECORAÇÃO QUE SOBROU SAI IMPRESSA, e não é enfeite de log. As bandeiras do `.dat` pegam o
   * que decai; o que o autor do mapa pôs de propósito passa por elas — e foi assim que um corpo
   * humano ensanguentado sobreviveu à primeira varrida. Quem converte a próxima área olha esta
   * lista antes de aceitar.
   */
  const sobrou = [...new Set([...detail, ...canopy].filter((n): n is string => n !== null))].sort()
  console.log(`  decoração que ficou em pé (confira): ${sobrou.length === 0 ? 'nenhuma' : sobrou.join(', ')}`)
  if (semTraducao > 0) console.log(`  ${semTraducao} item(ns) sem sprite no nosso dump, descartados`)
}

await main()
