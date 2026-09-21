import { z } from 'zod'
import { MAX_RARITY, MIN_RARITY } from '../loot.js'
import { kebab } from './species.js'

const PointSchema = z.object({ x: z.number().int().min(0), y: z.number().int().min(0) }).strict()

/**
 * Onde a área fica no MAPA DA REGIÃO — o Town Map oficial, não o mapa jogável.
 *
 * Em porcentagem da imagem, e não em pixel, porque o navegador escala a arte conforme a largura
 * do modal e um deslocamento em pixel se descolaria do marco na primeira janela de tamanho
 * diferente. `local` é o nome do marco no mapa oficial: ele não aparece na tela, existe para que
 * quem for mexer nestas coordenadas saiba em cima de que ponto elas estão.
 */
const PontoNoMapaSchema = z.object({
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  local: z.string().min(1),
}).strict()

const BoundsSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict()

/**
 * Área é um recorte da região: o mapa jogável dela vive em `hunts/<id>.json` e é gerado pelo
 * importador. Aqui ficam só os metadados que o navegador de áreas precisa para desenhar o
 * marcador e filtrar por tipo, nível e espécie.
 */
export const AreaSchema = z.object({
  id: kebab,
  name: z.string().min(1),
  bounds: BoundsSchema,
  anchor: PointSchema,
  /** A posição no Town Map. Sem ela a área não aparece na tela de escolher destino. */
  noMapa: PontoNoMapaSchema,
  species: z.array(kebab).min(1),
  minLevel: z.number().int().positive(),
  maxLevel: z.number().int().positive(),
  /** Quantos selvagens a área mantém vivos ao mesmo tempo, somando todos os spawns. */
  wildCount: z.number().int().positive(),
  /** Tempo de renascimento do spawn mais lento: é ele que limita o ritmo da caçada. */
  respawnSeconds: z.number().int().positive(),
  /**
   * Nível de treinador exigido para entrar. Sai da faixa de níveis da área: entrar dez níveis
   * abaixo do selvagem mais fraco é só perder tempo e Pokémon.
   */
  minTrainerLevel: z.number().int().min(1),
  /**
   * Degrau de raridade: 1 na área mais fácil da região, 8 na mais difícil. Multiplica só a
   * chance dos drops — é o que faz valer a pena voltar a uma área difícil.
   */
  rarity: z.number().int().min(MIN_RARITY).max(MAX_RARITY),
}).strict().refine((a) => a.minLevel <= a.maxLevel, { message: 'minLevel maior que maxLevel' })

export const RegionSchema = z.object({
  id: kebab,
  name: z.string().min(1),
  order: z.number().int().min(0),
  minTrainerLevel: z.number().int().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  /**
   * Qual Town Map a região usa, sem extensão — o cliente resolve para a arte vendorizada. Duas
   * regiões podem apontar para o mesmo mapa: as Terras Altas são a Kanto tardia, e os marcos
   * delas (Túnel Rocha, Zona Safári, Usina, Ilhas Espuma, Estrada da Vitória, Planalto Índigo)
   * estão todos no mapa de Kanto.
   */
  townMap: kebab,
  areas: z.array(AreaSchema).min(1),
}).strict().superRefine((r, ctx) => {
  const vistos = new Set<string>()
  const pontos = new Map<string, string>()
  for (const [i, a] of r.areas.entries()) {
    if (vistos.has(a.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas', i], message: `área duplicada: ${a.id}` })
    vistos.add(a.id)
    if (a.bounds.x + a.bounds.width > r.width || a.bounds.y + a.bounds.height > r.height) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas', i], message: `área ${a.id} sai dos limites da região` })
    }
    // Dois marcadores no mesmo ponto viram um só na tela, e a área de baixo fica inalcançável
    // sem nada denunciando — o marcador some e ninguém procura o que nunca viu.
    const chave = `${a.noMapa.x},${a.noMapa.y}`
    const antes = pontos.get(chave)
    if (antes !== undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['areas', i], message: `${a.id} e ${antes} caem no mesmo ponto do mapa` })
    }
    pontos.set(chave, a.id)
  }
})

export const RegionListSchema = z.array(RegionSchema).min(1)

export type Area = z.infer<typeof AreaSchema>
export type Region = z.infer<typeof RegionSchema>
