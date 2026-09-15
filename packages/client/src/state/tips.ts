import type { HuntMap, Registry } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
import type { PokedexEntry } from '../api/dto.js'
import type { HuntView } from './hunt-view.js'

export interface Tip { readonly key: string; readonly text: string }

/** Uma dica por evento marcante (GDD §4); o chamador mostra cada chave uma vez só. */
export function tipFor(event: Event, view: HuntView): Tip | null {
  switch (event.type) {
    case 'wildDefeated': return { key: 'first-defeat', text: 'Seu Pokémon caça sozinho. Você pode fechar a aba.' }
    case 'captured': return { key: 'first-capture', text: `Capturou! O time tem ${view.state?.settings.teamSlots ?? 6} vagas; veja em Time.` }
    case 'itemUsed': return { key: 'first-potion', text: 'Usou uma Poção. Ajuste em Configurações quando usar e quando voltar ao Centro.' }
    case 'healed': return { key: 'first-return', text: 'Voltou ao Centro e curou o time. Ajuste o limiar em Configurações.' }
    default: return null
  }
}

/** Verdadeiro quando sobra no máximo uma bola somando todos os tipos. */
export function ballWarning(view: HuntView, registry: Registry): boolean {
  const inventory = view.state?.inventory ?? {}
  const balls = Object.entries(inventory).filter(([id]) => registry.items.get(id)?.kind === 'ball')
  return balls.reduce((total, [, quantity]) => total + quantity, 0) <= 1
}

/** "Rota 1: n/m" — m espécies da hunt, n as já capturadas (Pokédex do servidor ∪ `seen` da sessão). */
export function huntPokedexCount(view: HuntView, entries: readonly PokedexEntry[], map: HuntMap): { n: number; m: number } {
  const species = new Set(map.spawns.map((spawn) => spawn.speciesName))
  const caught = new Set([...entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName), ...(view.state?.settings.seen ?? [])])
  return { n: [...species].filter((name) => caught.has(name)).length, m: species.size }
}
