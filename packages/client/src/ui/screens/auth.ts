import { z } from 'zod'
import type { AppContext } from '../../app-context.js'
import { el, mount } from '../dom.js'

type Tab = 'login' | 'register'
const message = (error: unknown): string => (error instanceof Error ? error.message : 'não foi possível concluir')

const field = (id: string, name: string, label: string, type: string): HTMLElement =>
  el('p', { class: 'field' }, el('label', { for: id }, label), el('input', { id, name, type, required: true, autocomplete: type === 'password' ? 'current-password' : 'off' }))

/** Entrar e registrar; o servidor devolve o cookie de sessão e `go()` decide a próxima tela. */
export function mountAuth(root: HTMLElement, ctx: AppContext): () => void {
  let tab: Tab = 'login'
  const render = (): void => {
    const error = el('p', { class: 'form-error', role: 'alert' })
    const submit = el('button', { class: 'primary', type: 'submit' }, tab === 'login' ? 'Entrar' : 'Criar conta')
    const form = el('form', { class: 'auth-form' },
      field('auth-email', 'email', 'E-mail', 'email'),
      field('auth-password', 'password', 'Senha', 'password'),
      tab === 'register' ? field('auth-name', 'name', 'Nome', 'text') : null,
      submit, error)
    form.addEventListener('submit', (ev) => {
      ev.preventDefault()
      const data = new FormData(form as HTMLFormElement)
      const body = {
        email: String(data.get('email') ?? ''),
        password: String(data.get('password') ?? ''),
        ...(tab === 'register' && { name: String(data.get('name') ?? '') }),
      }
      error.textContent = ''
      submit.setAttribute('disabled', '')
      void ctx.http.post(`/auth/${tab}`, body, z.unknown())
        .then(() => ctx.go())
        .catch((err: unknown) => { error.textContent = message(err) })
        .finally(() => submit.removeAttribute('disabled'))
    })
    const tabs = el('nav', { class: 'tabs' },
      ...(['login', 'register'] as const).map((name) =>
        el('button', { type: 'button', 'data-tab': name, class: name === tab ? 'tab tab-active' : 'tab', onclick: () => { tab = name; render() } },
          name === 'login' ? 'Entrar' : 'Registrar')),
    )
    // O `main` é o palco de tela cheia; o cartão é o objeto no meio dele. Antes o `main` ERA o
    // cartão, e por isso a folha de login se esticava pela janela inteira com dois campos
    // gigantes dentro — a primeira tela que alguém vê do jogo.
    mount(root, el('main', { class: 'screen screen-auth' },
      el('div', { class: 'auth-cartao panel' },
        el('h1', {}, 'Pokeidle'),
        el('p', { class: 'auth-lema' }, 'Seu time caça sozinho. Você escolhe onde.'),
        tabs, form)))
  }
  render()
  return () => { root.replaceChildren() }
}
