import { defineConfig } from '@playwright/test'

const PORT = 3100
const DATABASE_URL = process.env['DATABASE_URL_TEST'] ?? 'postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test'

export default defineConfig({
  testDir: 'e2e',
  // Os passos do smoke somam 300 s de tolerância (canvas, primeira derrota, ouro, volta). Um
  // limite global menor que essa soma passa em máquina rápida e falha em runner lento, que foi
  // exatamente o que aconteceu na esteira.
  timeout: 420_000,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, video: 'retain-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm --filter @pokeidle/client build && pnpm --filter @pokeidle/server start',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 180_000,
    cwd: '../..',
    // Sem acelerar o tick: medido na esteira, um tick de 40 ms multiplica por cinco a cadência de
    // persistência e satura o runner de dois núcleos — a caçada andou 38 ticks em 120 s. O relógio
    // do jogo fica no padrão e quem dá folga é o limite global acima.
    env: { PORT: String(PORT), APP_ORIGIN: `http://localhost:${PORT}`, DATABASE_URL, COOKIE_SECURE: 'false', LOG_LEVEL: 'warn' },
  },
})
