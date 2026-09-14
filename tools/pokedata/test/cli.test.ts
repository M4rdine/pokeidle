import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildProgram } from '../src/cli.js'
import { fakeApi } from './fixtures/fake-api.js'

function captureStdout(): { lines: () => string } {
  const chunks: string[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk))
    return true
  })
  return { lines: () => chunks.join('') }
}

async function writeManifest(dir: string): Promise<string> {
  const path = join(dir, 'manifest.json')
  await writeFile(path, JSON.stringify({ species: [{ name: 'charmander' }, { name: 'squirtle' }] }))
  return path
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('buildProgram', () => {
  it('lê o manifest, roda o sync e reporta o resultado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-cli-'))
    const manifestPath = await writeManifest(dir)
    const outDir = join(dir, 'out')
    const cacheDir = join(dir, 'cache')
    const { api } = fakeApi(cacheDir)
    const program = buildProgram({ createApi: () => api })

    const stdout = captureStdout()
    await program.parseAsync(['node', 'pokedata', 'sync', '--manifest', manifestPath, '--out', outDir, '--cache', cacheDir])

    const species = JSON.parse(await readFile(join(outDir, 'species.json'), 'utf8'))
    expect(species).toHaveLength(2)
    expect(stdout.lines()).toMatch(/2 espécies/)
  })

  it('repassa --force para createApi', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokedata-cli-'))
    const manifestPath = await writeManifest(dir)
    const outDir = join(dir, 'out')
    const cacheDir = join(dir, 'cache')
    const { api } = fakeApi(cacheDir)
    const createApi = vi.fn().mockReturnValue(api)
    const program = buildProgram({ createApi })

    captureStdout()
    await program.parseAsync(['node', 'pokedata', 'sync', '--manifest', manifestPath, '--out', outDir, '--cache', cacheDir, '--force'])

    expect(createApi).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })
})
