/**
 * As texturas das bolas, para o efeito de captura no mundo.
 *
 * POR `Image`, E NÃO POR `Assets.load`. Os oito PNGs somam 2,5 KB e cada um está abaixo do limite
 * de embutir do Vite, então eles viajam como `data:` dentro do pacote. O carregador do Pixi busca
 * por `fetch`, e buscar um `data:` conta como *connect* — que a CSP desta casa bloqueia, porque
 * `connect-src` cai no `default-src 'self'`. Já `img-src` é `'self' data: blob:`, então a mesma
 * imagem entra sem reclamação quando quem a carrega é um `<img>`.
 *
 * Custou o mapa inteiro preto para eu descobrir isso: as oito promessas rejeitavam, o `Promise.all`
 * rejeitava, e `createScene` morria antes de desenhar um pixel.
 *
 * E É POR ISSO QUE NADA AQUI PODE FALHAR PARA FORA. Uma bola é enfeite; o mapa é o jogo. Cada
 * imagem é carregada por conta própria e um erro só custa aquela textura — quem não carregou cai
 * no retrato de reserva, e se nem ele vier, a cena desenha o anel de antes. Enfeite no caminho
 * crítico do arranque foi o erro de verdade, e a correção é esta, não o `<img>`.
 */
import { Texture } from 'pixi.js'
import greatBall from '../styles/ui/item-great-ball.png'
import masterBall from '../styles/ui/item-master-ball.png'
import nestBall from '../styles/ui/item-nest-ball.png'
import netBall from '../styles/ui/item-net-ball.png'
import pokeBall from '../styles/ui/item-poke-ball.png'
import quickBall from '../styles/ui/item-quick-ball.png'
import repeatBall from '../styles/ui/item-repeat-ball.png'
import ultraBall from '../styles/ui/item-ultra-ball.png'

const POR_ITEM: Readonly<Record<string, string>> = {
  'poke-ball': pokeBall, 'great-ball': greatBall, 'ultra-ball': ultraBall, 'master-ball': masterBall,
  'quick-ball': quickBall, 'net-ball': netBall, 'nest-ball': nestBall, 'repeat-ball': repeatBall,
}

/** A bola comum é o retrato de reserva: um item novo no servidor não pode apagar a animação. */
const PADRAO = 'poke-ball'

export interface TexturasDeBola {
  /** A textura da bola, ou `null` quando nem ela nem a de reserva carregaram. */
  readonly de: (itemId: string) => Texture | null
}

/** Uma imagem, ou `null`. Nunca lança: o chamador está no caminho de arranque da cena. */
async function carregar(url: string): Promise<Texture | null> {
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return Texture.from(img)
  } catch {
    return null
  }
}

export async function carregarBolas(): Promise<TexturasDeBola> {
  const carregadas = new Map<string, Texture>()
  await Promise.all(Object.entries(POR_ITEM).map(async ([id, url]) => {
    const textura = await carregar(url)
    if (textura) carregadas.set(id, textura)
  }))
  return { de: (itemId) => carregadas.get(itemId) ?? carregadas.get(PADRAO) ?? null }
}
