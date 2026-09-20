import species from '../data/species.json' with { type: 'json' }
import moves from '../data/moves.json' with { type: 'json' }
import typeChart from '../data/type-chart.json' with { type: 'json' }
import items from '../data/items.json' with { type: 'json' }
import loot from '../data/loot.json' with { type: 'json' }
import unlocks from '../data/unlocks.json' with { type: 'json' }
import regions from '../data/regions.json' with { type: 'json' }
import route1 from '../data/hunts/route-1.json' with { type: 'json' }

/** Adicionar uma área = um import do mapa aqui e a entrada em regions.json. Tudo é validado em buildRegistry. */
export const rawData = { species, moves, typeChart, items, loot, unlocks, regions, hunts: [route1] } as const
