import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, freshApp, testApp, type TestApp } from './helpers/app.js'

let t: TestApp
let on: FastifyInstance
let off: FastifyInstance
let assetsDir: string
beforeAll(async () => {
  t = await testApp()
  assetsDir = await mkdtemp(path.join(tmpdir(), 'pokeidle-atlas-'))
  await writeFile(path.join(assetsDir, 'tiles.json'), JSON.stringify({ frames: { grass: { frame: { x: 0, y: 0, w: 32, h: 32 } } }, meta: { image: 'tiles.png' } }))
  await writeFile(path.join(assetsDir, 'secret.txt'), 'x')
  on = await freshApp(t, undefined, { DEBUG_VIEWER: 'true', ASSETS_DIR: assetsDir })
  off = await freshApp(t, undefined, { DEBUG_VIEWER: 'false' })
})
afterAll(async () => { await on.close(); await off.close(); await t.close() })

describe('DEBUG_VIEWER desligado', () => {
  it('nenhuma rota /debug existe', async () => {
    for (const url of ['/debug/', '/debug/viewer.js', '/debug/map/route-1', '/debug/atlas/tiles.json']) expect((await api(off).get(url)).statusCode, url).toBe(404)
  })
})

describe('DEBUG_VIEWER ligado', () => {
  it('serve a página, o script e o css com os tipos certos e o CSP do helmet', async () => {
    const html = await api(on).get('/debug/')
    expect(html.statusCode).toBe(200)
    expect(String(html.headers['content-type'])).toMatch(/text\/html/)
    expect(html.body).toContain('<canvas')
    expect(html.body).toContain('viewer.js')
    expect(String(html.headers['content-security-policy'])).toContain("default-src 'self'")
    const js = await api(on).get('/debug/viewer.js')
    expect(js.statusCode).toBe(200)
    expect(String(js.headers['content-type'])).toMatch(/javascript/)
    expect(String((await api(on).get('/debug/viewer.css')).headers['content-type'])).toMatch(/text\/css/)
  })
  it('mapa do registro e 404 para desconhecido', async () => {
    const r = await api(on).get('/debug/map/route-1')
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ id: 'route-1', width: 40, height: 30, tileSize: 32 })
    expect((await api(on).get('/debug/map/nope')).statusCode).toBe(404)
  })
  it('atlas só da allowlist e só o que existe; sem path traversal', async () => {
    const ok = await api(on).get('/debug/atlas/tiles.json')
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toMatchObject({ frames: { grass: expect.anything() } })
    expect((await api(on).get('/debug/atlas/tiles.png')).statusCode).toBe(404) // não existe no dir de teste
    expect((await api(on).get('/debug/atlas/secret.txt')).statusCode).toBe(404)
    expect((await api(on).get('/debug/atlas/..%2Fsecret.txt')).statusCode).toBe(404)
  })
})
