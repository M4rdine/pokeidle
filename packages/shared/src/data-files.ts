import species from '../data/species.json' with { type: 'json' }
import moves from '../data/moves.json' with { type: 'json' }
import typeChart from '../data/type-chart.json' with { type: 'json' }
import items from '../data/items.json' with { type: 'json' }
import loot from '../data/loot.json' with { type: 'json' }
import route1 from '../data/hunts/route-1.json' with { type: 'json' }

/** Adicionar uma hunt = adicionar um import aqui. Tudo é validado em buildRegistry. */
export const rawData = { species, moves, typeChart, items, loot, hunts: [route1] } as const
