import { z } from 'zod'
import type { AppContext, ModalName } from '../../app-context.js'
import { MODAL_ICONS, MODAL_LABELS } from '../../config.js'
import { el } from '../dom.js'
import { intentButton } from './intent-button.js'

/**
 * O menu de funções, em grade, no alto da coluna do centro.
 *
 * Antes eram cinco atalhos de texto espremidos numa barra de topo de uma linha, do mesmo peso de
 * "Parar" e "Sair" — e numa tela estreita a fila quebrava em três linhas de moldura e comia a
 * altura do mundo. Em grade cada função tem o mesmo alvo, a ordem fica estável, e o que separa
 * navegar de mexer na sessão é a POSIÇÃO: as funções ficam na grade, e o par que tira o jogador
 * da caçada fica numa faixa à parte, embaixo.
 */
export function mountMenu(root: HTMLElement, ctx: AppContext): () => void {
  const funcoes = (Object.keys(MODAL_LABELS) as ModalName[]).map((modal) =>
    el('button', { type: 'button', class: 'menu-item', 'data-open': modal, onclick: () => ctx.openModal?.(modal) },
      el('span', { class: 'icone', 'data-icone': MODAL_ICONS[modal] }),
      el('span', {}, MODAL_LABELS[modal])))

  const stop = intentButton('Parar', () => ctx.sendIntent?.({ t: 'hunt.stop' }), 'parar')
  const leave = el('button', { type: 'button' }, 'Sair')
  leave.addEventListener('click', () => {
    leave.setAttribute('disabled', '')
    void ctx.http.post('/auth/logout', {}, z.unknown())
      .then(() => ctx.go())
      .finally(() => leave.removeAttribute('disabled'))
  })

  root.append(el('nav', { class: 'menu panel', 'aria-label': 'Funções do jogo' },
    el('div', { class: 'menu-grade' }, ...funcoes),
    el('div', { class: 'menu-sessao' }, stop, leave)))

  return () => { /* sem assinatura: o menu não lê estado, só dispara ação. */ }
}
