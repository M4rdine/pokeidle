/**
 * O MOMENTO DA CAPTURA.
 *
 * Capturar é o que o jogo inteiro existe para produzir, e até aqui ele passava como um anel branco
 * de 400 ms no canvas e uma linha no registro. O evento mais importante da sessão tinha menos
 * presença na tela do que um Pokémon tomando dano.
 *
 * A BOLA É A QUE PEGOU, não uma genérica. O evento carrega o id do item, e mostrar a Ultra quando
 * foi a Ultra é informação de graça — dá para ver, sem ler o registro, que o motor gastou a bola
 * cara. Vale mais desde que as bolas viraram situacionais e a escolha passou a ser do motor.
 *
 * E A FALHA USA A MESMA PEÇA, com outro fim: a bola treme e ABRE. Ver a mesma bola terminar de
 * dois jeitos diferentes é o que faz o movimento informar em vez de enfeitar — o jogador aprende a
 * ler o fim da animação e para de precisar procurar no registro se pegou ou não.
 *
 * O RELÓGIO É INDEPENDENTE DA ANIMAÇÃO. Com `prefers-reduced-motion` a casa zera toda duração, e
 * um desmonte preso no `animationend` sumiria no mesmo quadro em que apareceu. Aqui a peça fica o
 * mesmo tempo nos dois casos: quem desligou o movimento continua vendo o que aconteceu, parado.
 */
import type { Event } from '@pokeidle/shared/protocol'
import type { AppContext } from '../../app-context.js'
import { displayName } from '../../state/log.js'
import { el } from '../dom.js'

/** Quanto a peça fica na tela. A animação cabe dentro disto; o desmonte não depende dela. */
const DURACAO_MS = 1700
/** A falha é mais curta: ela não é um marco, é um "de novo". */
const DURACAO_FALHA_MS = 900

/** Mostra a bola da captura por cima da cena. */
export function mountCaptura(root: HTMLElement, ctx: AppContext): () => void {
  let atual: HTMLElement | null = null
  let relogio: ReturnType<typeof setTimeout> | null = null

  const limpar = (): void => {
    if (relogio !== null) clearTimeout(relogio)
    relogio = null
    atual?.remove()
    atual = null
  }

  /*
   * Uma captura de cada vez. Com duas seguidas — e num idle elas vêm em rajada —, a segunda
   * empilharia por cima da primeira e as duas ficariam ilegíveis. A nova substitui a anterior:
   * o que importa é a captura de AGORA.
   */
  const mostrar = (peca: HTMLElement, duracao: number): void => {
    limpar()
    atual = peca
    root.append(peca)
    relogio = setTimeout(limpar, duracao)
  }

  const aoEvento = (e: Event): void => {
    if (e.type === 'captured') {
      const nome = ctx.registry.items.get(e.ball)?.name ?? e.ball
      mostrar(el('div', { class: 'captura', 'data-ball': e.ball, role: 'status' },
        el('span', { class: 'captura-bola' },
          el('span', { class: 'icone-item', 'data-item': e.ball, 'aria-hidden': 'true' })),
        el('p', { class: 'captura-nome' }, displayName(e.speciesName)),
        // Onde ele foi parar é a única pergunta que sobra depois de "pegou": o time está cheio ou
        // não. Sem isto, o jogador descobre abrindo o modal de Time.
        el('p', { class: 'captura-nota' }, `${nome}${e.toBox ? ' · foi para a mochila' : ''}`)), DURACAO_MS)
      return
    }
    if (e.type === 'captureFailed') {
      mostrar(el('div', { class: 'captura captura-falhou', 'data-ball': e.ball, role: 'status' },
        el('span', { class: 'captura-bola' },
          el('span', { class: 'icone-item', 'data-item': e.ball, 'aria-hidden': 'true' })),
        el('p', { class: 'captura-nota' }, 'escapou')), DURACAO_FALHA_MS)
    }
  }

  const off = ctx.loop?.onEvent(aoEvento) ?? null
  return () => { off?.(); limpar() }
}
