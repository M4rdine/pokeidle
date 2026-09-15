import type { HuntMap } from '@pokeidle/shared'
import { Container, Rectangle, Sprite, type Renderer, type Texture } from 'pixi.js'
import { TILE_SIZE } from '../config.js'
import type { Sheets } from './sprites.js'

/** Desenha ground e detail uma vez numa textura só (width×32 × height×32). Tile sem frame no atlas fica vazio. */
export function buildMapSprite(renderer: Renderer, map: HuntMap, sheets: Sheets): Sprite {
  const layer = new Container()
  const draw = (names: readonly (string | null)[]): void => {
    names.forEach((name, i) => {
      const tex: Texture | undefined = name ? sheets.tiles.textures[name] : undefined
      if (!tex) return
      const s = new Sprite(tex)
      s.x = (i % map.width) * TILE_SIZE
      s.y = Math.floor(i / map.width) * TILE_SIZE
      layer.addChild(s)
    })
  }
  draw(map.layers.ground)
  draw(map.layers.detail)
  const frame = new Rectangle(0, 0, map.width * TILE_SIZE, map.height * TILE_SIZE)
  // resolution: 1 — o mapa já é pixel art em escala 1:1; sem isso o Pixi usa o DPR da tela (2x em
  // telas retina) e o mapa pode passar de MAX_TEXTURE_SIZE em mapas grandes.
  const texture = renderer.generateTexture({ target: layer, frame, resolution: 1 })
  layer.destroy({ children: true })
  return new Sprite(texture)
}
