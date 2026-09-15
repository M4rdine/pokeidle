import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import { mountAuth } from '../../../src/ui/screens/auth.js'

const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve() }
const fill = (root: HTMLElement, name: string, value: string) => { root.querySelector<HTMLInputElement>(`input[name=${name}]`)!.value = value }
const submit = (root: HTMLElement) => root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))

describe('tela de auth', () => {
  it('entrar manda POST /auth/login e chama go()', async () => {
    const post = vi.fn(async () => ({}))
    const go = vi.fn(async () => {})
    const ctx = createContext({ http: { post } as never, go })
    const root = document.createElement('div')
    mountAuth(root, ctx)
    fill(root, 'email', 'ash@test.dev')
    fill(root, 'password', 'senha-forte-123')
    submit(root)
    await flush()
    expect(post).toHaveBeenCalledWith('/auth/login', { email: 'ash@test.dev', password: 'senha-forte-123' }, expect.anything())
    expect(go).toHaveBeenCalled()
  })
  it('aba registrar pede nome, manda POST /auth/register e mostra o erro do servidor', async () => {
    const post = vi.fn(async () => { throw Object.assign(new Error('e-mail já usado'), { code: 'email-taken' }) })
    const ctx = createContext({ http: { post } as never })
    const root = document.createElement('div')
    mountAuth(root, ctx)
    expect(root.querySelector('input[name=name]')).toBeNull()
    root.querySelector<HTMLButtonElement>('[data-tab=register]')!.click()
    expect(root.querySelector('input[name=name]')).not.toBeNull()
    fill(root, 'email', 'a@a.com')
    fill(root, 'password', 'senha-forte-123')
    fill(root, 'name', 'Ash')
    submit(root)
    await flush()
    expect(post).toHaveBeenCalledWith('/auth/register', { email: 'a@a.com', password: 'senha-forte-123', name: 'Ash' }, expect.anything())
    expect(root.querySelector('.form-error')?.textContent).toBe('e-mail já usado')
  })
  it('os nomes acessíveis são os que a smoke E2E usa', () => {
    const root = document.createElement('div')
    mountAuth(root, createContext())
    expect(root.querySelector('[data-tab=login]')?.textContent).toBe('Entrar')
    expect(root.querySelector('[data-tab=register]')?.textContent).toBe('Registrar')
    expect(root.querySelector('label[for=auth-email]')?.textContent).toBe('E-mail')
    expect(root.querySelector('label[for=auth-password]')?.textContent).toBe('Senha')
    expect(root.querySelector('button[type=submit]')?.textContent).toBe('Entrar')
    root.querySelector<HTMLButtonElement>('[data-tab=register]')!.click()
    expect(root.querySelector('label[for=auth-name]')?.textContent).toBe('Nome')
    expect(root.querySelector('button[type=submit]')?.textContent).toBe('Criar conta')
  })
})
