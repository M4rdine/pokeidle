import campoInicial from '../data/hunts/campo-inicial.json' with { type: 'json' }
import bosqueDenso from '../data/hunts/bosque-denso.json' with { type: 'json' }
import trilhaPedregosa from '../data/hunts/trilha-pedregosa.json' with { type: 'json' }
import margemDoLago from '../data/hunts/margem-do-lago.json' with { type: 'json' }
import praiaLonga from '../data/hunts/praia-longa.json' with { type: 'json' }
import entradaDaCaverna from '../data/hunts/entrada-da-caverna.json' with { type: 'json' }
import cavernaFunda from '../data/hunts/caverna-funda.json' with { type: 'json' }
import picoRochoso from '../data/hunts/pico-rochoso.json' with { type: 'json' }
import { rawContent } from './content-files.js'

/**
 * Conteúdo mais os mapas jogáveis. Só o servidor e as ferramentas carregam isto; o cliente usa
 * `rawContent`. Adicionar uma área = um import do mapa aqui e a entrada em regions.json.
 * Tudo é validado em buildRegistry.
 */
export const rawData = {
  ...rawContent,
  hunts: [campoInicial, bosqueDenso, trilhaPedregosa, margemDoLago, praiaLonga, entradaDaCaverna, cavernaFunda, picoRochoso],
} as const
