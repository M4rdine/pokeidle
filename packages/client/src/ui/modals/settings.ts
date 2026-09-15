import type { AppContext } from '../../app-context.js'
import { SettingsResponseSchema } from '../../api/dto.js'
import { el } from '../dom.js'
import { openModal, type Modal } from './modal.js'

const number = (id: string, label: string, value: number): HTMLElement =>
  el('p', { class: 'field' }, el('label', { for: id }, label), el('input', { id, name: id, type: 'number', min: '0', max: '100', value: String(value) }))

/** Um PATCH grava tudo: o servidor repassa ao runner da hunt, então não precisa mandar pelo socket. */
export function openSettings(ctx: AppContext): Modal {
  const current = ctx.session.get().me?.trainer.settings
  const error = el('p', { class: 'form-error', role: 'alert' })
  const potion = number('set-potion', 'Usar poção abaixo de (%)', current?.potionHpPercent ?? 50)
  const ret = number('set-return', 'Voltar ao Centro abaixo de (%)', current?.returnHpPercent ?? 50)
  const wildHp = number('set-wild-hp', 'Capturar com HP do selvagem abaixo de (%)', current?.capture.maxWildHpPercent ?? 30)
  const tier = el('p', { class: 'field' }, el('label', { for: 'set-tier' }, 'Bola preferida'),
    el('select', { id: 'set-tier', name: 'set-tier' },
      ...(['best', 'poke', 'great', 'ultra'] as const).map((value) =>
        el('option', { value, ...(current?.capture.ballTier === value && { selected: true }) }, value))))
  const duplicates = el('p', { class: 'field field-check' },
    el('label', { for: 'set-dupes' }, 'Capturar duplicatas'),
    el('input', { id: 'set-dupes', name: 'set-dupes', type: 'checkbox', ...(current?.capture.allowDuplicates && { checked: true }) }))

  const valueOf = (node: HTMLElement): number => Number(node.querySelector<HTMLInputElement>('input')!.value)
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
  return openModal(document.body, 'Configurações', el('div', { class: 'settings' }, potion, ret, wildHp, tier, duplicates, save, error))
}
