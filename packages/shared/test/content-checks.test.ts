import { describe, expect, it } from 'vitest'
import { buildRegistry, type RawRegistry } from '../src/registry.js'
import { loadRegistry } from '../src/registry-full.js'
import { rawData } from '../src/data-files.js'

/** Clona o conteúdo real e deixa mexer só no pedaço que o teste quer quebrar. */
const comConteudo = (patch: Partial<RawRegistry>): RawRegistry =>
  ({ ...rawData, ...patch } as RawRegistry)

const erroDe = (raw: RawRegistry): string => {
  try { buildRegistry(raw); return '' } catch (e) { return e instanceof Error ? e.message : String(e) }
}

describe('validação de conteúdo do registro', () => {
  it('o conteúdo do repositório passa em todas as checagens', () => {
    expect(() => loadRegistry()).not.toThrow()
  })

  it('item que ninguém obtém — nem por drop, nem na loja — derruba o registro', () => {
    // A checagem existe por causa de um bug real da referência: 34 evoluções dependiam de uma
    // pedra que nenhuma hunt dropava, e eles descobriram em produção. Hoje o gatilho mais próximo
    // que temos é o destrave por nível, que também aponta para um item.
    const unlocks = { ...(rawData.unlocks as object), items: { 'pedra-do-fogo': 10 } }
    const erro = erroDe(comConteudo({ unlocks }))
    expect(erro).toContain('pedra-do-fogo')
  })

  it('item obtenível pela loja é aceito, mesmo sem cair de ninguém', () => {
    const unlocks = { ...(rawData.unlocks as object), items: { 'hyper-potion': 30 } }
    expect(erroDe(comConteudo({ unlocks }))).toBe('')
  })

  it('preço de venda maior ou igual ao de compra derruba o registro', () => {
    const items = (rawData.items as { id: string; buyPrice: number; sellPrice: number }[]).map((i) =>
      i.id === 'potion' ? { ...i, sellPrice: i.buyPrice + 1 } : i)
    expect(erroDe(comConteudo({ items }))).toContain('potion')
  })

  it('drop com chance zero é entrada morta e derruba o registro', () => {
    const loot = (rawData.loot as { species: string; drops: { item: string; chance: number }[] }[]).map((l) =>
      l.species === 'zubat' ? { ...l, drops: l.drops.map((d) => ({ ...d, chance: 0 })) } : l)
    expect(erroDe(comConteudo({ loot }))).toContain('zubat')
  })

  it('lista todos os problemas de conteúdo de uma vez, não o primeiro', () => {
    const items = (rawData.items as { id: string; buyPrice: number; sellPrice: number }[]).map((i) =>
      i.id === 'potion' ? { ...i, sellPrice: 999 } : i)
    const loot = (rawData.loot as { species: string; drops: { item: string; chance: number }[] }[]).map((l) =>
      l.species === 'zubat' ? { ...l, drops: l.drops.map((d) => ({ ...d, chance: 0 })) } : l)
    const erro = erroDe(comConteudo({ items, loot }))
    expect(erro).toContain('potion')
    expect(erro).toContain('zubat')
  })
})
