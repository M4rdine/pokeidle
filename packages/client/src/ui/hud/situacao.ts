import type { AppContext } from '../../app-context.js'
import { situacaoDoTime } from '../../state/situacao.js'
import { el, pct } from '../dom.js'
import { intentButton } from './intent-button.js'

/**
 * O que o time faz agora, contra quem, e o botão de encerrar.
 *
 * "Parar" morava no menu de funções lá em cima, ao lado de Mapa e Pokédex, e estava errado em
 * dois sentidos: o menu só abre painel, e o botão aparecia igual mesmo sem caçada nenhuma —
 * controle morto na tela. Aqui ele fica ao lado da frase que diz se existe caçada, e SOME quando
 * não existe. É a mesma pergunta: o que o time está fazendo, e como faço parar.
 */
export function mountSituacao(root: HTMLElement, ctx: AppContext): () => void {
  const texto = el('strong', { class: 'situacao-texto', 'data-situacao': '' }, 'sem caçada')
  const alvoNome = el('span', { class: 'alvo-nome' })
  const alvoNivel = el('span', { class: 'chip chip-nivel' })
  const alvoHp = el('progress', { class: 'hp-bar', 'data-alvo-hp': '', max: '1', value: '0' })
  const alvoHpTexto = el('span', { class: 'muted alvo-hp-texto' })
  const alvo = el('div', { class: 'situacao-alvo', hidden: 'true' },
    el('div', { class: 'alvo-linha' }, alvoNome, alvoNivel, alvoHpTexto),
    alvoHp)

  const parar = intentButton('Parar', () => ctx.sendIntent?.({ t: 'hunt.stop' }), 'parar')
  parar.classList.add('situacao-parar')

  root.append(el('section', { class: 'situacao panel', 'aria-live': 'polite' },
    el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, 'situação')),
    texto,
    alvo,
    parar))

  const render = (): void => {
    const s = situacaoDoTime(ctx.hunt.get())
    texto.textContent = s.texto
    texto.setAttribute('data-situacao', s.texto)
    // Sem caçada não há o que parar. O botão some em vez de ficar desabilitado: desabilitado
    // promete que existe uma ação ali esperando alguma condição, e aqui não existe.
    parar.hidden = ctx.hunt.get().state === null
    if (!s.alvo) { alvo.hidden = true; return }
    alvo.hidden = false
    alvoNome.textContent = s.alvo.nome
    alvoNivel.textContent = `nv ${s.alvo.nivel}`
    alvoHp.setAttribute('max', String(s.alvo.hpMax))
    alvoHp.setAttribute('value', String(s.alvo.hp))
    alvoHpTexto.textContent = `${pct(s.alvo.hp, s.alvo.hpMax)}%`
  }
  render()
  const offModo = ctx.hunt.subscribe((v) => v.state?.player.mode, render)
  const offAlvo = ctx.hunt.subscribe((v) => v.state?.player.targetWildId, render)
  const offTick = ctx.hunt.subscribe((v) => v.tick, render)
  return () => { offModo(); offAlvo(); offTick() }
}
