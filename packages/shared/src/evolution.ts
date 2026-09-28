import type { Registry } from './registry.js'
import type { Species } from './schemas/species.js'

const alvo = (species: Species, nome: string, registry: Pick<Registry, 'species'>): Species => {
  const target = registry.species.get(nome)
  if (!target) throw new Error(`espécie ${species.name}: evolução ${nome} não existe no registro`)
  return target
}

/**
 * A evolução que o MOTOR resolve sozinho: por nível, e só por nível.
 *
 * Quem evolui por pedra não evolui aqui em nível nenhum, nem no cem. É o que faz a pedra ser uma
 * decisão do jogador em vez de um atalho opcional para algo que ia acontecer de qualquer jeito.
 */
export function nextEvolution(species: Species, level: number, registry: Pick<Registry, 'species'>): Species | undefined {
  const evo = species.evolvesTo
  if (!evo || !('level' in evo) || level < evo.level) return undefined
  return alvo(species, evo.species, registry)
}

/**
 * A evolução que a PEDRA destrava. Devolve `undefined` quando a espécie não evolui por item ou
 * quando o item na mão não é o que ela pede — usar Pedra do Fogo num Pikachu não pode virar um
 * Raichu, e também não pode gastar a pedra.
 */
export function evolutionByItem(species: Species, itemId: string, registry: Pick<Registry, 'species'>): Species | undefined {
  const evo = species.evolvesTo
  if (!evo || !('item' in evo) || evo.item !== itemId) return undefined
  return alvo(species, evo.species, registry)
}

/**
 * A linha evolutiva inteira, do primeiro estágio ao último, perguntando por qualquer um deles.
 *
 * Sobe até a raiz e depois desce, em vez de só descer: quem abre a ficha do Charizard quer ver
 * de onde ele veio tanto quanto para onde vai. Espécie desconhecida devolve linha vazia — é
 * resposta, não erro, e a tela sabe o que fazer com ela.
 */
export function evolutionChain(registry: Pick<Registry, 'species'>, name: string): Species[] {
  if (!registry.species.has(name)) return []

  // A subida e a descida guardam quem já passou: conteúdo com evolução circular travaria a tela
  // inteira num laço infinito, e um dado errado não pode ser capaz disso.
  let raiz = name
  const subiu = new Set<string>([raiz])
  for (;;) {
    const anterior = [...registry.species.values()].find((s) => s.evolvesTo?.species === raiz)
    if (!anterior || subiu.has(anterior.name)) break
    raiz = anterior.name
    subiu.add(raiz)
  }

  const linha: Species[] = []
  const vistos = new Set<string>()
  let atual: string | undefined = raiz
  while (atual !== undefined && !vistos.has(atual)) {
    const especie: Species | undefined = registry.species.get(atual)
    if (!especie) break
    vistos.add(atual)
    linha.push(especie)
    atual = especie.evolvesTo?.species
  }
  return linha
}
