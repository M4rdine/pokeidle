/**
 * Os dados de conteúdo, sem os mapas das áreas. É o que o navegador precisa: espécies, golpes,
 * itens, destraves e a lista de regiões com suas áreas. As camadas de tile de cada área pesam
 * centenas de kB e o cliente já as busca por HTTP quando entra numa caçada — trazê-las no bundle
 * seria pagar o download inteiro de Kanto para desenhar a barra do topo.
 */
import species from '../data/species.json' with { type: 'json' }
import moves from '../data/moves.json' with { type: 'json' }
import typeChart from '../data/type-chart.json' with { type: 'json' }
import items from '../data/items.json' with { type: 'json' }
import loot from '../data/loot.json' with { type: 'json' }
import unlocks from '../data/unlocks.json' with { type: 'json' }
import regions from '../data/regions.json' with { type: 'json' }

export const rawContent = { species, moves, typeChart, items, loot, unlocks, regions } as const
