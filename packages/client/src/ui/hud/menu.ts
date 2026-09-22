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

  root.append(el('nav', { class: 'menu panel', 'aria-label': 'Funções do jogo' },
    el('div', { class: 'menu-grade' }, ...funcoes)))

  return () => { /* sem assinatura: o menu não lê estado, só dispara ação. */ }
}
