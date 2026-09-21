import type { HuntView } from './hunt-view.js'
import { displayName } from './log.js'

export interface AlvoAtual {
  readonly nome: string
  readonly nivel: number
  readonly hp: number
  readonly hpMax: number
}

export interface Situacao {
  /** Frase curta do que o time faz agora. */
  readonly texto: string
  /** O selvagem em foco, quando há combate. */
  readonly alvo: AlvoAtual | null
}

/**
 * O motor emite `mode` a cada tique e a tela nunca mostrou isso. É o dado mais direto que existe
 * sobre o que está acontecendo — procurando, andando, lutando, voltando, curando — e num jogo
 * ocioso é justamente o que o jogador chega para conferir.
 */
const FRASE: Readonly<Record<string, string>> = {
  searching: 'procurando',
  walking: 'a caminho',
  fighting: 'em combate',
  returning: 'voltando ao Centro',
  healing: 'curando',
  stopped: 'parado',
}

export function situacaoDoTime(view: HuntView): Situacao {
  const player = view.state?.player
  if (!player) return { texto: 'sem caçada', alvo: null }

  // Modo desconhecido sai cru em vez de virar string vazia: se o motor passar a emitir um estado
  // novo, é melhor a tela mostrar o nome dele do que esconder que algo mudou.
  const texto = FRASE[player.mode] ?? player.mode

  const alvoId = player.targetWildId
  if (alvoId === null) return { texto, alvo: null }
  const selvagem = view.state?.wilds.find((w) => w.id === alvoId)
  // O alvo pode ter morrido entre o tique e o desenho; ficha de alguém que não existe mais engana.
  if (!selvagem) return { texto, alvo: null }
  return {
    texto,
    alvo: { nome: displayName(selvagem.speciesName), nivel: selvagem.level, hp: selvagem.hp, hpMax: selvagem.hpMax },
  }
}
