import { AnimatedSprite, Container, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js'
import { TILE_SIZE } from '../config.js'
import type { TilePlacement } from './map-parts.js'
import type { Sheets } from './sprites.js'

/**
 * Assa as posições numa textura só (width×32 × height×32). Tile sem frame no atlas fica vazio.
 * Devolve null quando não há nada a assar, que é o caso comum da copa num mapa sem árvore.
 */
export function bakePlacements(
  renderer: Renderer,
  placements: readonly TilePlacement[],
  worldSize: { readonly w: number; readonly h: number },
  sheets: Sheets,
): Sprite | null {
  if (placements.length === 0) return null
  const layer = new Container()
  for (const p of placements) {
    const tex: Texture | undefined = sheets.tiles.textures[p.name]
    if (!tex) continue
    const s = new Sprite(tex)
    s.x = p.col * TILE_SIZE
    s.y = p.row * TILE_SIZE
    layer.addChild(s)
  }
  const frame = new Rectangle(0, 0, worldSize.w, worldSize.h)
  // resolution: 1 — o mapa já é pixel art em escala 1:1; sem isso o Pixi usa o DPR da tela (2x em
  // telas retina) e o mapa pode passar de MAX_TEXTURE_SIZE em mapas grandes.
  const texture = renderer.generateTexture({ target: layer, frame, resolution: 1 })
  layer.destroy({ children: true })
  return new Sprite(texture)
}

/** Um sprite parado por posição animada; quem avança o quadro é o relógio único da cena. */
export function animatedTileLayer(
  placements: readonly TilePlacement[],
  sheets: Sheets,
): { container: Container; sprites: AnimatedSprite[] } {
  const container = new Container()
  const sprites: AnimatedSprite[] = []
  for (const p of placements) {
    const frames = sheets.tiles.animations[p.name]
    if (!frames || frames.length === 0) continue
    const sprite = new AnimatedSprite(frames)
    sprite.x = p.col * TILE_SIZE
    sprite.y = p.row * TILE_SIZE
    sprite.gotoAndStop(0)
    container.addChild(sprite)
    sprites.push(sprite)
  }
  return { container, sprites }
}
