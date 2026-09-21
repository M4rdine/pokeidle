import type { AppContext } from '../../app-context.js'
import { situacaoDoTime } from '../../state/situacao.js'
import { el, pct } from '../dom.js'

/**
 * O que o time faz agora, e contra quem. Ocupava o vazio de 197 px da coluna esquerda — mas entra
 * por ser o dado que o jogador de um jogo ocioso chega para conferir, não para preencher buraco.
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

  root.append(el('section', { class: 'situacao panel' },
    el('div', { class: 'cabeca' }, el('span', {}, 'situação')),
    texto,
    alvo))

  const render = (): void => {
    const s = situacaoDoTime(ctx.hunt.get())
    texto.textContent = s.texto
    texto.setAttribute('data-situacao', s.texto)
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
