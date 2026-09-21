import type { ContentRegistry } from '@pokeidle/shared'
import type { Event, HuntState, StopReason } from '@pokeidle/shared/protocol'
import { LOG_MAX_LINES } from '../config.js'

/**
 * `marco` existe para separar o raro do rotineiro. Sem ele, capturar um Pokémon novo e derrotar
 * mais um selvagem — que acontece a cada dois segundos — dividiam a mesma cor de destaque, e o
 * destaque deixava de significar qualquer coisa.
 */
export type LogKind = 'combat' | 'reward' | 'marco' | 'info' | 'alert'
export interface LogLine { readonly tick: number; readonly kind: LogKind; readonly text: string }
export interface LogContext { readonly registry: ContentRegistry; readonly state: HuntState | null }

export const displayName = (kebab: string): string => kebab.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
const STOP_TEXT: Record<StopReason, string> = { 'team-fainted': 'Time caído', intent: 'Parada por você', 'no-route': 'Sem caminho até o Centro', corrupt: 'Sessão corrompida', 'persist-failed': 'Erro ao salvar; tente de novo' }
export const stopReasonText = (reason: StopReason, healed: boolean): string => healed ? `${STOP_TEXT[reason]}. Time curado no Centro` : STOP_TEXT[reason]
const itemName = (ctx: LogContext, id: string): string => ctx.registry.items.get(id)?.name ?? displayName(id)
const pokemonName = (ctx: LogContext, id: string): string => { const p = ctx.state?.player.team.find((x) => x.id === id) ?? ctx.state?.box.find((x) => x.id === id); return p ? displayName(p.speciesName) : 'Pokémon' }
const wildName = (ctx: LogContext, id: string): string => { const w = ctx.state?.wilds.find((x) => String(x.id) === id); return w ? displayName(w.speciesName) : 'Selvagem' }
const line = (tick: number, kind: LogKind, text: string): LogLine => ({ tick, kind, text })

/** Uma linha por evento relevante; `moved` e `spawned` não geram linha (ruído). */
export function formatEvent(e: Event, ctx: LogContext): LogLine | null {
  switch (e.type) {
    case 'attack': return e.attacker === 'player'
      ? line(e.tick, 'combat', `${pokemonName(ctx, e.attackerId)} usou ${displayName(e.move)} em ${wildName(ctx, e.targetId)}: ${e.damage} de dano`)
      : line(e.tick, 'combat', `${wildName(ctx, e.attackerId)} usou ${displayName(e.move)} em ${pokemonName(ctx, e.targetId)}: ${e.damage} de dano`)
    case 'wildDefeated': {
      const drops = e.drops.map((d) => `${itemName(ctx, d.item)} ×${d.quantity}`)
      return line(e.tick, 'reward', [`${displayName(e.speciesName)} L${e.level} derrotado: +${e.xpTrainer} XP`, `+${e.gold} ouro`, ...drops].join(', '))
    }
    case 'captured': return line(e.tick, 'marco', `Capturou ${displayName(e.speciesName)} L${e.level}!${e.toBox ? ' Foi para a mochila de Pokémon' : ''}`)
    case 'captureFailed': return line(e.tick, 'info', `A ${itemName(ctx, e.ball)} falhou`)
    case 'levelUp': return line(e.tick, 'marco', `${pokemonName(ctx, e.pokemonId)} subiu para o nível ${e.level}`)
    case 'evolved': return line(e.tick, 'marco', `${displayName(e.from)} evoluiu para ${displayName(e.to)}`)
    case 'itemUsed': return line(e.tick, 'info', `Usou ${itemName(ctx, e.itemId)}: HP ${e.hp}`)
    case 'returning': return line(e.tick, 'info', 'HP baixo, voltando ao Centro')
    case 'healed': return line(e.tick, 'info', 'Time curado')
    case 'stopped': return line(e.tick, 'alert', `Hunt parada: ${STOP_TEXT[e.reason].toLowerCase()}`)
    case 'pokemonFainted': return line(e.tick, 'alert', `${pokemonName(ctx, e.pokemonId)} desmaiou`)
    case 'switched': return line(e.tick, 'info', `${pokemonName(ctx, e.pokemonId)} entrou em campo`)
    case 'skipped': return line(e.tick, 'info', `Pulou ${wildName(ctx, String(e.wildId))}: nenhum golpe faz efeito`)
    case 'moved': case 'spawned': return null
  }
}
export const appendLog = (lines: readonly LogLine[], next: LogLine, max = LOG_MAX_LINES): readonly LogLine[] => [...lines, next].slice(-max)
