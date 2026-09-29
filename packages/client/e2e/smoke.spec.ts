import { expect, test } from '@playwright/test'

test('registrar, inicial, Campo Inicial, derrota, mochila, parar e comprar na loja', async ({ page }) => {
  const email = `smoke-${Date.now()}@test.dev`
  /*
   * O ATLAS DE GOLPES FALHA CALADO: ele é opcional, e `loadSheets` engole o erro para que uma
   * instalação com atlas velho continue jogável. O preço é que um 404 nele não reprova nada — o
   * combate volta ao pontinho genérico e ninguém fica sabendo.
   *
   * Agora a imagem do atlas é pedida pelo hash do conteúdo (`tiles.png?v=…`), e é aqui, em Chromium
   * de verdade, que se descobre se o servidor responde a essa URL. Um teste de unidade com DOM
   * simulado não sabe disso: o parser dele é mais permissivo, e não há servidor do outro lado.
   */
  const atlas: string[] = []
  page.on('response', (r) => {
    const u = new URL(r.url())
    if (u.pathname.includes('/assets/atlas/')) atlas.push(`${r.status()} ${u.pathname}${u.search}`)
  })
  await page.goto('/')

  await page.getByRole('button', { name: 'Registrar' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByLabel('Nome').fill(`Smoke${Date.now() % 100000}`)
  await page.getByRole('button', { name: 'Criar conta' }).click()

  /*
   * PRAZO EXPLÍCITO, como nos outros passos que esperam o banco.
   *
   * Este era o único que ficava nos 5 s padrão do Playwright, e é logo depois do hash da senha mais
   * o insert do treinador — o trecho mais caro do fluxo. Em máquina carregada o pedido ainda estava
   * em voo (o botão "Criar conta" aparecia desabilitado) quando o prazo virava, e o smoke reprovava
   * no registro sem nada a ver com o que ele existe para guardar.
   */
  await expect(page.getByText('Escolha seu inicial')).toBeVisible({ timeout: 30_000 })
  // Escolher e confirmar, em dois passos: o cartão seleciona e o botão único embaixo efetiva. Era
  // um "Escolher" por cartão, e aquele clique decidia o jogo inteiro sem passo nenhum no meio.
  await page.locator('.starter-card[data-species=charmander]').click()
  await page.getByRole('button', { name: 'Começar com Charmander' }).click()

  // Idem: escolher o inicial grava o Pokémon e o time antes desta tela existir.
  await expect(page.getByRole('heading', { name: 'Onde caçar' })).toBeVisible({ timeout: 30_000 })
  // Escolher é: apontar a área no mapa, e então apertar o botão que aparece no analisador.
  await page.locator('.mapa-marcador:not(.mapa-marcador-travado)').first().click()
  await page.locator('.mapa-analise').getByRole('button', { name: 'Caçar aqui' }).click()

  await expect(page.locator('#scene canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.log-line', { hasText: 'derrotado' }).first()).toBeVisible({ timeout: 120_000 })

  /*
   * DEPOIS DA PRIMEIRA DERROTA, e não quando o canvas aparece: medido, naquele instante só quatro
   * pedidos haviam chegado (os três JSON e `pokemon.png`) — o canvas existe antes de `loadSheets`
   * terminar. Com um golpe já trocado, os três PNGs entraram, senão não havia o que desenhar.
   *
   * O piso de seis é o que impede a asserção de ser decorativa: se o filtro de URL deixasse de
   * casar, uma lista vazia passaria calada para sempre.
   */
  const relato = `pedidos de atlas vistos: ${JSON.stringify(atlas)}`
  expect(atlas.length, relato).toBeGreaterThanOrEqual(6)
  expect(atlas.filter((a) => !a.startsWith('2')), relato).toEqual([])
  // Todo PNG pedido pelo hash do conteúdo: é o que permite ao servidor cravar um ano de cache sem
  // casar pixels velhos com coordenadas novas. PNG sem `?v=` significa atlas publicado frouxo.
  expect(atlas.filter((a) => a.includes('.png') && !a.includes('?v=')), relato).toEqual([])

  await page.getByRole('button', { name: 'Mochila' }).click()
  // As poções podem ter acabado durante a caçada; as bolas continuam lá.
  await expect(page.locator('.modal .bag-item').first()).toBeVisible()
  await expect(page.locator('.modal')).toContainText('Bola')
  await page.keyboard.press('Escape')
  await expect(page.locator('.modal')).toHaveCount(0)

  await expect(async () => {
    // O preço da Poção: o smoke espera até o jogador poder comprar uma de verdade.
    expect(Number(await page.locator('.perfil [data-gold]').textContent())).toBeGreaterThanOrEqual(200)
  }).toPass({ timeout: 120_000 })

  await page.getByRole('button', { name: 'Parar' }).click()
  await expect(page.getByRole('heading', { name: 'Onde caçar' })).toBeVisible({ timeout: 30_000 })

  await page.getByRole('button', { name: 'Loja' }).click()
  const potion = page.locator('.shop-item[data-item=potion]')
  // Lê o ATRIBUTO, não o texto: o selo é escrito para gente (`×1`, com separador de milhar), e
  // amarrar o teste à forma de escrever um número o quebra a cada mudança de apresentação.
  const contador = potion.locator('[data-owned]')
  const before = Number(await contador.getAttribute('data-owned'))
  await potion.getByRole('button', { name: 'Comprar' }).click()
  await expect(contador).toHaveAttribute('data-owned', String(before + 1), { timeout: 15_000 })
})
