import type { AppContext } from '../../app-context.js'
import { el } from '../dom.js'

/**
 * O estado do SISTEMA: se o socket está de pé e se a simulação está andando.
 *
 * Ele morava no painel do treinador, entre o ouro e a Pokédex — e não é assunto do treinador: não
 * fala do jogador, fala do PRODUTO. O lugar dele é a barra superior, no canto oposto à marca, que
 * é onde toda interface de jogo põe a luz de status e onde o olho já vai procurar quando alguma
 * coisa parece travada.
 *
 * De quebra, a barra deixa de ter um lado vazio: marca à esquerda, navegação no meio, estado à
 * direita.
 */
const CONN_TEXT: Readonly<Record<string, string>> = {
  open: 'conectado', connecting: 'conectando', reconnecting: 'reconectando', closed: 'desconectado',
}

export function mountEstado(root: HTMLElement, ctx: AppContext): () => void {
  const tick = el('span', { class: 'muted tb-pulso', 'data-tick': '', title: 'tique da simulação' }, 'simulando')
  const conn = el('span', { class: 'conn', 'data-conn': 'closed', role: 'status' }, CONN_TEXT['closed']!)
  root.append(el('div', { class: 'estado-topo' }, conn, tick))

  /*
   * A FASE VENCE O SOCKET. Durante o catch-up o socket está aberto, e dizer "conectado" enquanto
   * o servidor recupera dez horas de simulação responde à pergunta errada: o jogador está
   * olhando para uma tela que não anda e quer saber por quê.
   */
  const escrever = (): void => {
    const status = ctx.session.get().socket
    const key = ctx.hunt.get().phase === 'catching-up' ? 'catching-up' : status
    conn.setAttribute('data-conn', key)
    conn.textContent = key === 'catching-up' ? 'recuperando tempo' : CONN_TEXT[status] ?? status
  }
  const offConn = ctx.session.subscribe((s) => s.socket, escrever)
  const offPhase = ctx.hunt.subscribe((v) => v.phase, escrever)
  const offTick = ctx.hunt.subscribe((v) => v.tick, (value) => { tick.title = `tique ${value} da simulação` })
  return () => { offConn(); offPhase(); offTick() }
}
