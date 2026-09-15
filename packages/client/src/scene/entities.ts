import { Container, Graphics, Text } from 'pixi.js'
import { TICK_MS } from '../config.js'
import { createTween, directionOf, type Direction, type Tween } from './interpolate.js'
import { hpColor, nextTween } from './tweening.js'
import { entitiesOf, reconcile, type Entities, type Entity, type Op } from './reconcile.js'
import { makeEntitySprite, type EntitySprite, type Sheets } from './sprites.js'
import type { HuntView } from '../state/hunt-view.js'

export interface Live { sprite: EntitySprite; direction: Direction; readonly overlay: Container; readonly hpBar: Graphics; readonly label: Text; tween: Tween; entity: Entity }

export interface EntityLayerDeps {
  readonly sheets: Sheets
  readonly entities: Container
  readonly overlay: Container
  readonly now: () => number
  /** app.ts decide como sumir (efeitos, ticker); aqui só avisamos quem foi removido. */
  readonly fadeOutRemoved: (root: Container, overlay: Container) => void
  /** Avisa app.ts que `id` ganhou um `body` novo (troca de espécie): quem decide se há um
   * flash de evolução pendente para esse id — e como aplicá-lo — é o `onEvent` em app.ts. */
  readonly onSpeciesSwap: (id: string, body: Container) => void
}

function drawHp(l: Live): void {
  const k = l.entity.hpMax > 0 ? Math.max(0, l.entity.hp / l.entity.hpMax) : 0
  const color = hpColor(l.entity.hp, l.entity.hpMax)
  l.hpBar.clear().rect(-16, -40, 32, 4).fill(0x000000).rect(-16, -40, 32 * k, 4).fill(color)
  l.label.style.fill = l.entity.targeted ? 0xffcc00 : 0xffffff
}

/** Mantém o mapa `id -> Live` sincronizado com o `HuntView`: cria, atualiza (tween/direção/HP/
 * espécie) e remove sprites e overlays. Não sabe nada de efeitos, câmera ou ticker (app.ts). */
export function createEntityLayer(deps: EntityLayerDeps): { readonly live: ReadonlyMap<string, Live>; applyView(view: HuntView, prev: Entities): Entities; dispose(): void } {
  const live = new Map<string, Live>()

  const create = (e: Entity): void => {
    const sprite = makeEntitySprite(deps.sheets, e.speciesName)
    const label = new Text({ text: `${e.speciesName} L${e.level}`, style: { fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } } })
    label.anchor.set(0.5, 1)
    label.y = -42
    const hpBar = new Graphics()
    const ov = new Container()
    ov.addChild(hpBar, label)
    deps.entities.addChild(sprite.root)
    deps.overlay.addChild(ov)
    const l: Live = { sprite, direction: 'south', overlay: ov, hpBar, label, tween: createTween({ x: e.x, y: e.y }, { x: e.x, y: e.y }, deps.now(), 0), entity: e }
    live.set(e.id, l)
    drawHp(l)
  }

  const swapSprite = (l: Live, id: string, speciesName: string): void => {
    deps.entities.removeChild(l.sprite.root)
    l.sprite.root.destroy({ children: true })
    const sprite = makeEntitySprite(deps.sheets, speciesName)
    sprite.setDirection(l.direction)
    deps.entities.addChild(sprite.root)
    l.sprite = sprite
    deps.onSpeciesSwap(id, sprite.body)
  }

  const update = (e: Entity, before: Entity): void => {
    const l = live.get(e.id)
    if (!l) return create(e)
    // Evolução/troca de Pokémon ativo: mesmo id ('player'), espécie diferente — o AnimatedSprite
    // antigo (outra animação) não pode ficar; recria mantendo tween, overlay e direção.
    if (e.speciesName !== before.speciesName) swapSprite(l, e.id, e.speciesName)
    if (e.x !== before.x || e.y !== before.y) {
      l.tween = nextTween(l.tween, { x: before.x, y: before.y }, { x: e.x, y: e.y }, deps.now())
      l.direction = directionOf({ x: before.x, y: before.y }, { x: e.x, y: e.y })
      l.sprite.setDirection(l.direction)
    }
    if (e.speciesName !== before.speciesName || e.level !== before.level) l.label.text = `${e.speciesName} L${e.level}`
    l.entity = e
    drawHp(l)
  }

  const remove = (id: string): void => {
    const l = live.get(id)
    if (!l) return
    live.delete(id)
    deps.fadeOutRemoved(l.sprite.root, l.overlay)
  }

  const apply = (op: Op): void => {
    if (op.op === 'create') create(op.entity)
    else if (op.op === 'update') update(op.entity, op.prev)
    else remove(op.id)
  }

  return {
    live,
    applyView: (view, prev) => {
      const next = entitiesOf(view)
      for (const op of reconcile(prev, next)) apply(op)
      return next
    },
    dispose: () => live.clear(),
  }
}
