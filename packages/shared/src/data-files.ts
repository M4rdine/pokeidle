import campoInicial from '../data/hunts/campo-inicial.json' with { type: 'json' }
import bosqueDenso from '../data/hunts/bosque-denso.json' with { type: 'json' }
import trilhaPedregosa from '../data/hunts/trilha-pedregosa.json' with { type: 'json' }
import margemDoLago from '../data/hunts/margem-do-lago.json' with { type: 'json' }
import praiaLonga from '../data/hunts/praia-longa.json' with { type: 'json' }
import entradaDaCaverna from '../data/hunts/entrada-da-caverna.json' with { type: 'json' }
import cavernaFunda from '../data/hunts/caverna-funda.json' with { type: 'json' }
import picoRochoso from '../data/hunts/pico-rochoso.json' with { type: 'json' }
import grutaUmida from '../data/hunts/gruta-umida.json' with { type: 'json' }
import tunelRocha from '../data/hunts/tunel-rocha.json' with { type: 'json' }
import campoSafari from '../data/hunts/campo-safari.json' with { type: 'json' }
import usinaVelha from '../data/hunts/usina-velha.json' with { type: 'json' }
import ilhasEspuma from '../data/hunts/ilhas-espuma.json' with { type: 'json' }
import mataFechada from '../data/hunts/mata-fechada.json' with { type: 'json' }
import trilhaDaVitoria from '../data/hunts/trilha-da-vitoria.json' with { type: 'json' }
import cumeIndigo from '../data/hunts/cume-indigo.json' with { type: 'json' }
import { rawContent } from './content-files.js'

/**
 * Conteúdo mais os mapas jogáveis. Só o servidor e as ferramentas carregam isto; o cliente usa
 * `rawContent`. Adicionar uma área = um import do mapa aqui e a entrada em regions.json.
 * Tudo é validado em buildRegistry.
 */
export const rawData = {
  ...rawContent,
  hunts: [
    campoInicial, bosqueDenso, trilhaPedregosa, margemDoLago, praiaLonga, entradaDaCaverna, cavernaFunda, picoRochoso,
    grutaUmida, tunelRocha, campoSafari, usinaVelha, ilhasEspuma, mataFechada, trilhaDaVitoria, cumeIndigo,
  ],
} as const
