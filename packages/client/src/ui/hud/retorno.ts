import { MAX_CATCHUP_TICKS, TICK_MS } from '@pokeidle/shared'
import type { Summary } from '@pokeidle/shared/protocol'
import { el } from '../dom.js'

/**
 * O painel de volta: o que aconteceu enquanto o jogador estava fora.
 *
 * Num idle esta é a tela de PAGAMENTO — a única que responde "valeu a pena deixar rodando?". Ela
 * era uma linha de toast que sumia em segundos e começava pelo número menos legível de todos:
 * "Catch-up: 54000 ticks, 812 derrotas, 4 capturas, +91234 XP, +12045 ouro". Tick não é unidade
 * de nada para quem joga, e o ouro — que é o que se veio ver — ficava no fim da frase.
 *
 * A ordem aqui é a da pergunta: quanto tempo passou, o que rendeu, o que mudou no time, o que
 * caiu, e o que custou. O que não aconteceu não ocupa linha nenhuma: zero captura não é
 * informação, é ruído no lugar onde o jogador procura o que aconteceu de bom.
 */

/**
 * O teto que o servidor simula de uma vez, em ticks: doze horas.
 *
 * Vem de `@pokeidle/shared` de propósito — o cliente precisa dele para EXPLICAR, não para impor, e
 * um número repetido aqui envelheceria calado no dia em que o servidor mudasse o dele. Sem o
 * aviso, quem voltasse depois de dois dias leria "12 h" e concluiria que o jogo comeu o resto.
 */
export const TETO_DE_CATCHUP_TICKS = MAX_CATCHUP_TICKS

const MINUTO = 60
const HORA = 3600

/** Duração em linguagem de relógio. Abaixo de um minuto ainda diz segundos: cinco ticks é 1 s. */
export function tempoFora(ticks: number): string {
  const total = Math.round((ticks * TICK_MS) / 1000)
  if (total < MINUTO) return `${total} s`
  if (total < HORA) return `${Math.floor(total / MINUTO)} min`
  const horas = Math.floor(total / HORA)
  const minutos = Math.floor((total % HORA) / MINUTO)
  return minutos === 0 ? `${horas} h` : `${horas} h ${minutos} min`
}

const numero = (n: number): string => n.toLocaleString('pt-BR')

/** Leitura pequena: rótulo em caixa alta sobre o número, o mesmo mostrador do resto do HUD. */
const leitura = (rotulo: string, valor: string, marca: string): HTMLElement =>
  el('div', { class: 'leitura' }, el('span', {}, rotulo), el('span', { [marca]: '' }, valor))

export interface OpcoesDeRetorno {
  readonly nomeDoItem: (id: string) => string
  readonly aoFechar: () => void
}

export function painelDeRetorno(summary: Summary, { nomeDoItem, aoFechar }: OpcoesDeRetorno): HTMLElement {
  const fechar = el('button', { class: 'primary', type: 'button' }, 'Continuar')
  fechar.addEventListener('click', aoFechar)

  // Só entra quem tem o que dizer. `filter(Boolean)` não serve aqui: o tipo é o que impede uma
  // dessas de virar `undefined` no meio dos filhos e sumir sem erro.
  const talvez = (condicao: boolean, montar: () => HTMLElement): HTMLElement[] => (condicao ? [montar()] : [])

  const drops = Object.entries(summary.drops)
  const mudancas = [
    ...talvez(summary.levelUps > 0, () => leitura('subiu de nível', numero(summary.levelUps), 'data-niveis')),
    ...talvez(summary.evolutions > 0, () => leitura('evoluiu', numero(summary.evolutions), 'data-evolucoes')),
  ]
  const custos = [
    ...talvez(summary.faints > 0, () => leitura('quedas', numero(summary.faints), 'data-quedas')),
    ...talvez(summary.returns > 0, () => leitura('voltas ao Centro', numero(summary.returns), 'data-voltas')),
  ]

  return el('div', { class: 'retorno' },
    el('h2', {}, 'Bem-vindo de volta'),
    el('p', { class: 'retorno-fora' }, 'O time caçou sozinho por ', el('strong', { 'data-fora': '' }, tempoFora(summary.ticks)), '.'),
    // O par que o jogador veio ver, em corpo grande e lado a lado — não no fim de uma frase.
    el('div', { class: 'retorno-ganho' },
      el('div', { class: 'ganho' }, el('span', {}, 'XP'), el('strong', { 'data-xp': '' }, numero(summary.xpTrainer))),
      el('div', { class: 'ganho ganho-ouro' }, el('span', {}, 'ouro'), el('strong', { 'data-ouro': '' }, numero(summary.gold)))),
    el('div', { class: 'retorno-leituras' },
      leitura('derrotas', numero(summary.defeats), 'data-derrotas'),
      ...talvez(summary.captures > 0, () => leitura('capturas', numero(summary.captures), 'data-capturas')),
      ...mudancas,
      ...custos),
    ...talvez(drops.length > 0, () => el('p', { class: 'retorno-drops', 'data-drops': '' },
      ...drops.flatMap(([item, quantidade], i) => [
        ...(i > 0 ? [el('span', { class: 'muted' }, ' · ')] : []),
        el('span', {}, `${nomeDoItem(item)} ×${numero(quantidade)}`),
      ]))),
    ...talvez(summary.ticks >= TETO_DE_CATCHUP_TICKS, () => el('p', { class: 'muted', 'data-teto': '' },
      `O jogo simula até ${tempoFora(TETO_DE_CATCHUP_TICKS)} de cada vez; o tempo além disso não entrou nesta conta.`)),
    fechar)
}
