import { defineConfig } from '@playwright/test'

const PORT = 3100
const DATABASE_URL = process.env['DATABASE_URL_TEST'] ?? 'postgres://pokeidle:pokeidle@localhost:5433/pokeidle_test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 180_000,
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
    // TICK_MS acelera só o relógio do agendador: a simulação é determinística por tick, então o
    // resultado é o mesmo e o teste deixa de depender da velocidade da máquina.
    env: { PORT: String(PORT), APP_ORIGIN: `http://localhost:${PORT}`, DATABASE_URL, COOKIE_SECURE: 'false', LOG_LEVEL: 'warn', TICK_MS: '40' },
  },
})
