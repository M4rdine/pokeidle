import { AnimatedSprite, Assets, Container, Graphics, Spritesheet, Text, type SpritesheetData, type Texture } from 'pixi.js'
import type { AtlasData } from './atlas.js'
import { animationKey } from './atlas.js'
import type { Direction } from './interpolate.js'

export interface Sheets { readonly pokemon: Spritesheet; readonly tiles: Spritesheet }

/**
 * Carrega as duas imagens do atlas e parseia os spritesheets a partir do JSON já baixado
 * (`loadAtlas`). `atlas.pokemon`/`atlas.tiles` são o mesmo shape que `SpritesheetData` do Pixi
 * (só que imutáveis); o cast abaixo é seguro porque os objetos vêm de `JSON.parse`.
 */
export async function loadSheets(atlas: AtlasData): Promise<Sheets> {
  const [pokemonTex, tilesTex] = await Promise.all([
    Assets.load<Texture>('/assets/atlas/pokemon.png'),
    Assets.load<Texture>('/assets/atlas/tiles.png'),
  ])
  const pokemon = new Spritesheet(pokemonTex, atlas.pokemon as SpritesheetData)
  const tiles = new Spritesheet(tilesTex, atlas.tiles as SpritesheetData)
  await Promise.all([pokemon.parse(), tiles.parse()])
  return { pokemon, tiles }
}

export interface EntitySprite {
  readonly root: Container
  readonly body: AnimatedSprite | Graphics
  setDirection(d: Direction): void
  setMoving(moving: boolean): void
  readonly hasFrames: boolean
}

/**
 * AnimatedSprite com as animações `walk_<direção>` da espécie, âncora no pé. Se a espécie não
 * tiver frames no atlas, cai para um marcador colorido com rótulo (nunca lança).
 */
export function makeEntitySprite(sheets: Sheets, species: string, label: string): EntitySprite {
  const root = new Container()
  const first = sheets.pokemon.animations[animationKey(species, 'south')]
  if (first && first.length > 0) {
    const body = new AnimatedSprite(first)
    body.anchor.set(0.5, 1)
    body.animationSpeed = 0.15
    body.gotoAndStop(0)
    root.addChild(body)
    let current: Direction = 'south'
    return {
      root,
      body,
      hasFrames: true,
      setDirection: (d) => {
        if (d === current) return
        current = d
        const frames = sheets.pokemon.animations[animationKey(species, d)]
        if (!frames) return
        const playing = body.playing
        body.textures = frames
        if (playing) body.play()
        else body.gotoAndStop(0)
      },
      setMoving: (moving) => {
        if (moving && !body.playing) body.play()
        if (!moving && body.playing) body.gotoAndStop(0)
      },
    }
  }
  const marker = new Graphics().rect(-12, -28, 24, 28).fill(0xaa44aa).stroke({ width: 2, color: 0xffffff })
  const text = new Text({ text: label, style: { fontSize: 10, fill: 0xffffff } })
  text.anchor.set(0.5, 1)
  text.y = -30
  root.addChild(marker, text)
  return { root, body: marker, hasFrames: false, setDirection: () => {}, setMoving: () => {} }
}
