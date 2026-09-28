import { z } from 'zod'
import { kebab } from './species.js'

const base = { id: kebab, name: z.string().min(1), buyPrice: z.number().int().min(0), sellPrice: z.number().int().min(0) }
export const ItemSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('potion'), healPercent: z.number().int().min(1).max(100) }),
  /*
   * A bola tem um bônus DE CHÃO e, opcionalmente, uma SITUAÇÃO em que ele é outro.
   *
   * Com um eixo só, a melhor bola sempre ganha e as outras viram lixo: comprar Ultra torna Great
   * e Poké itens que ninguém mais toca. O par `situacao`/`bonusNaSituacao` faz o valor depender
   * do que está na frente, e é o que devolve escolha a uma decisão que hoje é automática.
   */
  z.object({
    ...base,
    kind: z.literal('ball'),
    ballBonus: z.number().positive(),
    situacao: z.enum(['intacto', 'agua-ou-inseto', 'nivel-baixo', 'ja-na-pokedex']).optional(),
    bonusNaSituacao: z.number().positive().optional(),
  }),
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
