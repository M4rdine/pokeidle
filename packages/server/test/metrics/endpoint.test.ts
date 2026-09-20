import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api, freshApp, testApp, type TestApp } from '../helpers/app.js'

let t: TestApp
beforeAll(async () => { t = await testApp() })
afterAll(async () => { await t.close() })

describe('GET /metrics', () => {
  it('sem token configurado, responde ao loopback no formato Prometheus', async () => {
    const app = await freshApp(t)
    const r = await api(app).get('/metrics')
    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toContain('text/plain')
    expect(r.body).toContain('# TYPE pokeidle_hunts_active gauge')
    expect(r.body).toContain('process_resident_memory_bytes')
    await app.close()
  })

  /**
   * Um 401 confirmaria que o endpoint existe. Para quem varre a internet procurando `/metrics`
   * aberto, a resposta certa é a mesma de uma rota que não existe.
   */
  it('sem token configurado, requisição de fora do loopback recebe 404, não 401', async () => {
    const app = await freshApp(t)
    const r = await app.inject({ method: 'GET', url: '/metrics', remoteAddress: '203.0.113.7' })
    expect(r.statusCode).toBe(404)
    expect(r.body).not.toContain('pokeidle_')
    await app.close()
  })

  it('com token configurado, exige o Bearer certo — de qualquer endereço', async () => {
    const app = await freshApp(t, undefined, { METRICS_TOKEN: 'segredo-de-metrica' })
    const remoteAddress = '203.0.113.7'

    const sem = await app.inject({ method: 'GET', url: '/metrics', remoteAddress })
    expect(sem.statusCode).toBe(401)

    const errado = await app.inject({ method: 'GET', url: '/metrics', remoteAddress, headers: { authorization: 'Bearer outro' } })
    expect(errado.statusCode).toBe(401)

    const certo = await app.inject({ method: 'GET', url: '/metrics', remoteAddress, headers: { authorization: 'Bearer segredo-de-metrica' } })
    expect(certo.statusCode).toBe(200)
    expect(certo.body).toContain('pokeidle_ticks_total')
    await app.close()
  })

  it('com token configurado, o loopback também precisa do token', async () => {
    const app = await freshApp(t, undefined, { METRICS_TOKEN: 'segredo-de-metrica' })
    expect((await api(app).get('/metrics')).statusCode).toBe(401)
    await app.close()
  })

  it('a rota registra a si mesma sem estourar a cardinalidade das séries de HTTP', async () => {
    const app = await freshApp(t)
    await api(app).get('/metrics')
    const r = await api(app).get('/metrics')
    // Uma série por rota, não uma por requisição.
    const linhas = r.body.split('\n').filter((l) => l.startsWith('pokeidle_http_requests_total{'))
    const rotas = new Set(linhas.map((l) => /route="([^"]*)"/.exec(l)?.[1]))
    expect(rotas.size).toBeLessThanOrEqual(2)
    await app.close()
  })
})

describe('cardinalidade das métricas de HTTP', () => {
  it('duas áreas diferentes produzem uma série só, com o padrão da rota', async () => {
    const app = await freshApp(t)
    const { cookie } = await (await import('../helpers/app.js')).registerAndLogin(app)
    await api(app, cookie).post('/trainer/starter', { species: 'charmander' })
    await api(app, cookie).post('/hunts/campo-inicial/start')
    await api(app, cookie).post('/hunts/gruta-umida/start')

    const texto = (await api(app).get('/metrics')).body
    const series = texto.split('\n').filter((l) => l.startsWith('pokeidle_http_requests_total{') && l.includes('/hunts/'))
    const rotas = new Set(series.map((l) => /route="([^"]*)"/.exec(l)?.[1]))
    expect([...rotas]).toEqual(['/hunts/:id/start'])
    await app.close()
  })
})
