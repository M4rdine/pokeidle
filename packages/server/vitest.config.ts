import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/main.ts', 'src/db/migrate-cli.ts'], thresholds: { lines: 80 } },
  },
})
