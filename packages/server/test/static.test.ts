import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, freshApp, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })

describe('atlas público', () => {
  it('serve os 4 arquivos do atlas com o content-type certo e 404 para o resto', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    await writeFile(join(dir, 'tiles.json'), '{"frames":{}}')
    const app = await freshApp(t, undefined, { ASSETS_DIR: dir })
    const ok = await api(app).get('/assets/atlas/tiles.json')
    expect(ok.statusCode).toBe(200)
    expect(ok.headers['content-type']).toMatch(/application\/json/)
    expect((await api(app).get('/assets/atlas/pokemon.png')).statusCode).toBe(404) // permitido mas ausente
    expect((await api(app).get('/assets/atlas/..%2Fsecret.json')).statusCode).toBe(404)
    expect((await api(app).get('/assets/atlas/tiles.tsj')).statusCode).toBe(404) // fora da allowlist
    await app.close()
  })
})

describe('saúde', () => {
  it('/health responde ok com versão e tempo de atividade, sem exigir sessão', async () => {
    const r = await api(t.app).get('/health')
    expect(r.statusCode).toBe(200)
    const body = r.json() as { status: string; version: string; uptimeSeconds: number }
    expect(body.status).toBe('ok')
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0)
  })
})

describe('build do cliente', () => {
  it('sem a pasta dist, / responde 404 JSON como hoje', async () => {
    const app = await freshApp(t, undefined, { CLIENT_DIST: join(tmpdir(), 'pokeidle-nao-existe') })
    const r = await api(app).get('/')
    expect(r.statusCode).toBe(404)
    expect(r.json()).toEqual({ error: { code: 'not-found', message: 'rota não encontrada' } })
    await app.close()
  })
  it('com dist, serve index.html sem cache e chunks de /app com cache imutável; arquivo desconhecido → 404 JSON', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'pokeidle-dist-'))
    await mkdir(join(dist, 'app'))
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>Pokeidle</title>')
    await writeFile(join(dist, 'app', 'main-abc123.js'), 'export {}')
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })
    const index = await api(app).get('/')
    expect(index.statusCode).toBe(200)
    expect(index.headers['content-type']).toMatch(/text\/html/)
    expect(index.headers['cache-control']).toBe('no-cache')
    const chunk = await api(app).get('/app/main-abc123.js')
    expect(chunk.statusCode).toBe(200)
    expect(chunk.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    expect((await api(app).get('/nope.html')).json()).toMatchObject({ error: { code: 'not-found' } })
    expect(index.headers['content-security-policy']).toMatch(/img-src 'self' data: blob:/)
    await app.close()
  })
})

describe('política de conteúdo', () => {
  it('não libera inline: nem estilo, nem script, nem eval', async () => {
    const app = await freshApp(t)
    const csp = (await api(app).get('/nope')).headers['content-security-policy'] as string
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("img-src 'self' data: blob:")
    expect(csp).toContain("style-src 'self'")
    expect(csp).toContain("style-src-attr 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
    await app.close()
  })
})
