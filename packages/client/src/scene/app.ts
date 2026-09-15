import { typeMultiplier, type HuntMap, type Registry } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
import { Application, Container, Graphics, Text } from 'pixi.js'
import { TICK_MS, TILE_SIZE } from '../config.js'
import { activePokemon, type HuntView } from '../state/hunt-view.js'
import type { AtlasData } from './atlas.js'
import { cameraStep, type Camera } from './camera.js'
import { createEffectRunner, fadeOut, flash, floatingText, lunge, ring, shake } from './effects.js'
import { createTween, directionOf, isDone, positionAt, retarget, type Tween } from './interpolate.js'
import { buildMapSprite } from './map-layer.js'
import { entitiesOf, reconcile, type Entities, type Entity, type Op } from './reconcile.js'
import { loadSheets, makeEntitySprite, type EntitySprite } from './sprites.js'

export interface SceneDeps { readonly atlas: AtlasData; readonly map: HuntMap; readonly registry: Registry; readonly now: () => number }
export interface Scene {
  applyView(view: HuntView): void
  onEvent(event: Event, view: HuntView): void
  setZoom(z: 1 | 2): void
  zoom(): 1 | 2
  resize(): void
  destroy(): void
}
interface Live { readonly sprite: EntitySprite; readonly overlay: Container; readonly hpBar: Graphics; readonly label: Text; tween: Tween; entity: Entity }

const px = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2

function drawHp(l: Live): void {
  const k = l.entity.hpMax > 0 ? Math.max(0, l.entity.hp / l.entity.hpMax) : 0
  const color = k > 0.5 ? 0x44dd66 : k > 0.25 ? 0xffcc00 : 0xdd4444
  l.hpBar.clear().rect(-16, -40, 32, 4).fill(0x000000).rect(-16, -40, 32 * k, 4).fill(color)
  l.label.style.fill = l.entity.targeted ? 0xffcc00 : 0xffffff
}

/** Cria a cena PixiJS: mapa numa textura, sprites do atlas, tween por tick, câmera e efeitos. Só a Task 9 chama isto. */
export async function createScene(parent: HTMLElement, deps: SceneDeps): Promise<Scene> {
  const app = new Application()
  await app.init({ background: 0x101418, resizeTo: parent, resolution: window.devicePixelRatio || 1, autoDensity: true, antialias: false })
  app.canvas.style.imageRendering = 'pixelated'
  parent.appendChild(app.canvas)

  const sheets = await loadSheets(deps.atlas)
  const world = new Container()
  const mapLayer = buildMapSprite(app.renderer, deps.map, sheets)
  const entities = new Container()
  entities.sortableChildren = true
  const overlay = new Container()
  world.addChild(mapLayer, entities, overlay)
  app.stage.addChild(world)

  const effects = createEffectRunner(app.ticker)
  const live = new Map<string, Live>()
  let prev: Entities = {}
  let cam: Camera = { x: 0, y: 0 }
  let zoom: 1 | 2 = 1
  const worldSize = { w: deps.map.width * TILE_SIZE, h: deps.map.height * TILE_SIZE }

  const create = (e: Entity): void => {
    const sprite = makeEntitySprite(sheets, e.speciesName, e.speciesName)
    const label = new Text({ text: `${e.speciesName} L${e.level}`, style: { fontSize: 10, fill: 0xffffff, stroke: { color: 0x000000, width: 2 } } })
    label.anchor.set(0.5, 1)
    label.y = -42
    const hpBar = new Graphics()
    const ov = new Container()
    ov.addChild(hpBar, label)
    entities.addChild(sprite.root)
    overlay.addChild(ov)
    const l: Live = { sprite, overlay: ov, hpBar, label, tween: createTween({ x: e.x, y: e.y }, { x: e.x, y: e.y }, deps.now(), 0), entity: e }
    live.set(e.id, l)
    drawHp(l)
  }
  const update = (e: Entity, before: Entity): void => {
    const l = live.get(e.id)
    if (!l) return create(e)
    if (e.x !== before.x || e.y !== before.y) {
      l.tween = isDone(l.tween, deps.now())
        ? createTween({ x: before.x, y: before.y }, { x: e.x, y: e.y }, deps.now(), TICK_MS)
        : retarget(l.tween, { x: e.x, y: e.y }, deps.now())
      l.sprite.setDirection(directionOf({ x: before.x, y: before.y }, { x: e.x, y: e.y }))
    }
    if (e.speciesName !== before.speciesName || e.level !== before.level) l.label.text = `${e.speciesName} L${e.level}`
    l.entity = e
    drawHp(l)
  }
  const remove = (id: string): void => {
    const l = live.get(id)
    if (!l) return
    live.delete(id)
    effects.add(fadeOut(l.sprite.root, 300, () => { l.sprite.root.destroy({ children: true }); l.overlay.destroy({ children: true }) }))
  }
  const apply = (op: Op): void => {
    if (op.op === 'create') create(op.entity)
    else if (op.op === 'update') update(op.entity, op.prev)
    else remove(op.id)
  }

  app.ticker.add(() => {
    const now = deps.now()
    for (const l of live.values()) {
      const p = positionAt(l.tween, now)
      l.sprite.root.x = px(p.x)
      l.sprite.root.y = px(p.y) + TILE_SIZE / 2
      l.sprite.root.zIndex = l.sprite.root.y
      l.overlay.x = l.sprite.root.x
      l.overlay.y = l.sprite.root.y
      l.sprite.setMoving(!isDone(l.tween, now))
    }
    const player = live.get('player')
    const target = player ? { x: player.sprite.root.x, y: player.sprite.root.y } : { x: worldSize.w / 2, y: worldSize.h / 2 }
    cam = cameraStep(cam, target, { w: app.screen.width, h: app.screen.height }, worldSize, zoom)
    world.scale.set(zoom)
    world.x = -cam.x * zoom
    world.y = -cam.y * zoom
  })

  const spriteOf = (id: string): Container | undefined => live.get(id)?.sprite.root

  const onAttack = (e: Extract<Event, { type: 'attack' }>, view: HuntView): void => {
    const player = spriteOf('player')
    const attacker = e.attacker === 'player' ? player : spriteOf(`wild:${e.attackerId}`)
    const target = e.attacker === 'player' ? spriteOf(`wild:${e.targetId}`) : player
    if (!attacker || !target) return
    const dx = Math.sign(target.x - attacker.x)
    const dy = Math.sign(target.y - attacker.y)
    effects.add(lunge(attacker, dx, dy))
    effects.add(flash(target))
    if (e.attacker === 'wild') effects.add(shake(target))
    const move = deps.registry.moves.get(e.move)
    const defender = e.attacker === 'player' ? view.state?.wilds.find((w) => String(w.id) === e.targetId) : activePokemon(view)
    const types = defender ? (deps.registry.species.get(defender.speciesName)?.types ?? []) : []
    const mult = move && types.length > 0 ? typeMultiplier(deps.registry.typeChart, move.type, types) : 1
    const color = mult > 1 ? 0xff8800 : mult < 1 ? 0x999999 : 0xffffff
    const size = mult > 1 ? 16 : 12
    effects.add(floatingText(overlay, target.x, target.y - 36, String(e.damage), color, size))
  }

  const onEvent = (e: Event, view: HuntView): void => {
    const player = spriteOf('player')
    switch (e.type) {
      case 'attack': return onAttack(e, view)
      case 'wildDefeated': {
        if (player) effects.add(floatingText(overlay, player.x, player.y - 40, `+${e.xpPokemon} XP`, 0xffdd44))
        return
      }
      case 'captured': {
        const t = spriteOf(`wild:${e.wildId}`)
        if (t) effects.add(ring(overlay, t.x, t.y, 0xffffff, 400))
        return
      }
      case 'captureFailed': {
        const t = spriteOf(`wild:${e.wildId}`)
        if (t) effects.add(floatingText(overlay, t.x, t.y - 30, '○', 0xffffff, 14))
        return
      }
      case 'levelUp': {
        if (player) effects.add(ring(overlay, player.x, player.y, 0xffcc00, 600))
        return
      }
      case 'evolved': {
        if (player) effects.add(flash(player, 0xffffff, 400))
        return
      }
      case 'itemUsed': {
        if (player) effects.add(ring(overlay, player.x, player.y, 0x44dd66, 300, 12))
        return
      }
      case 'healed': {
        if (player) effects.add(ring(overlay, player.x, player.y, 0x44dd66, 500))
        return
      }
      default:
        return
    }
  }

  return {
    applyView: (view) => {
      const next = entitiesOf(view)
      for (const op of reconcile(prev, next)) apply(op)
      prev = next
    },
    onEvent,
    setZoom: (z) => { zoom = z },
    zoom: () => zoom,
    resize: () => app.resize(),
    destroy: () => { effects.destroy(); app.destroy(true, { children: true }); live.clear(); prev = {} },
  }
}
