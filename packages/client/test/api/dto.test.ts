import { describe, expect, it } from 'vitest'
import { MeSchema, ShopSchema } from '../../src/api/dto.js'

const meFixture = {
  user: { id: 'u1', email: 'a@b.com', role: 'player' },
  trainer: {
    id: 't1', name: 'Ash', xp: 42, gold: 100,
    settings: { returnHpPercent: 50, potionHpPercent: 80, capture: { ballTier: 'poke', maxWildHpPercent: 30, allowDuplicates: false } },
    hasStarter: true, activeHuntId: null,
    level: 3, xpToNext: 58, teamSlots: 3, nextUnlock: { level: 5, what: 'ultra ball' },
  },
}

describe('dto', () => {
  it('MeSchema.parse aceita o formato atual de GET /me, com nextUnlock objeto ou null', () => {
    expect(MeSchema.parse(meFixture)).toEqual(meFixture)
    expect(MeSchema.parse({ ...meFixture, trainer: { ...meFixture.trainer, nextUnlock: null } }).trainer.nextUnlock).toBeNull()
  })
  it('MeSchema.parse rejeita quando trainer.level está ausente', () => {
    const { level, ...trainerWithoutLevel } = meFixture.trainer
    expect(() => MeSchema.parse({ ...meFixture, trainer: trainerWithoutLevel })).toThrow()
  })
  it('ShopSchema.parse aceita o formato do catálogo da loja', () => {
    const shop = { level: 1, gold: 0, items: [{ itemId: 'potion', name: 'Poção', kind: 'potion', buyPrice: 100, sellPrice: 50, unlockLevel: 0, unlocked: true, owned: 2 }] }
    expect(ShopSchema.parse(shop)).toEqual(shop)
  })
})
