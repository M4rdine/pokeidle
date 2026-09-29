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
import { mobiliar, OPCOES_PADRAO, type Prop } from '../src/mobiliar.js'

const MAPA = 'assets/otbm/map.otbm'
const ITENS = 'assets/otbm/items.otb'
const EXTRAIDO = 'assets/extracted-otp2019'
const MANIFEST = 'tools/assets/manifest.json'
const HUNTS = 'packages/shared/data/hunts'

/**
 * A paleta de cenário por tema.
 *
 * São peças que o próprio mapa usa, conferidas uma a uma ampliadas — e não ids adivinhados. Para
 * caverna, três pedregulhos soltos da mesma família de ids: o Tibia agrupa peças irmãs em ids
 * contíguos, e foi assim que eles apareceram. O grande é raro de propósito; o pequeno é o que
 * povoa. Ver `mobiliar.ts` para as regras de onde cada um cai.
 */
const PALETAS: Readonly<Record<string, readonly Prop[]>> = {
  caverna: [
    // Três pedregulhos soltos da mesma família de ids, do menor ao maior.
    { nome: 'otbm-2166', itemId: 2166, barra: true, peso: 3 },
    { nome: 'otbm-2167', itemId: 2167, barra: true, peso: 3 },
    { nome: 'otbm-2164', itemId: 2164, barra: true, peso: 2 },
    // Entulho, na cor do chão desta caverna — é o que quebra a monotonia do cinza.
    { nome: 'otbm-1803', itemId: 1803, barra: true, peso: 2 },
    // Osso: não barra nada, e é detalhe de chão em vez de obstáculo.
    { nome: 'otbm-3115', itemId: 3115, barra: false, peso: 2 },
  ],
}

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

interface Argumentos {
  readonly area: string; readonly x: number; readonly y: number; readonly z: number
  /** Tema do cenário posto por cima do recorte, ou `null` para deixar como veio. Ver `PALETAS`. */
  readonly cenario: string | null
}

function argumentos(): Argumentos {
  const [area] = process.argv.slice(2)
  const valor = (nome: string): number => {
    const i = process.argv.indexOf(`--${nome}`)
    if (i < 0) throw new Error(`falta --${nome}`)
    return Number(process.argv[i + 1])
  }
  if (!area || area.startsWith('--')) throw new Error('uso: importar-area <id-da-area> --x N --y N --z N [--cenario caverna]')
  const i = process.argv.indexOf('--cenario')
  const cenario = i < 0 ? null : process.argv[i + 1] ?? null
  if (cenario !== null && !(cenario in PALETAS)) throw new Error(`cenário "${cenario}" não existe; há: ${Object.keys(PALETAS).join(', ')}`)
  return { area, x: valor('x'), y: valor('y'), z: valor('z'), cenario }
}

async function main(): Promise<void> {
  const { area, x: x0, y: y0, z, cenario } = argumentos()
  const alvo = `${HUNTS}/${area}.json`
  const nosso = JSON.parse(await readFile(alvo, 'utf8')) as {
    width: number; height: number
    layers: { ground: (string | null)[]; detail: (string | null)[]; blocking: boolean[]; canopy?: (string | null)[] }
    spawnPoint: { x: number; y: number }
    pokecenter: { x: number; y: number }
    spawns: { x: number; y: number; radius: number }[]
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

  /*
   * A ENTRADA, O CENTRO E CADA NASCIMENTO precisam ser ANDÁVEIS: no mapa novo, o ponto antigo pode
   * ter caído dentro de uma parede.
   *
   * Os NASCIMENTOS eu esqueci na primeira versão, e o Pico Rochoso foi publicado com o rhydon
   * nascendo dentro da rocha. Não dava erro em lugar nenhum — o teste de caminhabilidade que
   * existia olha o mapa desenhado no Tiled, e esta área já não vem de lá. Por isso agora há um
   * guarda sobre as áreas PUBLICADAS, em packages/shared.
   */
  /**
   * A MAIOR ILHA ANDÁVEL, e tudo vai para dentro dela.
   *
   * Achar "o tile andável mais perto" não basta, e isso custou caro: no Bosque Denso a entrada
   * caiu numa faixa de grama separada do resto por água, e o Centro Pokémon mais três dos quatro
   * nascimentos foram parar do outro lado. O motor mandava o jogador atravessar o lago a pé, não
   * conseguia, e a área rendeu 42 mil XP/h contra os 198 mil de antes — um quinto. Não dava erro
   * em lugar nenhum: só um número feio na sonda de balanceamento e o guarda de caminhabilidade
   * acusando três pontos inalcançáveis.
   *
   * Recortar um pedaço de mundo quase sempre parte a área em ilhas — margem de lago, os dois lados
   * de um paredão. Escolher a maior e prender tudo nela é o que faz o recorte virar UM lugar.
   */
  const ilhas: number[][] = []
  const deQualIlha = new Int32Array(largura * altura).fill(-1)
  for (let i = 0; i < largura * altura; i++) {
    if (blocking[i] || deQualIlha[i] !== -1) continue
    const ilha: number[] = [i]
    deQualIlha[i] = ilhas.length
    for (let k = 0; k < ilha.length; k++) {
      const atual = ilha[k]!
      const ax = atual % largura
      const ay = (atual / largura) | 0
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = ax + dx
        const ny = ay + dy
        if (nx < 0 || ny < 0 || nx >= largura || ny >= altura) continue
        const j = ny * largura + nx
        if (blocking[j] || deQualIlha[j] !== -1) continue
        deQualIlha[j] = ilhas.length
        ilha.push(j)
      }
    }
    ilhas.push(ilha)
  }
  if (ilhas.length === 0) throw new Error('o recorte não tem um tile andável: escolha outro pedaço do mundo')
  const maior = ilhas.reduce((a, b) => (b.length > a.length ? b : a))
  const ilhaPrincipal = ilhas.indexOf(maior)

  /** O ponto mais próximo DENTRO da ilha principal. */
  const primeiroAndavel = (de: { x: number; y: number }): { x: number; y: number } => {
    const dentro = (p: { x: number; y: number }): boolean =>
      p.x >= 0 && p.y >= 0 && p.x < largura && p.y < altura && deQualIlha[p.y * largura + p.x] === ilhaPrincipal
    if (dentro(de)) return de
    for (let r = 1; r < Math.max(largura, altura); r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const p = { x: de.x + dx, y: de.y + dy }
        if (dentro(p)) return p
      }
    }
    throw new Error('o recorte não tem um tile andável: escolha outro pedaço do mundo')
  }

  /**
   * A ENTRADA NÃO PODE NASCER DENTRO DO NINHO.
   *
   * O ponto antigo vem de um mapa que não é este, então "o andável mais próximo dele" não quer
   * dizer nada — e na Caverna Funda deu no pior lugar possível: a entrada a um tile do ninho de
   * quatro selvagens. O jogador nascia cercado, levava treze golpes em vinte e oito tiques e a
   * caçada acabava em seis segundos. Medido contra o mapa desenhado, com o MESMO Pokémon e a MESMA
   * IA: 172 derrotas e nenhuma queda lá, contra 1 derrota e time caído aqui. Não era a IA nem o
   * nível — era onde ele nascia.
   *
   * Entrada e Centro passam a ser escolhidos, não herdados: o ponto da ilha principal mais longe
   * de qualquer ninho, e o Centro o mais longe da entrada entre os igualmente seguros — para a ida
   * ao Centro continuar sendo uma viagem, que é o custo que o desenho cobra por machucar.
   */
  const ninhos = nosso.spawns.map((sp) => ({ x: sp.x, y: sp.y, raio: sp.radius }))
  const longeDeNinho = (i: number): number => {
    const x = i % largura
    const y = (i / largura) | 0
    return ninhos.length === 0 ? 0 : Math.min(...ninhos.map((n) => Math.abs(n.x - x) + Math.abs(n.y - y) - n.raio))
  }
  const maisSeguro = maior.reduce((a, b) => (longeDeNinho(b) > longeDeNinho(a) ? b : a))
  const entrada = { x: maisSeguro % largura, y: (maisSeguro / largura) | 0 }
  /* O Centro vai para o ponto seguro mais distante da entrada: perto dela, voltar não custaria. */
  const seguros = maior.filter((i) => longeDeNinho(i) >= 2)
  const doCentro = seguros.reduce((a, b) => {
    const d = (i: number) => Math.abs((i % largura) - entrada.x) + Math.abs(((i / largura) | 0) - entrada.y)
    return d(b) > d(a) ? b : a
  })
  const centro = { x: doCentro % largura, y: (doCentro / largura) | 0 }
  // Realocados ANTES de mobiliar, senão reservá-los não protege nada: a pedra cairia em cima.
  const nascimentos = nosso.spawns.map(primeiroAndavel)

  /*
   * O CENÁRIO ENTRA DEPOIS DA COLISÃO ESTAR FECHADA, porque `mobiliar` precisa saber onde se anda
   * para encostar as peças na parede e para recusar a que trancaria um trecho.
   */
  if (cenario !== null) {
    const postos = mobiliar(
      { largura, altura, bloqueio: blocking },
      PALETAS[cenario]!,
      [entrada, centro, ...nascimentos],
      // A semente sai do nome da área: cada uma tem o seu arranjo, e sempre o mesmo.
      { ...OPCOES_PADRAO, semente: [...area].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) },
    )
    for (const p of postos) {
      const item = porId.get(p.prop.itemId)!
      // A mesma `colocar` do recorte: ela é quem sabe fatiar peça grande e nomear cada pedaço.
      colocar(item.height > 1 ? canopy : detail, p.x, p.y, p.prop.itemId)
      if (p.prop.barra) blocking[p.y * largura + p.x] = true
    }
    console.log(`  ${postos.length} peça(s) de cenário "${cenario}" postas`)
  }

  const saida = {
    ...nosso,
    // Tira a área do contrato com o Tiled: a partir daqui a geografia é do `.otbm`, não do `.tmj`.
    origem: 'otbm' as const,
    layers: { ground, detail, blocking, canopy },
    spawnPoint: entrada,
    pokecenter: centro,
    spawns: nosso.spawns.map((s, i) => ({ ...s, ...nascimentos[i]! })),
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
