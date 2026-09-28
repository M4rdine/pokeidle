import { z } from 'zod'
import { kebab } from './species.js'

const base = { id: kebab, name: z.string().min(1), buyPrice: z.number().int().min(0), sellPrice: z.number().int().min(0) }
export const ItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('potion'), healPercent: z.number().int().min(1).max(100) }),
  z.object({ ...base, kind: z.literal('ball'), ballBonus: z.number().positive() }),
  /*
   * REVIVER é um tipo próprio, e não uma poção com uma marca.
   *
   * Poção cura quem está de pé; Reviver age sobre quem CAIU, e o motor decide os dois em pontos
   * diferentes da escada. Como poção, ele entraria na escolha de cura e seria gasto para curar um
   * arranhão — e `choosePotion` teria que aprender a ignorá-lo, que é a assinatura de um tipo
   * espremido no lugar errado.
   */
  z.object({ ...base, kind: z.literal('revive'), healPercent: z.number().int().min(1).max(100) }),
  /* A PEDRA não tem número: o que ela faz está na espécie que a exige, não nela. */
  z.object({ ...base, kind: z.literal('stone') }),
])
export type Item = z.infer<typeof ItemSchema>
export const ItemListSchema = z.array(ItemSchema)
