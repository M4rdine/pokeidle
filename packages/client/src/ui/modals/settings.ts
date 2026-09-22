import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { SettingsResponseSchema } from '../../api/dto.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

const number = (id: string, label: string, value: number): HTMLElement =>
  el('p', { class: 'field' }, el('label', { for: id }, label), el('input', { id, name: id, type: 'number', min: '0', max: '100', value: String(value) }))

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
  const potion = number('set-potion', 'Usar poção abaixo de (%)', current?.potionHpPercent ?? 50)
  const ret = number('set-return', 'Voltar ao Centro abaixo de (%)', current?.returnHpPercent ?? 50)
  const wildHp = number('set-wild-hp', 'Capturar com HP do selvagem abaixo de (%)', current?.capture.maxWildHpPercent ?? 30)
  const tier = el('p', { class: 'field' }, el('label', { for: 'set-tier' }, 'Bola preferida'),
    el('select', { id: 'set-tier', name: 'set-tier' },
      ...BOLAS.map(([value, rotulo]) =>
        el('option', { value, ...(current?.capture.ballTier === value && { selected: true }) }, rotulo))))
  const duplicates = el('p', { class: 'field field-check' },
    el('label', { for: 'set-dupes' }, 'Capturar duplicatas'),
    el('input', { id: 'set-dupes', name: 'set-dupes', type: 'checkbox', ...(current?.capture.allowDuplicates && { checked: true }) }))

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

  return openModal(document.body, 'Ajustes', el('div', { class: 'settings' }, potion, ret, wildHp, tier, duplicates, save, error, conta))
}
