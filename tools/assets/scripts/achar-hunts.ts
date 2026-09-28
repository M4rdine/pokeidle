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
import { LIMITES_PADRAO, nota, procurar, type Limites, type Plano } from '../src/lugares.js'
import { ehSujeira } from '../src/sujeira.js'

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

async function main(): Promise<void> {
  const limites: Limites = {
    ...LIMITES_PADRAO,
    largura: numero('largura', LIMITES_PADRAO.largura),
    altura: numero('altura', LIMITES_PADRAO.altura),
    decoradosMinimos: numero('decorados', LIMITES_PADRAO.decoradosMinimos),
  }
  const porAndar = numero('por-andar', 3)

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
    for (const [i, t] of doAndar) {
      const chao = t.chao === null ? null : item(t.chao)
      if (!chao) continue
      plano.temChao[i] = 1
      if (t.casa) plano.casa[i] = 1
      if (chao.isBlocking || t.pilha.some((s) => item(s)?.isBlocking)) plano.bloqueia[i] = 1
      // Só conta como cenário o que SOBREVIVE à varrida: cadáver e poça não mobiliam nada.
      const enfeites = t.pilha.map(item).filter((x) => x !== null && !ehSujeira(x))
      if (enfeites.length > 0) plano.decoracao[i] = 1
    }

    const achados = procurar(plano, limites)
    console.log(`andar ${z}: ${achados.length} lugar(es) fechado(s)`)
    for (const [posicao, m] of achados.slice(0, porAndar).entries()) {
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
      const arquivo = `${SAIDA}/z${z}-${posicao + 1}-${m.x}x${m.y}.png`
      await writeFile(arquivo, encodePng(alvo))
      console.log(`  ${arquivo} · vedado ${(m.vedado * 100).toFixed(0)}% · andável ${(m.andavel * 100).toFixed(0)}% · cenário em ${m.decorados} células · nota ${nota(m, limites.largura * limites.altura).toFixed(2)}`)
    }
  }
}

await main()
