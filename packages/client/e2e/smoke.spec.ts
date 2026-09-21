import { expect, test } from '@playwright/test'

test('registrar, inicial, Campo Inicial, derrota, mochila, parar e comprar na loja', async ({ page }) => {
  const email = `smoke-${Date.now()}@test.dev`
  await page.goto('/')

  await page.getByRole('button', { name: 'Registrar' }).click()
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('senha-forte-123')
  await page.getByLabel('Nome').fill(`Smoke${Date.now() % 100000}`)
  await page.getByRole('button', { name: 'Criar conta' }).click()

  await expect(page.getByText('Escolha seu inicial')).toBeVisible()
  await page.locator('.starter-card[data-species=charmander]').getByRole('button', { name: 'Escolher' }).click()

  await expect(page.getByRole('heading', { name: 'Onde caçar' })).toBeVisible()
  await page.locator('.area-row:not(.area-row-locked)').getByRole('button', { name: 'Caçar' }).first().click()

  await expect(page.locator('#scene canvas')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.log-line', { hasText: 'derrotado' }).first()).toBeVisible({ timeout: 120_000 })

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
  const before = Number(await potion.locator('[data-owned]').textContent())
  await potion.getByRole('button', { name: 'Comprar' }).click()
  await expect(potion.locator('[data-owned]')).toHaveText(String(before + 1), { timeout: 15_000 })
})
