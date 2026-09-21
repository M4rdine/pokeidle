/**
 * A tela de escolher onde caçar, depois que o mapa virou a interface.
 *
 * O que estes casos protegem é o que a versão anterior errava: o mapa precisa aparecer com um
 * marcador POR ÁREA, a escolha precisa abrir o analisador SEM empurrar nada, e a área travada
 * precisa dizer o que falta em vez de simplesmente não oferecer o botão.
 *
 * Os casos de filtro por tipo, contagem "X de Y" e sanfona saíram junto com as features. Não
 * eram testes ruins — testavam uma tela que decidiu deixar de existir.
 */
import { describe, expect, it, vi } from 'vitest'
import { createContext } from '../../../src/app-context.js'
import type { Me } from '../../../src/api/dto.js'
import { initialSession, withMe } from '../../../src/state/session.js'
import { createStore } from '../../../src/state/store.js'
import { mountAreas } from '../../../src/ui/screens/areas/index.js'

const me = (patch: Partial<Me['trainer']> = {}): Me => ({
  user: { id: 'u', email: 'a@a.com', role: 'player' },
  trainer: {
    id: 't', name: 'Ash', xp: 0, gold: 120,
    settings: { returnHpPercent: 50, potionHpPercent: 50, capture: { ballTier: 'best', maxWildHpPercent: 30, allowDuplicates: false } },
    hasStarter: true, activeHuntId: null, level: 1, xpToNext: 8, teamSlots: 3,
    nextUnlock: { level: 10, what: '4 vagas no time' }, ...patch,
  },
})

/** Áreas reais de Kanto: a tela cruza o resumo do servidor com as espécies do registro. */
type Resumo = { id: string; name: string; width: number; height: number; minLevel: number; maxLevel: number; minTrainerLevel: number; locked: boolean }
const campo = { id: 'campo-inicial', name: 'Campo Inicial', width: 24, height: 36, minLevel: 2, maxLevel: 6, minTrainerLevel: 1, locked: false }
const lago = { id: 'margem-do-lago', name: 'Margem do Lago', width: 24, height: 36, minLevel: 10, maxLevel: 16, minTrainerLevel: 8, locked: false }
const pico = { id: 'pico-rochoso', name: 'Pico Rochoso', width: 24, height: 36, minLevel: 25, maxLevel: 35, minTrainerLevel: 23, locked: true }

const semRede = {
  get: vi.fn(async () => { throw new Error('sem rede no teste') }),
  post: vi.fn(async () => ({ session: { huntId: 'campo-inicial', sessionId: 's', startedAt: 'x' } })),
}

const ctxWith = (over: Record<string, unknown> = {}, hunts: readonly Resumo[] = [campo, lago, pico]) =>
  createContext({
    session: createStore({ ...withMe(initialSession(), me()), hunts }),
    http: semRede as never,
    ...over,
  })

const montar = (over: Record<string, unknown> = {}, hunts?: readonly Resumo[]) => {
  const root = document.createElement('div')
  mountAreas(root, ctxWith(over, hunts))
  return root
}

const marcador = (root: HTMLElement, id: string) => root.querySelector<HTMLButtonElement>(`.mapa-marcador[data-area="${id}"]`)!
const marcadores = (root: HTMLElement) => [...root.querySelectorAll('.mapa-marcador')].map((m) => m.getAttribute('data-area'))

describe('escolher onde caçar', () => {
  it('o mapa é a tela: um marcador por área, e nenhuma linha de lista', () => {
    const root = montar()
    expect(root.querySelector('h1')?.textContent).toBe('Onde caçar')
    expect(root.querySelector('.mapa-imagem')).not.toBeNull()
    expect(marcadores(root)).toEqual(['campo-inicial', 'margem-do-lago', 'pico-rochoso'])
    // A ficha de linhas e a sanfona saíram; se voltarem, este caso avisa.
    expect(root.querySelector('.area-row')).toBeNull()
    expect(root.querySelector('.area-detail')).toBeNull()
  })

  it('cada marcador leva o sprite de quem mora ali e a etiqueta com nome e faixa', () => {
    const root = montar()
    const m = marcador(root, 'campo-inicial')
    expect(m.querySelectorAll('.sprite-thumb').length).toBeGreaterThan(0)
    expect(m.textContent).toContain('Campo Inicial')
    expect(m.textContent).toContain('2–6')
    // Quem não vê a tela recebe nome, marco e faixa numa frase só.
    expect(m.getAttribute('aria-label')).toContain('Campo Inicial')
    expect(m.getAttribute('aria-label')).toContain('níveis 2 a 6')
  })

  it('escolher uma área abre o analisador ao lado, e escolher de novo fecha', () => {
    const root = montar()
    expect(root.querySelector('.mapa-analise-vazio')).not.toBeNull()

    marcador(root, 'margem-do-lago').click()
    expect(root.querySelector('.mapa-analise h3')?.textContent).toBe('Margem do Lago')
    expect(marcador(root, 'margem-do-lago').getAttribute('aria-pressed')).toBe('true')

    marcador(root, 'margem-do-lago').click()
    expect(root.querySelector('.mapa-analise-vazio')).not.toBeNull()
  })

  it('a área travada diz o nível que a abre, e não oferece o botão de caçar', () => {
    const root = montar()
    expect(marcador(root, 'pico-rochoso').classList.contains('mapa-marcador-travado')).toBe(true)

    marcador(root, 'pico-rochoso').click()
    const analise = root.querySelector('.mapa-analise')!
    expect(analise.querySelector('.hunt-gate')?.textContent).toContain('nível 23')
    expect(analise.querySelector('button.primary')).toBeNull()
  })

  it('a área liberada oferece caçar, e o clique chama o servidor uma vez só', () => {
    const root = montar()
    marcador(root, 'campo-inicial').click()
    const botao = root.querySelector<HTMLButtonElement>('.mapa-analise button.primary')!
    expect(botao.textContent).toBe('Caçar aqui')

    semRede.post.mockClear()
    botao.click()
    botao.click() // o botão se desabilita no primeiro clique
    expect(semRede.post).toHaveBeenCalledTimes(1)
    expect(String(semRede.post.mock.calls[0])).toContain('/hunts/campo-inicial/start')
  })

  it('as abas cobrem as regiões, e só uma fica ativa', () => {
    const root = montar()
    const abas = [...root.querySelectorAll('.mapa-aba')]
    expect(abas.length).toBeGreaterThanOrEqual(2)
    expect(abas.filter((a) => a.getAttribute('aria-selected') === 'true')).toHaveLength(1)
    expect(abas[0]?.textContent).toContain('Kanto')
  })

  it('trocar de região limpa a área escolhida', () => {
    // Um analisador de Kanto ao lado do mapa das Terras Altas seria um número certo apontando
    // para o lugar errado.
    const root = montar()
    marcador(root, 'campo-inicial').click()
    expect(root.querySelector('.mapa-analise h3')).not.toBeNull()

    root.querySelectorAll<HTMLButtonElement>('.mapa-aba')[1]!.click()
    expect(root.querySelector('.mapa-analise-vazio')).not.toBeNull()
  })

  it('região sem área liberada pelo servidor não desenha mapa vazio: diz o que houve', () => {
    const root = montar({}, [])
    expect(root.querySelector('.mapa-imagem')).toBeNull()
    expect(root.textContent).toContain('ainda não tem áreas liberadas')
  })
})
