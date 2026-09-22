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

describe('revalidação dos assets', () => {
  /*
   * O atlas é o arquivo mais pesado que o jogo serve (240 KB só o `pokemon.json`) e o
   * `max-age=3600` significa que, uma hora depois, TODO jogador que volta baixa tudo de novo —
   * inclusive quando nada mudou, porque sem ETag o navegador não tem como perguntar.
   *
   * Com ETag a pergunta fica barata: 304 sem corpo. E o servidor não lê o arquivo do disco para
   * responder, que é o que faz diferença quando o pedido vem de muita gente ao mesmo tempo.
   */
  it('o atlas responde com ETag, e o mesmo ETag de volta vira 304 sem corpo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    await writeFile(join(dir, 'tiles.json'), '{"frames":{}}')
    const app = await freshApp(t, undefined, { ASSETS_DIR: dir })

    const primeira = await api(app).get('/assets/atlas/tiles.json')
    expect(primeira.statusCode).toBe(200)
    const etag = primeira.headers['etag']
    expect(etag).toMatch(/^"[a-f0-9]+"$/)

    const segunda = await api(app).get('/assets/atlas/tiles.json', { 'if-none-match': etag as string })
    expect(segunda.statusCode).toBe(304)
    expect(segunda.body).toBe('')
    expect(segunda.headers['etag']).toBe(etag)
    await app.close()
  })

  it('o ETag muda quando o arquivo muda — senão o cache serviria conteúdo velho para sempre', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    await writeFile(join(dir, 'tiles.json'), '{"frames":{}}')
    const app = await freshApp(t, undefined, { ASSETS_DIR: dir })
    const antes = (await api(app).get('/assets/atlas/tiles.json')).headers['etag']

    await writeFile(join(dir, 'tiles.json'), '{"frames":{"grass":{}}}')
    const depois = await api(app).get('/assets/atlas/tiles.json', { 'if-none-match': antes as string })

    expect(depois.statusCode).toBe(200)
    expect(depois.headers['etag']).not.toBe(antes)
    expect(depois.body).toContain('grass')
    await app.close()
  })

  it('o mapa da região também revalida: é PNG, e PNG não muda entre builds', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-maps-'))
    await writeFile(join(dir, 'kanto.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const app = await freshApp(t, undefined, { MAPS_DIR: dir })

    const etag = (await api(app).get('/assets/maps/kanto.png')).headers['etag']
    const r = await api(app).get('/assets/maps/kanto.png', { 'if-none-match': etag as string })

    expect(r.statusCode).toBe(304)
    await app.close()
  })

  it('ETag de outro arquivo não vale: cada um responde pelo seu conteúdo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-atlas-'))
    await writeFile(join(dir, 'tiles.json'), '{"a":1}')
    await writeFile(join(dir, 'pokemon.json'), '{"b":2}')
    const app = await freshApp(t, undefined, { ASSETS_DIR: dir })

    const etagTiles = (await api(app).get('/assets/atlas/tiles.json')).headers['etag']
    const r = await api(app).get('/assets/atlas/pokemon.json', { 'if-none-match': etagTiles as string })

    expect(r.statusCode).toBe(200)
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

describe('arquivo com hash criado depois do boot', () => {
  it('serve o que apareceu em /app enquanto o servidor estava no ar', async () => {
    // `wildcard: false` faz o @fastify/static varrer a pasta no registro e criar uma rota por
    // arquivo. Um build com o servidor rodando gera nomes com hash novos, que não existiam
    // naquela varredura — e a página abria em branco com 404 em JSON no lugar do CSS.
    const dist = await mkdtemp(join(tmpdir(), 'pokeidle-dist-'))
    await mkdir(join(dist, 'app'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>t</title>')
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })

    await writeFile(join(dist, 'app', 'index-DEPOIS.css'), 'body{color:red}')
    const r = await api(app).get('/app/index-DEPOIS.css')

    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/text\/css/)
    expect(r.body).toContain('color:red')
    await app.close()
  })

  it('não serve nada de fora da pasta do build', async () => {
    // A ameaça é escapar da `CLIENT_DIST`, não alcançar outro arquivo dentro dela: tudo que está
    // na pasta do build é público por definição. O segredo mora um nível acima, onde ninguém
    // deveria chegar.
    const base = await mkdtemp(join(tmpdir(), 'pokeidle-base-'))
    const dist = join(base, 'dist')
    await mkdir(join(dist, 'app'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>t</title>')
    await writeFile(join(base, 'segredo.txt'), 'nao vazar')
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })

    for (const caminho of ['/app/..%2F..%2Fsegredo.txt', '/app/%2e%2e/%2e%2e/segredo.txt', '/app/sub/../../../segredo.txt']) {
      const r = await api(app).get(caminho)
      expect(r.body, caminho).not.toContain('nao vazar')
    }
    await app.close()
  })

  it('serve a arte-chave em .webp', async () => {
    // A arte da entrada é o único `.webp` do build, e ela entra por CSS: se o tipo sair da lista,
    // o navegador recebe 404 em JSON, não reclama, e a primeira tela do jogo simplesmente volta
    // a ser um retângulo liso — a falha não aparece em lugar nenhum a não ser na tela.
    const dist = await mkdtemp(join(tmpdir(), 'pokeidle-dist-'))
    await mkdir(join(dist, 'app'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>t</title>')
    await writeFile(join(dist, 'app', 'entrada-abc123.webp'), Buffer.from('RIFF____WEBP'))
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })

    const r = await api(app).get('/app/entrada-abc123.webp')

    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/image\/webp/)
    await app.close()
  })

  it('arquivo que não existe em /app continua 404, e não index.html', async () => {
    const dist = await mkdtemp(join(tmpdir(), 'pokeidle-dist-'))
    await mkdir(join(dist, 'app'), { recursive: true })
    await writeFile(join(dist, 'index.html'), '<!doctype html><title>t</title>')
    const app = await freshApp(t, undefined, { CLIENT_DIST: dist })
    const r = await api(app).get('/app/nao-existe.js')
    expect(r.statusCode).toBe(404)
    await app.close()
  })
})

describe('mapa das regiões', () => {
  it('serve o PNG da região com o content-type certo', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-maps-'))
    await writeFile(join(dir, 'kanto.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const app = await freshApp(t, undefined, { MAPS_DIR: dir })

    const r = await api(app).get('/assets/maps/kanto.png')

    expect(r.statusCode).toBe(200)
    expect(r.headers['content-type']).toMatch(/image\/png/)
    await app.close()
  })

  it('não deixa sair da pasta de mapas, e só serve PNG', async () => {
    const base = await mkdtemp(join(tmpdir(), 'pokeidle-maps-'))
    const dir = join(base, 'maps')
    await mkdir(dir, { recursive: true })
    await writeFile(join(base, 'segredo.txt'), 'nao vazar')
    const app = await freshApp(t, undefined, { MAPS_DIR: dir })

    for (const caminho of ['/assets/maps/..%2Fsegredo.txt', '/assets/maps/%2e%2e/segredo.txt']) {
      const r = await api(app).get(caminho)
      expect(r.body, caminho).not.toContain('nao vazar')
    }
    // Extensão fora da lista não é servida, nem que o arquivo exista.
    await writeFile(join(dir, 'kanto.svg'), '<svg/>')
    expect((await api(app).get('/assets/maps/kanto.svg')).statusCode).toBe(404)
    await app.close()
  })

  it('região sem mapa gerado responde 404 com recado útil', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pokeidle-maps-'))
    const app = await freshApp(t, undefined, { MAPS_DIR: dir })
    const r = await api(app).get('/assets/maps/nao-existe.png')
    expect(r.statusCode).toBe(404)
    expect(r.body).toMatch(/region-preview/)
    await app.close()
  })
})
