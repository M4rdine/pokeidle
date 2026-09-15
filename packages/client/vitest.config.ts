import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'happy-dom', include: ['test/**/*.test.ts'],
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/scene/app.ts', 'src/scene/map-layer.ts', 'src/scene/sprites.ts', 'src/scene/effects.ts', 'src/main.ts'], thresholds: { lines: 80, statements: 80, branches: 70 } },
  },
})
