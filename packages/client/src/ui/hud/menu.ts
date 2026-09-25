import type { AppContext, ModalName } from '../../app-context.js'
import { MODAL_ICONS, MODAL_LABELS } from '../../config.js'
import { el } from '../dom.js'

/**
 * O menu de funções, em grade, no alto da coluna do centro.
 *
 * Aqui só entra o que ABRE UM PAINEL. "Parar" e "Sair" moravam numa faixa à direita desta mesma
 * barra e saíram: as duas mexem no estado da sessão, e nenhuma delas é navegação. Cada uma foi
 * para onde a pergunta é feita — parar, para o painel de situação, que é o que diz se existe
 * caçada; sair, para Ajustes, que é onde se mexe na conta.
 *
 * Antes disso tudo eram cinco atalhos de texto espremidos numa barra de uma linha, do mesmo peso
 * de "Parar" e "Sair". Em grade cada função tem o mesmo alvo e a ordem fica estável.
 */
export function mountMenu(root: HTMLElement, ctx: AppContext): () => void {
  const funcoes = (Object.keys(MODAL_LABELS) as ModalName[]).map((modal) =>
    el('button', { type: 'button', class: 'menu-item', 'data-open': modal, onclick: () => ctx.openModal?.(modal) },
      el('span', { class: 'icone', 'data-icone': MODAL_ICONS[modal] }),
      el('span', {}, MODAL_LABELS[modal])))

  /*
   * A BARRA SUPERIOR, e não seis peças soltas no alto da coluna.
   *
   * A referência do gênero abre com uma faixa que atravessa a tela, emoldurada, carregando a
   * marca à esquerda e a navegação no meio — e é ela que diz "isto é um jogo, e você está dentro
   * dele". Seis botões flutuando sobre o fundo dizem "isto é uma página".
   *
   * A marca fica aqui e em nenhum outro lugar da tela de jogo: uma vez, no canto de onde nunca
   * sai, que é como todo produto assina a própria interface.
   */
  root.append(el('nav', { class: 'menu barra-topo cantoneiras', 'aria-label': 'Funções do jogo' },
    el('div', { class: 'marca-topo' },
      el('span', { class: 'marca-bola', 'aria-hidden': 'true' }),
      el('span', { class: 'marca-nome' }, 'Pokeidle')),
    el('div', { class: 'menu-grade' }, ...funcoes)))

  return () => { /* sem assinatura: o menu não lê estado, só dispara ação. */ }
}
