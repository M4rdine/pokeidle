import { ATLAS_URL } from '../config.js'
import type { Direction } from './interpolate.js'

export interface FrameRect { readonly x: number; readonly y: number; readonly w: number; readonly h: number }
/**
 * A tabela de animação por TIPO de golpe, que viaja no `meta` do atlas de golpes.
 *
 * Ela vive junto dos quadros de propósito: quem cura os sprites escolhe o par no manifest, e o
 * cliente recebe os dois pela mesma porta. Duplicar a tabela no registro de conteúdo criaria duas
 * verdades para a mesma escolha, e uma delas envelheceria calada.
 */
export interface GolpeDeTipo { readonly type: string; readonly projetil?: number; readonly efeito?: number }

export interface SpritesheetJson {
  readonly frames: Readonly<Record<string, { readonly frame: FrameRect }>>
  readonly animations: Readonly<Record<string, readonly string[]>>
  readonly meta: {
    readonly image: string; readonly size: { readonly w: number; readonly h: number }; readonly scale: string
    readonly golpes?: readonly GolpeDeTipo[]
  }
}
export interface AtlasData { readonly pokemon: SpritesheetJson; readonly tiles: SpritesheetJson; readonly golpes: SpritesheetJson | null }

/** O que desenhar para um golpe deste tipo, ou `null` quando o atlas não trouxe a tabela. */
export const golpeDoTipo = (atlas: AtlasData, tipo: string): GolpeDeTipo | null =>
  atlas.golpes?.meta.golpes?.find((g) => g.type === tipo) ?? null


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
  const [pokemon, tiles, golpes] = await Promise.all([
    fetchJson(fetchFn, ATLAS_URL.pokemon),
    fetchJson(fetchFn, ATLAS_URL.tiles),
    /*
     * O atlas de golpes é OPCIONAL. Ele é o mais novo dos três, e uma instalação com atlas antigo
     * não pode ficar sem jogo por causa de animação: sem ele o combate volta ao desenho genérico,
     * que é o que existia antes.
     */
    fetchJson(fetchFn, ATLAS_URL.golpes).catch(() => null),
  ])
  return { pokemon, tiles, golpes }
}
