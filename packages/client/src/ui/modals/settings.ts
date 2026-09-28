import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { SettingsResponseSchema } from '../../api/dto.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

/**
 * Um número com a REGRA escrita embaixo.
 *
 * Estes campos não são preferências de tela: são a política do motor enquanto você não está aqui.
 * "Usar poção abaixo de (%)" diz o que o campo recebe e não diz o que o jogo faz com ele — e quem
 * abre os Ajustes de um idle está justamente tentando entender o que a máquina decide sozinha.
 * A explicação é `aria-describedby`, então ela chega também a quem não vê a tela.
 */
const number = (id: string, label: string, value: number, regra: string): HTMLElement =>
  el('div', { class: 'field ajuste' },
    el('label', { for: id }, label),
    el('input', { id, name: id, type: 'number', min: '0', max: '100', value: String(value), 'aria-describedby': `${id}-regra` }),
    el('p', { class: 'ajuste-regra', id: `${id}-regra` }, regra))

/** Uma seção de ajustes, na mesma faixa de título dos painéis do jogo. */
const grupo = (titulo: string, ...campos: readonly HTMLElement[]): HTMLElement =>
  el('section', { class: 'ajuste-grupo' },
    el('div', { class: 'cabeca cabeca-barra' }, el('span', {}, titulo)),
    el('div', { class: 'ajuste-corpo' }, ...campos))

/** Um PATCH grava tudo: o servidor repassa ao runner da hunt, então não precisa mandar pelo socket. */
/**
 * Os valores são os identificadores do protocolo; o que o jogador lê é o nome da bola. Expor
 * `best`/`poke` a um jogo inteiramente em português era vazar nome de campo de API para a tela.
 */
const BOLAS = [
  ['best', 'A melhor disponível'],
  ['poke', 'Poké Bola'],
  ['great', 'Great Bola'],
  ['ultra', 'Ultra Bola'],
] as const

export function openSettings(ctx: AppContext): Modal {
  const current = ctx.session.get().me?.trainer.settings
  const error = el('p', { class: 'form-error', role: 'alert' })
  const potion = number('set-potion', 'Usar poção abaixo de', current?.potionHpPercent ?? 50,
    'O Pokémon ativo toma poção assim que o HP cai abaixo desta fração. Alto gasta poção à toa; baixo deixa ele cair.')
  const ret = number('set-return', 'Voltar ao Centro abaixo de', current?.returnHpPercent ?? 50,
    'Com o time todo abaixo disso, a caçada volta para curar. É a rede de segurança contra terminar com todos caídos.')
  const wildHp = number('set-wild-hp', 'Tentar captura com o selvagem abaixo de', current?.capture.maxWildHpPercent ?? 30,
    'Bola só depois de machucar até aqui. Quanto mais baixo, maior a chance por bola — e maior o risco de derrubar o alvo antes.')
  const tier = el('div', { class: 'field ajuste' },
    el('label', { for: 'set-tier' }, 'Bola preferida'),
    el('select', { id: 'set-tier', name: 'set-tier', 'aria-describedby': 'set-tier-regra' },
      ...BOLAS.map(([value, rotulo]) =>
        el('option', { value, ...(current?.capture.ballTier === value && { selected: true }) }, rotulo))),
    el('p', { class: 'ajuste-regra', id: 'set-tier-regra' },
      'Em "a melhor disponível", o motor escolhe a bola certa para cada encontro — Rápida no selvagem intacto, Rede contra água, Repetida em quem já está na Pokédex. Fixar uma trava essa escolha.'))
  const duplicates = el('div', { class: 'field field-check ajuste' },
    el('input', { id: 'set-dupes', name: 'set-dupes', type: 'checkbox', 'aria-describedby': 'set-dupes-regra', ...(current?.capture.allowDuplicates && { checked: true }) }),
    el('label', { for: 'set-dupes' }, 'Capturar duplicatas'),
    el('p', { class: 'ajuste-regra', id: 'set-dupes-regra' }, 'Desligado, o motor ignora espécies que já estão na sua Pokédex e economiza bola.'))

  /** Campo vazio ou fracionário vira um inteiro válido aqui: o servidor recusaria com 400. */
  const valueOf = (node: HTMLElement): number => {
    const raw = Number(node.querySelector<HTMLInputElement>('input')!.value)
    return Math.min(100, Math.max(0, Math.round(Number.isFinite(raw) ? raw : 0)))
  }
  const save = el('button', { class: 'primary', type: 'button' }, 'Salvar')
  save.addEventListener('click', () => {
    error.textContent = ''
    save.setAttribute('disabled', '')
    const patch = {
      potionHpPercent: valueOf(potion),
      returnHpPercent: valueOf(ret),
      capture: {
        ballTier: tier.querySelector<HTMLSelectElement>('select')!.value as 'poke' | 'great' | 'ultra' | 'best',
        maxWildHpPercent: valueOf(wildHp),
        allowDuplicates: duplicates.querySelector<HTMLInputElement>('input')!.checked,
      },
    }
    void ctx.http.patch('/trainer/settings', patch, SettingsResponseSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => { error.textContent = err instanceof Error ? err.message : 'não foi possível salvar' })
      .finally(() => save.removeAttribute('disabled'))
  })
  /**
   * Sair da conta. Vem do menu de funções lá em cima, onde estava ao lado de Mapa e Pokédex — a
   * única coisa naquela fileira que não abria painel, e a mais cara de apertar sem querer. Aqui
   * fica atrás de dois cliques e abaixo de uma divisória, que é o lugar de quem mexe na conta.
   */
  const sair = el('button', { type: 'button', class: 'settings-sair' }, 'Sair da conta')
  sair.addEventListener('click', () => {
    sair.setAttribute('disabled', '')
    void ctx.http.post('/auth/logout', {}, z.unknown())
      .then(() => ctx.go())
      .finally(() => sair.removeAttribute('disabled'))
  })
  const conta = el('div', { class: 'settings-conta' },
    el('div', { class: 'cabeca' }, el('span', {}, 'conta')),
    sair)

  /*
   * DOIS GRUPOS, porque são duas perguntas diferentes: como o time se mantém de pé, e como ele
   * decide capturar. Em lista única, os cinco campos eram cinco números sem parentesco visível.
   */
  return openModal(document.body, 'Ajustes', el('div', { class: 'settings' },
    grupo('em combate', potion, ret),
    grupo('captura', wildHp, tier, duplicates),
    el('div', { class: 'settings-acoes' }, save, error),
    conta))
}
