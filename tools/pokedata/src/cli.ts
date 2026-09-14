import { readFile } from 'node:fs/promises'
import { Command } from 'commander'
import { z } from 'zod'
import { parseOrThrow } from '@pokeidle/shared'
import type { PokeApi } from './pokeapi.js'
import { sync } from './sync.js'

const out = (line: string): void => void process.stdout.write(`${line}\n`)

const ManifestNamesSchema = z.object({ species: z.array(z.object({ name: z.string().regex(/^[a-z0-9-]+$/) })) })

export interface CliDeps {
  readonly createApi: (opts: { cacheDir: string; force: boolean }) => PokeApi
}

export function buildProgram(deps: CliDeps): Command {
  const program = new Command().name('pokedata').description('Gera os dados oficiais do Pokeidle a partir do PokeAPI')
  program
    .command('sync')
    .option('--force', 'ignora o cache em disco', false)
    .option('--manifest <file>', 'manifest com as espécies', 'tools/assets/manifest.json')
    .option('--out <dir>', 'pasta de saída', 'packages/shared/data')
    .option('--cache <dir>', 'cache das respostas', 'tools/pokedata/.cache')
    .action(async (opts: { force: boolean; manifest: string; out: string; cache: string }) => {
      const manifest = parseOrThrow(ManifestNamesSchema, JSON.parse(await readFile(opts.manifest, 'utf8')), 'manifest')
      const api = deps.createApi({ cacheDir: opts.cache, force: opts.force })
      const result = await sync({ api, speciesNames: manifest.species.map((s) => s.name), outDir: opts.out, warn: (m) => out(`aviso: ${m}`) })
      out(`${result.species} espécies e ${result.moves} golpes gravados em ${opts.out}`)
    })
  return program
}
