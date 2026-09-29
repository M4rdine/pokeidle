/**
 * Procura, no mapa do mundo, os pedaços que já SÃO uma hunt — e desenha os finalistas para serem
 * olhados antes de qualquer um deles virar área do jogo.
 *
 * O DESENHO É O PONTO. A medida aprova ou reprova geometria; ela não sabe se o lugar é bonito.
 * Renderizar o candidato direto do dump, sem passar pelo atlas, fecha o ciclo em segundos e sem
 * escrever nada no jogo — que é o que faltava quando o primeiro recorte foi escolhido por número
 * e só se descobriu feio depois de convertido, publicado e aberto no navegador.
 *
 *   pnpm assets achar-hunts [--largura 24] [--altura 36] [--por-andar 3]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { lerMapa, type TileDoMapa } from '../src/otbm.js'
import { lerItensOtb } from '../src/otb-itens.js'
import { loadCatalog, itemFramePath } from '../src/extract.js'
import { decodePng, encodePng } from '../src/png.js'
import type { RgbaImage } from '../src/compose.js'
import { LIMITES_PADRAO, medir, aprovado, nota, type Limites, type Plano } from '../src/lugares.js'
import { ehSujeira } from '../src/sujeira.js'
import { atende, classeDaCor, composicao, type ClasseDeTerreno, type Exigencia } from '../src/terrenos.js'

/**
 * O que cada tema exige do chão, em fração das células do recorte.
 *
 * Sem isto a busca é cega a bioma: ela achava cavernas ótimas e as ofereceria para a Praia Longa
 * com a mesma convicção. As faixas são largas de propósito — isto é TRIAGEM, e quem decide se o
 * lugar presta é o olho, depois, olhando o desenho.
 */
interface Tema {
  readonly exigencia: Exigencia
  /** Andares onde o tema faz sentido. Sem isto, um campo de terra na superfície vira "caverna". */
  readonly andares: (z: number) => boolean
}

/**
 * O que cada tema exige do chão, em fração das células do recorte.
 *
 * AS FAIXAS SAÍRAM DE MEDIR, não de imaginar. Eu escrevi "caverna: pedra ≥ 15%" e a busca devolveu
 * ZERO — porque a rocha desta caverna é VERMELHA, e o classificador a lê como terra, corretamente:
 * ela não é cinza. As cavernas boas do mapa dão terra 92–98% e pedra 4–8%, e é isso que está aqui.
 *
 * A lição é a de sempre neste projeto: o número do filtro vem da amostra que já se sabe boa.
 */
const TEMAS: Readonly<Record<string, Tema>> = {
  campo: { exigencia: { grama: [0.5, 1], agua: [0, 0.08] }, andares: (z) => z <= 7 },
  floresta: { exigencia: { grama: [0.45, 1], agua: [0, 0.15] }, andares: (z) => z <= 7 },
  margem: { exigencia: { grama: [0.25, 0.75], agua: [0.15, 0.5] }, andares: (z) => z <= 7 },
  /*
   * Areia é só 4% da superfície inteira deste mundo, e não há UMA célula de água no subsolo. Foi
   * medindo a distribuição por andar que isso apareceu: pedir praia com 20% de areia devolvia
   * zero, e "gruta" (caverna com água) é simplesmente impossível aqui. As faixas abaixo são o que
   * o mapa tem, não o que eu gostaria que tivesse.
   */
  praia: { exigencia: { areia: [0.08, 0.8], agua: [0.08, 0.6] }, andares: (z) => z <= 7 },
  rochoso: { exigencia: { pedra: [0.25, 1], grama: [0, 0.6], agua: [0, 0.1] }, andares: (z) => z <= 7 },
  caverna: { exigencia: { terra: [0.6, 1], grama: [0, 0.03], agua: [0, 0.04] }, andares: (z) => z >= 8 },
  /* Os andares 5 e 6 são TOPO DE MONTANHA: em Tibia, z menor é mais alto. É lá que mora a pedra. */
  pico: { exigencia: { pedra: [0.35, 1], agua: [0, 0.05] }, andares: (z) => z >= 4 && z <= 6 },
}

const MAPA = 'assets/otbm/map.otbm'
const ITENS = 'assets/otbm/items.otb'
const EXTRAIDO = 'assets/extracted-otp2019'
const SAIDA = 'assets/candidatos'
const LADO = 32
const BYTES = 4

const numero = (nome: string, padrao: number): number => {
  const i = process.argv.indexOf(`--${nome}`)
  return i < 0 ? padrao : Number(process.argv[i + 1])
}

const texto = (nome: string): string | null => {
  const i = process.argv.indexOf(`--${nome}`)
  return i < 0 ? null : (process.argv[i + 1] ?? null)
}

async function main(): Promise<void> {
  const limites: Limites = {
    ...LIMITES_PADRAO,
    largura: numero('largura', LIMITES_PADRAO.largura),
    altura: numero('altura', LIMITES_PADRAO.altura),
    decoradosMinimos: numero('decorados', LIMITES_PADRAO.decoradosMinimos),
    vedadoMinimo: numero('vedado', LIMITES_PADRAO.vedadoMinimo),
    andavelMinimo: numero('andavel-min', LIMITES_PADRAO.andavelMinimo),
    andavelMaximo: numero('andavel-max', LIMITES_PADRAO.andavelMaximo),
  }
  const porAndar = numero('por-andar', 3)
  const nomeDoTema = texto('tema')
  if (nomeDoTema !== null && !(nomeDoTema in TEMAS)) throw new Error(`tema "${nomeDoTema}" não existe; há: ${Object.keys(TEMAS).join(', ')}`)
  const tema: Tema | null = nomeDoTema === null ? null : TEMAS[nomeDoTema]!
  const exigencia: Exigencia = tema?.exigencia ?? {}

  const mapa = lerMapa(await readFile(MAPA))
  const otb = lerItensOtb(await readFile(ITENS))
  const catalogo = await loadCatalog(EXTRAIDO)
  const porId = new Map(catalogo.items.map((i) => [i.id, i]))
  await mkdir(SAIDA, { recursive: true })

  /** Id de servidor → item do dump, ou `null` quando este mapa usa algo que não temos desenho. */
  const item = (idDeServidor: number) => {
    const cid = otb.paraCliente.get(idDeServidor)
    return cid === undefined ? null : (porId.get(cid) ?? null)
  }

  const andares = [...new Set(mapa.tiles.map((t) => t.z))].sort((a, b) => a - b)
  const grade = new Map<number, Map<number, TileDoMapa>>()
  for (const t of mapa.tiles) {
    let doAndar = grade.get(t.z)
    if (!doAndar) { doAndar = new Map(); grade.set(t.z, doAndar) }
    doAndar.set(t.y * mapa.largura + t.x, t)
  }

  /*
   * A CLASSE DE TERRENO DE CADA CHÃO, medida uma vez pela cor média do sprite. É o que deixa
   * pedir "praia" em vez de "qualquer lugar fechado" — ver `terrenos.ts`.
   */
  const classeDoItem = new Map<number, ClasseDeTerreno | null>()
  /**
   * Se o sprite do chão é INTEIRO, sem furo.
   *
   * Existe por um defeito que só apareceu na tela: quatro recortes saíram com buracos pretos na
   * borda da rocha. Nenhuma célula estava sem chão — o chão é que era VAZADO. Borda de penhasco no
   * Tibia é desenhada com partes transparentes, e o cliente mostra o ANDAR DE BAIXO através delas.
   * O nosso recorte tem um andar só, então atrás do furo não há nada, e o mapa volta a "acabar do
   * nada" — o mesmo defeito da primeira entrega, com outra roupa.
   *
   * Recortar dois andares e compor resolveria de verdade; enquanto isso não existe, a busca
   * simplesmente não escolhe lugar com chão vazado.
   */
  const inteiroDoItem = new Map<number, boolean>()
  const medirChao = async (cid: number): Promise<void> => {
    if (classeDoItem.has(cid)) return
    let cor: [number, number, number] | null = null
    let inteiro = false
    try {
      const img = decodePng(await readFile(itemFramePath(EXTRAIDO, cid, 0, 0)))
      let r = 0, g = 0, b = 0, n = 0, opacos = 0
      for (let i = 0; i < img.data.length; i += BYTES) {
        if (img.data[i + 3]! > 0) opacos++
        if (img.data[i + 3]! < 200) continue
        r += img.data[i]!; g += img.data[i + 1]!; b += img.data[i + 2]!; n++
      }
      if (n > 0) cor = [r / n, g / n, b / n]
      inteiro = opacos === img.width * img.height
    } catch { cor = null }
    classeDoItem.set(cid, classeDaCor(cor))
    inteiroDoItem.set(cid, inteiro)
  }

  const desenhos = new Map<string, RgbaImage>()
  const desenho = async (id: number, px: number, py: number): Promise<RgbaImage | null> => {
    const chave = `${id}_${px}_${py}`
    const pronto = desenhos.get(chave)
    if (pronto) return pronto
    try {
      const img = decodePng(await readFile(itemFramePath(EXTRAIDO, id, px, py)))
      desenhos.set(chave, img)
      return img
    } catch { return null }
  }

  /** Cola o desenho com o canto INFERIOR-DIREITO na célula, que é como o cliente do Tibia o põe. */
  const colar = (alvo: RgbaImage, img: RgbaImage, dx: number, dy: number): void => {
    const x0 = (dx + 1) * LADO - img.width
    const y0 = (dy + 1) * LADO - img.height
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const ax = x0 + x
        const ay = y0 + y
        if (ax < 0 || ay < 0 || ax >= alvo.width || ay >= alvo.height) continue
        const de = (y * img.width + x) * BYTES
        if (img.data[de + 3] === 0) continue
        alvo.data.set(img.data.subarray(de, de + BYTES), (ay * alvo.width + ax) * BYTES)
      }
    }
  }

  for (const z of andares) {
    if (tema && !tema.andares(z)) continue
    const doAndar = grade.get(z)!
    const celulas = mapa.largura * mapa.altura
    const plano: Plano = {
      largura: mapa.largura,
      altura: mapa.altura,
      temChao: new Uint8Array(celulas),
      bloqueia: new Uint8Array(celulas),
      casa: new Uint8Array(celulas),
      decoracao: new Uint8Array(celulas),
    }
    const classeDaCelula: (ClasseDeTerreno | null)[] = new Array(celulas).fill(null)
    const vazado = new Uint8Array(celulas)
    for (const [i, t] of doAndar) {
      const chao = t.chao === null ? null : item(t.chao)
      if (!chao) continue
      plano.temChao[i] = 1
      if (t.casa) plano.casa[i] = 1
      await medirChao(chao.id)
      classeDaCelula[i] = classeDoItem.get(chao.id) ?? null
      if (inteiroDoItem.get(chao.id) !== true) vazado[i] = 1
      if (chao.isBlocking || t.pilha.some((s) => item(s)?.isBlocking)) plano.bloqueia[i] = 1
      // Só conta como cenário o que SOBREVIVE à varrida: cadáver e poça não mobiliam nada.
      const enfeites = t.pilha.map(item).filter((x) => x !== null && !ehSujeira(x))
      if (enfeites.length > 0) plano.decoracao[i] = 1
    }

    /*
     * A varredura fica aqui, e não em `procurar`, porque a exigência de TEMA depende de ler os
     * sprites — e `lugares.ts` é sobre geometria, sem nada de arquivo. Misturar as duas coisas
     * lá tornaria o módulo puro dependente do dump.
     */
    const aprovados: { m: ReturnType<typeof medir>; comp: Readonly<Record<string, number>> }[] = []
    for (let y = 0; y + limites.altura <= mapa.altura; y += limites.passo) {
      for (let x = 0; x + limites.largura <= mapa.largura; x += limites.passo) {
        const m = medir(plano, x, y, limites.largura, limites.altura)
        if (!aprovado(m, limites)) continue
        const classes: (ClasseDeTerreno | null)[] = []
        for (let dy = 0; dy < limites.altura; dy++) {
          for (let dx = 0; dx < limites.largura; dx++) classes.push(classeDaCelula[(y + dy) * mapa.largura + x + dx] ?? null)
        }
        const comp = composicao(classes)
        if (!atende(comp, exigencia)) continue
        // Uma única célula de chão vazado já desenha um furo preto na tela.
        let furos = 0
        for (let dy = 0; dy < limites.altura && furos === 0; dy++) {
          for (let dx = 0; dx < limites.largura; dx++) {
            if (vazado[(y + dy) * mapa.largura + x + dx] === 1) { furos++; break }
          }
        }
        if (furos > 0) continue
        aprovados.push({ m, comp })
      }
    }
    const celulasDaJanela = limites.largura * limites.altura
    aprovados.sort((a, b) => nota(b.m, celulasDaJanela) - nota(a.m, celulasDaJanela))
    const achados: typeof aprovados = []
    for (const cand of aprovados) {
      const perto = achados.some((e) => Math.abs(e.m.x - cand.m.x) < limites.largura / 2 && Math.abs(e.m.y - cand.m.y) < limites.altura / 2)
      if (!perto) achados.push(cand)
    }
    console.log(`andar ${z}: ${achados.length} lugar(es)${nomeDoTema ? ` de tema "${nomeDoTema}"` : ' fechado(s)'}`)
    for (const [posicao, { m, comp }] of achados.slice(0, porAndar).entries()) {
      const alvo: RgbaImage = {
        width: limites.largura * LADO,
        height: limites.altura * LADO,
        data: new Uint8Array(limites.largura * LADO * limites.altura * LADO * BYTES),
      }
      for (let dy = 0; dy < limites.altura; dy++) {
        for (let dx = 0; dx < limites.largura; dx++) {
          const mundoX = m.x + dx
          const mundoY = m.y + dy
          const t = doAndar.get(mundoY * mapa.largura + mundoX)
          if (!t) continue
          for (const id of [t.chao, ...t.pilha]) {
            if (id === null) continue
            const it = item(id)
            if (!it) continue
            // O desenho mostra o que o jogo VAI ver, e o jogo não vê sujeira.
            if (it !== item(t.chao ?? -1) && ehSujeira(it)) continue
            // O padrão do Tibia varia com a POSIÇÃO no mundo: é o que tira a repetição da grama.
            const img = await desenho(it.id, mundoX % it.patternX, mundoY % it.patternY)
            if (img) colar(alvo, img, dx, dy)
          }
        }
      }
      const prefixo = nomeDoTema ?? 'z'
      const arquivo = `${SAIDA}/${prefixo}-z${z}-${posicao + 1}-${m.x}x${m.y}.png`
      await writeFile(arquivo, encodePng(alvo))
      const terreno = Object.entries(comp).filter(([, v]) => v >= 0.04).sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(' · ')
      console.log(`  ${arquivo} · vedado ${(m.vedado * 100).toFixed(0)}% · andável ${(m.andavel * 100).toFixed(0)}% · cenário ${m.decorados} · ${terreno}`)
    }
  }
}

await main()
