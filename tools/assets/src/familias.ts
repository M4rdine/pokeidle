/**
 * As FAMÍLIAS de tiles do dump, para a curadoria caber numa tarde.
 *
 * O PROBLEMA. O dump tem 18.602 itens; o manifest cura 70. O visual pobre dos mapas não vem do
 * código nem do motor — vem de construir tudo com 0,4% da paleta. E a curadoria não avançava
 * porque a folha de contato despeja os 18.602 numa grade só: ninguém escolhe olhando isso.
 *
 * A CHAVE. No Tibia, as peças de um mesmo terreno foram autoradas juntas e ficaram em IDS
 * CONTÍGUOS — o chão, suas oito bordas, os cantos, as variações. Agrupar por corrida de ids
 * reconstrói essas famílias sem que ninguém precise reconhecê-las a olho: os 1.623 chãos caem em
 * 270 corridas, e as 128 que têm quatro peças ou mais são onde os terrenos completos moram.
 *
 * O que isto entrega não é a escolha pronta — é a escolha POSSÍVEL: em vez de varrer dezoito mil
 * quadradinhos, olha-se meia centena de tiras e decide-se por família.
 */

/** Uma corrida de ids contíguos: uma família candidata. */
export interface Familia {
  readonly primeiro: number
  readonly ultimo: number
  readonly ids: readonly number[]
}

/** O que a curadoria separa. O dump só distingue estes dois por bandeira do `.dat`. */
export type Genero = 'chao' | 'bloqueante'

interface ItemDoCatalogo {
  readonly id: number
  readonly isGround: boolean
  readonly isBlocking: boolean
}

/**
 * Agrupa ids em corridas contíguas.
 *
 * Uma peça sozinha também é família: decorações avulsas existem e sumir com elas esconderia
 * metade do acervo. Quem filtra por tamanho é quem lê, não esta função.
 */
export function agruparEmCorridas(ids: readonly number[]): Familia[] {
  if (ids.length === 0) return []
  const ordenados = [...new Set(ids)].sort((a, b) => a - b)
  const familias: Familia[] = []
  let atual: number[] = [ordenados[0]!]
  for (const id of ordenados.slice(1)) {
    if (id === atual[atual.length - 1]! + 1) atual.push(id)
    else { familias.push({ primeiro: atual[0]!, ultimo: atual[atual.length - 1]!, ids: atual }); atual = [id] }
  }
  familias.push({ primeiro: atual[0]!, ultimo: atual[atual.length - 1]!, ids: atual })
  return familias
}

/** As famílias de um gênero, da maior para a menor: as grandes são os terrenos completos. */
export function familiasDe(itens: readonly ItemDoCatalogo[], genero: Genero): Familia[] {
  const ids = itens
    .filter((i) => (genero === 'chao' ? i.isGround : i.isBlocking && !i.isGround))
    .map((i) => i.id)
  return agruparEmCorridas(ids).sort((a, b) => b.ids.length - a.ids.length || a.primeiro - b.primeiro)
}
