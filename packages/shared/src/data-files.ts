import species from '../data/species.json' with { type: 'json' }
import moves from '../data/moves.json' with { type: 'json' }
import typeChart from '../data/type-chart.json' with { type: 'json' }
import items from '../data/items.json' with { type: 'json' }
import loot from '../data/loot.json' with { type: 'json' }
import unlocks from '../data/unlocks.json' with { type: 'json' }
import regions from '../data/regions.json' with { type: 'json' }
import campoInicial from '../data/hunts/campo-inicial.json' with { type: 'json' }
import bosqueDenso from '../data/hunts/bosque-denso.json' with { type: 'json' }
import trilhaPedregosa from '../data/hunts/trilha-pedregosa.json' with { type: 'json' }
import margemDoLago from '../data/hunts/margem-do-lago.json' with { type: 'json' }
import praiaLonga from '../data/hunts/praia-longa.json' with { type: 'json' }
import entradaDaCaverna from '../data/hunts/entrada-da-caverna.json' with { type: 'json' }
import cavernaFunda from '../data/hunts/caverna-funda.json' with { type: 'json' }
import picoRochoso from '../data/hunts/pico-rochoso.json' with { type: 'json' }

/** Adicionar uma área = um import do mapa aqui e a entrada em regions.json. Tudo é validado em buildRegistry. */
export const rawData = { species, moves, typeChart, items, loot, unlocks, regions, hunts: [campoInicial, bosqueDenso, trilhaPedregosa, margemDoLago, praiaLonga, entradaDaCaverna, cavernaFunda, picoRochoso] } as const
