import { ATLAS_URL } from '../config.js'
import type { Direction } from './interpolate.js'

export interface FrameRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
export interface SpritesheetJson {
  readonly frames: Readonly<Record<string, { readonly frame: FrameRect }>>
  readonly animations: Readonly<Record<string, readonly string[]>>
  readonly meta: { readonly image: string; readonly size: { readonly w: number; readonly h: number }; readonly scale: string }
}
export interface AtlasData { readonly pokemon: SpritesheetJson; readonly tiles: SpritesheetJson }

export const animationKey = (species: string, direction: Direction): string => `${species}/walk_${direction}`

/** Devolve o retângulo do frame pedido, ou null se a espécie/direção/fase não existir no atlas. */
export function frameOf(atlas: AtlasData, species: string, direction: Direction, phase: number): FrameRect | null {
  const names = atlas.pokemon.animations[animationKey(species, direction)]
  const name = names?.[phase % (names.length || 1)]
  return name ? (atlas.pokemon.frames[name]?.frame ?? null) : null
}

async function fetchJson(fetchFn: typeof fetch, url: string): Promise<SpritesheetJson> {
  const res = await fetchFn(url, { credentials: 'same-origin' })
  if (!res.ok) throw new Error(`atlas não encontrado em ${url}; gere com pnpm assets build`)
  const json = (await res.json()) as SpritesheetJson
  // tiles.json não tem "animations" (só tem frames de tile); normaliza para {} em vez de undefined.
  return { ...json, animations: json.animations ?? {} }
}

export async function loadAtlas(fetchFn: typeof fetch = fetch): Promise<AtlasData> {
  const [pokemon, tiles] = await Promise.all([fetchJson(fetchFn, ATLAS_URL.pokemon), fetchJson(fetchFn, ATLAS_URL.tiles)])
  return { pokemon, tiles }
}
