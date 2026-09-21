import { typeMultiplier, type HuntMap, type ContentRegistry } from '@pokeidle/shared'
import type { Event } from '@pokeidle/shared/protocol'
// A CSP do servidor (default-src 'self') proíbe unsafe-eval; este módulo troca os geradores de
// código do Pixi por implementações equivalentes sem `new Function`.
import 'pixi.js/unsafe-eval'
import { Application, Container } from 'pixi.js'
import { TILE_ANIMATION_MS, TILE_SIZE } from '../config.js'
import { activePokemon, type HuntView } from '../state/hunt-view.js'
import type { AtlasData } from './atlas.js'
import { cameraStep, type Camera } from './camera.js'
import { createEffectRunner, fadeOut, floatingText, lunge, ring, shake } from './effects.js'
import { createEntityLayer } from './entities.js'
import { isDone, positionAt } from './interpolate.js'
import { animatedTileLayer, bakePlacements } from './map-layer.js'
import { splitLayer } from './map-parts.js'
import { type Entities } from './reconcile.js'
import { loadSheets } from './sprites.js'

export interface SceneDeps {
  readonly atlas: AtlasData
  readonly map: HuntMap
  readonly registry: ContentRegistry
  readonly now: () => number
  /** Só para teste/injeção; o padrão (aba em segundo plano) já é o que a Task 9 precisa. */
  readonly isHidden?: () => boolean
}
export interface Scene {
  applyView(view: HuntView): void
  onEvent(event: Event, view: HuntView): void
  setZoom(z: 1 | 2): void
  zoom(): 1 | 2
  resize(): void
  destroy(): void
}

const px = (tile: number): number => tile * TILE_SIZE + TILE_SIZE / 2
// Janela para o flash de evolução "esperar" o swap de sprite (Task 9 chama onEvent antes de
// applyView, então o body novo ainda não existe quando o evento 'evolved' chega).
const PENDING_EVOLVE_FLASH_MS = 1000

/**
 * Cor de fundo da página, lida do token, com o mesmo valor repetido aqui para o caso de o CSS não
 * ter chegado (teste com DOM falso, folha ainda carregando): a tarja some do mesmo jeito.
 *
 * O NOME DO TOKEN É `--fundo`. Estava `--fora`, que nunca existiu em `tokens.css`, então
 * `getComputedStyle` devolvia string vazia e a função caía SEMPRE no padrão — que era `0x15110e`,
 * um MARROM da paleta de madeira aposentada duas trocas de mundo atrás. O comentário em cima dele
 * dizia, com todas as letras, que a cor saía do token justamente para isso não acontecer.
 *
 * Ninguém veria: as duas cores são escuras, a tarja só aparece quando o mundo é menor que o
 * painel, e tarja escura continua parecendo tarja escura. É por isso que existe o teste que
 * confere se o token que este arquivo lê está declarado.
 */
const FUNDO_PADRAO = 0x0b0f1a
export const TOKEN_DO_FUNDO = '--fundo'
function corDaMesa(parent: HTMLElement): number {
  const declarado = getComputedStyle(parent).getPropertyValue(TOKEN_DO_FUNDO).trim()
  const hex = /^#([0-9a-f]{6})$/i.exec(declarado)
  return hex === null ? FUNDO_PADRAO : Number.parseInt(hex[1]!, 16)
}

/** Cria a cena PixiJS: mapa numa textura, sprites do atlas, tween por tick, câmera e efeitos. Só a Task 9 chama isto. */
export async function createScene(parent: HTMLElement, deps: SceneDeps): Promise<Scene> {
  const isHidden = deps.isHidden ?? (() => document.hidden)
  const app = new Application()
  // A tarja que sobra quando o mundo é menor que o painel tem que sumir contra o fundo da página,
  // não virar um terceiro plano. A cor SAI DO TOKEN em vez de ser escrita aqui: já foi um
  // `0x0f0f14` fixo que citava, em comentário, um token removido havia dois temas — e ninguém vê
  // uma tarja escura continuar escura.
  await app.init({ background: corDaMesa(parent), resizeTo: parent, resolution: window.devicePixelRatio || 1, autoDensity: true, antialias: false, roundPixels: true })
  app.canvas.style.imageRendering = 'pixelated'
  parent.appendChild(app.canvas)

  const sheets = await loadSheets(deps.atlas)
  const world = new Container()
  const worldSize = { w: deps.map.width * TILE_SIZE, h: deps.map.height * TILE_SIZE }
  const anims = deps.atlas.tiles.animations
  const ground = splitLayer(deps.map.layers.ground, deps.map.width, anims)
  const detail = splitLayer(deps.map.layers.detail, deps.map.width, anims)
  const canopy = splitLayer(deps.map.layers.canopy ?? [], deps.map.width, anims)
  const mapLayer = bakePlacements(app.renderer, [...ground.baked, ...detail.baked], worldSize, sheets)
  const animatedGround = animatedTileLayer([...ground.animated, ...detail.animated], sheets)
  const canopyLayer = bakePlacements(app.renderer, canopy.baked, worldSize, sheets)
  const animatedCanopy = animatedTileLayer(canopy.animated, sheets)
  const animatedTiles = [...animatedGround.sprites, ...animatedCanopy.sprites]
  const entities = new Container()
  entities.sortableChildren = true
  const overlay = new Container()
  // De baixo para cima: chão assado, chão animado, personagens, copa assada, copa animada e o
  // overlay de barra de vida e rótulo, que fica acima de tudo para o jogador não sumir na mata.
  if (mapLayer) world.addChild(mapLayer)
  world.addChild(animatedGround.container, entities)
  if (canopyLayer) world.addChild(canopyLayer)
  world.addChild(animatedCanopy.container, overlay)
  app.stage.addChild(world)

  const effects = createEffectRunner(app.ticker)
  // Body e overlay (barra de HP + rótulo) somem juntos; só um dos dois destrói ambos no fim.
  const fadeOutRemoved = (root: Container, ov: Container): void => {
    effects.add(fadeOut(root, 300))
    effects.add(fadeOut(ov, 300, () => { root.destroy({ children: true }); ov.destroy({ children: true }) }))
  }
  // id -> prazo (deps.now()) do flash de evolução pendente; consumido em onSpeciesSwap.
  const pendingEvoFlash = new Map<string, number>()
  const onSpeciesSwap = (id: string, body: Container): void => {
    const expiresAt = pendingEvoFlash.get(id)
    if (expiresAt === undefined) return
    pendingEvoFlash.delete(id)
    if (deps.now() <= expiresAt) effects.flash(body, 400)
  }
  const entityLayer = createEntityLayer({ sheets, entities, overlay, now: deps.now, fadeOutRemoved, onSpeciesSwap })

  let prev: Entities = {}
  let cam: Camera = { x: 0, y: 0 }
  let firstCameraTick = true
  let zoom: 1 | 2 = 1

  app.ticker.add(() => {
    const now = deps.now()
    // Relógio único: todos os tiles animados trocam de quadro no mesmo instante.
    const tileFrame = Math.floor(now / TILE_ANIMATION_MS)
    for (const sprite of animatedTiles) sprite.gotoAndStop(tileFrame % sprite.totalFrames)
    for (const l of entityLayer.live.values()) {
      const p = positionAt(l.tween, now)
      l.sprite.root.x = px(p.x)
      l.sprite.root.y = px(p.y) + TILE_SIZE / 2
      l.sprite.root.zIndex = l.sprite.root.y
      l.overlay.x = l.sprite.root.x
      l.overlay.y = l.sprite.root.y
      l.sprite.setMoving(!isDone(l.tween, now))
    }
    const player = entityLayer.live.get('player')
    const target = player ? { x: player.sprite.root.x, y: player.sprite.root.y } : { x: worldSize.w / 2, y: worldSize.h / 2 }
    // Só consome o "primeiro tick" quando o jogador já existe: sem isso, se o ticker rodar antes
    // do primeiro applyView, a câmera snapa no centro do mapa e depois faz panorâmica até o
    // jogador assim que ele aparecer — o oposto do que este snap deveria evitar.
    cam = cameraStep(cam, target, { w: app.screen.width, h: app.screen.height }, worldSize, zoom, firstCameraTick && player ? 1 : undefined)
    if (player) firstCameraTick = false
    world.scale.set(zoom)
    world.x = -cam.x * zoom
    world.y = -cam.y * zoom
  })

  const spriteOf = (id: string): Container | undefined => entityLayer.live.get(id)?.sprite.root

  const onAttack = (e: Extract<Event, { type: 'attack' }>, view: HuntView): void => {
    const attackerLive = e.attacker === 'player' ? entityLayer.live.get('player') : entityLayer.live.get(`wild:${e.attackerId}`)
    const targetLive = e.attacker === 'player' ? entityLayer.live.get(`wild:${e.targetId}`) : entityLayer.live.get('player')
    if (!attackerLive || !targetLive) return
    const attackerRoot = attackerLive.sprite.root
    const targetRoot = targetLive.sprite.root
    const dx = Math.sign(targetRoot.x - attackerRoot.x)
    const dy = Math.sign(targetRoot.y - attackerRoot.y)
    effects.add(lunge(attackerLive.sprite.body, dx, dy))
    effects.flash(targetLive.sprite.body)
    if (e.attacker === 'wild') effects.add(shake(targetLive.sprite.body))
    const move = deps.registry.moves.get(e.move)
    const defender = e.attacker === 'player' ? view.state?.wilds.find((w) => String(w.id) === e.targetId) : activePokemon(view)
    const types = defender ? (deps.registry.species.get(defender.speciesName)?.types ?? []) : []
    const mult = move && types.length > 0 ? typeMultiplier(deps.registry.typeChart, move.type, types) : 1
    const color = mult > 1 ? 0xff8800 : mult < 1 ? 0x999999 : 0xffffff
    const size = mult > 1 ? 16 : 12
    effects.add(floatingText(overlay, targetRoot.x, targetRoot.y - 36, String(e.damage), color, size))
  }

  const onEvent = (e: Event, view: HuntView): void => {
    if (isHidden()) return
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
        // O body novo só existe depois do próximo applyView (Task 9 chama onEvent antes);
        // onSpeciesSwap consome esta marca quando o swap acontecer (ou ela expira em 1 s).
        pendingEvoFlash.set('player', deps.now() + PENDING_EVOLVE_FLASH_MS)
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
    applyView: (view) => { prev = entityLayer.applyView(view, prev) },
    onEvent,
    setZoom: (z) => { zoom = z },
    zoom: () => zoom,
    resize: () => app.resize(),
    destroy: () => {
      effects.destroy()
      // A textura do mapa é gerada só para esta cena (nunca fica em cache do Assets): pode
      // destruir tudo. Os spritesheets destroem só as sub-texturas de frame (destroyBase=false)
      // — a imagem base do atlas fica em cache do Assets para a próxima cena reusar.
      mapLayer?.texture.destroy(true)
      canopyLayer?.texture.destroy(true)
      sheets.pokemon.destroy(false)
      sheets.tiles.destroy(false)
      app.destroy(true, { children: true })
      entityLayer.dispose()
      prev = {}
    },
  }
}
