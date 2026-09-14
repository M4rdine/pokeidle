import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface PokeApi { readonly get: <T>(path: string) => Promise<T> }

export interface PokeApiOptions {
  readonly baseUrl?: string
  readonly cacheDir: string
  readonly force?: boolean
  readonly fetchJson?: (url: string) => Promise<unknown>
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PokeAPI ${res.status} em ${url}`)
  return res.json()
}

export function createPokeApi(opts: PokeApiOptions): PokeApi {
  const baseUrl = opts.baseUrl ?? 'https://pokeapi.co/api/v2/'
  const fetchJson = opts.fetchJson ?? defaultFetchJson
  const get = async <T>(path: string): Promise<T> => {
    const file = join(opts.cacheDir, `${path.replace(/\//g, '_')}.json`)
    if (!opts.force) {
      try { return JSON.parse(await readFile(file, 'utf8')) as T } catch { /* sem cache */ }
    }
    const data = await fetchJson(`${baseUrl}${path}`)
    await mkdir(opts.cacheDir, { recursive: true })
    await writeFile(file, JSON.stringify(data))
    return data as T
  }
  return { get }
}
