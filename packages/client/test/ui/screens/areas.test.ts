import { beforeEach, describe, expect, it, vi } from 'vitest'
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

const idsVisiveis = (root: HTMLElement) => [...root.querySelectorAll('.area-row')].map((r) => r.getAttribute('data-area'))
/** A barra de filtros é recriada a cada render: guardar o nó antigo lê o estado de antes. */
const tipo = (root: HTMLElement, nome: string) => root.querySelector<HTMLButtonElement>(`.filter-type.type-${nome}`)!
const tipoOpcional = (root: HTMLElement, nome: string) => root.querySelector<HTMLButtonElement>(`.filter-type.type-${nome}`)

// A tela escreve os filtros na URL, e o happy-dom compartilha `location` entre os casos do
// arquivo: sem limpar, um filtro vaza para o teste seguinte.
beforeEach(() => { history.replaceState(null, '', location.pathname) })

describe('navegador de áreas', () => {
  it('lista as áreas com faixa de nível, espécies e a contagem total', () => {
    const root = montar()
    expect(root.querySelector('h1')?.textContent).toBe('Onde caçar')
    expect(root.querySelector('.area-count')?.textContent).toBe('3 áreas')
    expect(idsVisiveis(root)).toEqual(['campo-inicial', 'margem-do-lago', 'pico-rochoso'])
    const linha = root.querySelector('.area-row[data-area=campo-inicial]')!
    expect(linha.textContent).toContain('Campo Inicial')
    expect(linha.textContent).toContain('2–6')
    expect(linha.querySelectorAll('.sprite-thumb').length).toBeGreaterThan(0)
  })

  it('área bloqueada mostra o nível que a abre e não oferece o botão de caçar', () => {
    const root = montar()
    const bloqueada = root.querySelector('.area-row[data-area=pico-rochoso]')!
    expect(bloqueada.classList.contains('area-row-locked')).toBe(true)
    expect(bloqueada.textContent).toContain('nível 23')
    // O corpo da linha continua sendo botão (abre o detalhe); o que some é o botão de caçar.
    expect(bloqueada.querySelector('.area-start')).toBeNull()
  })

  it('agrupa por região, na ordem em que o jogo as abre, com o portão da fechada', () => {
    const grutaUmida: Resumo = { id: 'gruta-umida', name: 'Gruta Úmida', width: 24, height: 36, minLevel: 36, maxLevel: 44, minTrainerLevel: 34, locked: true }
    const root = montar({}, [grutaUmida, campo])
    const cabecalhos = [...root.querySelectorAll('.area-region')]
    expect(cabecalhos.map((c) => c.querySelector('h2')?.textContent)).toEqual(['Kanto', 'Terras Altas'])
    // A região inteira bloqueada mostra o nível que a abre; a liberada não mostra portão nenhum.
    expect(cabecalhos[0]!.querySelector('.area-gate')).toBeNull()
    expect(cabecalhos[1]!.querySelector('.area-gate')?.textContent).toBe('abre no nível 34')
    // A ordem das linhas segue a das regiões, não a ordem em que o servidor mandou.
    expect(idsVisiveis(root)).toEqual(['campo-inicial', 'gruta-umida'])
  })

  it('dentro da região, as liberadas vêm antes das bloqueadas, em ordem de nível', () => {
    const root = montar({}, [pico, lago, campo])
    expect(idsVisiveis(root)).toEqual(['campo-inicial', 'margem-do-lago', 'pico-rochoso'])
  })

  it('filtrar por tipo estreita a lista e a contagem passa a dizer quantas de quantas', () => {
    const root = montar()
    tipo(root, 'water').click()
    expect(tipo(root, 'water').getAttribute('aria-pressed')).toBe('true')
    expect(idsVisiveis(root)).toContain('margem-do-lago')
    expect(idsVisiveis(root)).not.toContain('pico-rochoso')
    expect(root.querySelector('.area-count')?.textContent).toMatch(/^\d+ de 3 áreas$/)
  })

  it('só aparecem os tipos que alguma área tem: nada de filtro que só leva ao vazio', () => {
    const root = montar()
    // As três áreas do fixture cobrem água, pedra, fogo, terra, planta, veneno, voador, fantasma
    // e dragão (o dratini da Margem do Lago).
    expect(tipoOpcional(root, 'water')).not.toBeNull()
    expect(tipoOpcional(root, 'rock')).not.toBeNull()
    // Nenhuma tem gelo ou aço, então esses botões não existem.
    expect(tipoOpcional(root, 'ice')).toBeNull()
    expect(tipoOpcional(root, 'steel')).toBeNull()
  })

  it('filtro sem resultado explica o que fazer, em vez de deixar a tela vazia', () => {
    const root = montar()
    // Pedra só existe no Pico Rochoso, que é de nível 25 a 35: com a faixa 2–6 não sobra nada.
    tipo(root, 'rock').click()
    root.querySelector<HTMLInputElement>('#filtro-maxLevel')!.value = '6'
    root.querySelector<HTMLInputElement>('#filtro-maxLevel')!.dispatchEvent(new Event('input', { bubbles: true }))
    expect(idsVisiveis(root)).toEqual([])
    const vazio = root.querySelector('.area-empty')!
    expect(vazio.textContent).toContain('Nenhuma área')
    // O atalho solta tipo e confronto, e a lista volta a ter o que mostrar.
    vazio.querySelector<HTMLButtonElement>('button')!.click()
    expect(idsVisiveis(root).length).toBeGreaterThan(0)
  })

  it('limpar filtros volta ao estado inicial e o botão desliga sozinho quando não há o que limpar', () => {
    const root = montar()
    const limpar = () => root.querySelector<HTMLButtonElement>('.filter-clear')!
    expect(limpar().hasAttribute('disabled')).toBe(true)
    tipo(root, 'water').click()
    expect(limpar().hasAttribute('disabled')).toBe(false)
    limpar().click()
    expect(idsVisiveis(root).length).toBe(3)
    expect(limpar().hasAttribute('disabled')).toBe(true)
  })

  it('o degrau de raridade só aparece onde informa algo, e o detalhe lista os drops', () => {
    const root = montar()
    // Campo Inicial é o degrau 1, o padrão: mostrar "drops ×1" seria ruído.
    expect(root.querySelector('.area-row[data-area=campo-inicial] .area-rarity')).toBeNull()
    const pico = root.querySelector('.area-row[data-area=pico-rochoso] .area-rarity')!
    expect(pico.textContent).toBe('drops ×8')

    root.querySelector<HTMLButtonElement>('.area-row[data-area=campo-inicial] .area-main')!.click()
    const cabecalho = root.querySelector('.analyzer-table thead')!
    expect(cabecalho.textContent).toContain('Drops')
    // O item aparece pelo nome, não pelo id, e com a chance em porcentagem.
    const primeiraLinha = root.querySelector('.analyzer-table tbody tr .drops')!
    expect(primeiraLinha.textContent).toMatch(/Poção|Bola/)
    expect(primeiraLinha.textContent).toMatch(/\d+%/)
  })

  it('abrir uma área mostra a tabela por espécie; abrir de novo fecha', () => {
    const root = montar()
    const corpo = () => root.querySelector<HTMLButtonElement>('.area-row[data-area=campo-inicial] .area-main')!
    corpo().click()
    expect(root.querySelector('.area-analyzer')).not.toBeNull()
    expect(corpo().getAttribute('aria-expanded')).toBe('true')
    const linhasDaTabela = root.querySelectorAll('.analyzer-table tbody tr')
    expect(linhasDaTabela.length).toBeGreaterThan(0)
    expect(root.querySelector('.analyzer-table thead')?.textContent).toContain('Captura')
    corpo().click()
    expect(root.querySelector('.area-analyzer')).toBeNull()
  })

  it('o corpo da linha é um botão de verdade, com rótulo próprio para leitor de tela', () => {
    const root = montar()
    const corpo = root.querySelector('.area-row[data-area=campo-inicial] .area-main')!
    // Botão nativo: Enter e Espaço já funcionam sem handler de teclado nosso.
    expect(corpo.tagName).toBe('BUTTON')
    expect(corpo.getAttribute('aria-label')).toContain('Campo Inicial')
    expect(corpo.getAttribute('aria-label')).toContain('Ver detalhes')
    // E o botão de caçar não fica dentro dele, porque botão dentro de botão não existe em HTML.
    expect(corpo.querySelector('button')).toBeNull()
  })

  it('caçar manda POST /hunts/:id/start e vai para o jogo, sem abrir o analisador junto', async () => {
    const go = vi.fn(async () => {})
    const root = montar({ go })
    root.querySelector<HTMLButtonElement>('.area-row[data-area=campo-inicial] .area-start')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(semRede.post).toHaveBeenCalledWith('/hunts/campo-inicial/start', {}, expect.anything())
    expect(go).toHaveBeenCalled()
    expect(root.querySelector('.area-analyzer')).toBeNull()
  })

  it('antes do time chegar, a tela diz que está calculando em vez de dar um veredito falso', () => {
    const root = montar()
    const metricas = root.querySelector('.area-row[data-area=campo-inicial] .area-metrics')!
    expect(metricas.getAttribute('aria-busy')).toBe('true')
    expect(metricas.textContent).toContain('calculando')
    // Com o time vazio a estimativa daria "não fere" em tudo; isso não pode aparecer como fato.
    expect(metricas.textContent).not.toContain('não fere')
    // Nem a contagem da Pokédex, que marcaria todas as espécies como faltando.
    expect(root.querySelector('.area-row[data-area=campo-inicial] .area-missing')).toBeNull()
  })

  it('sem o time carregado a ficha continua de pé, com aviso em vez de número inventado', async () => {
    const root = montar()
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(idsVisiveis(root).length).toBe(3)
    expect(root.querySelector('.form-error')?.textContent).toContain('time')
    expect(root.querySelector('.area-row[data-area=campo-inicial] .area-metrics')?.textContent).toContain('—')
  })
})
