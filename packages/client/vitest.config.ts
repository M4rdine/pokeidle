import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    environment: 'happy-dom', include: ['test/**/*.test.ts'],
    /*
     * Vinte segundos, como no servidor e no pipeline de assets. Não é asserção de desempenho:
     * nenhum caso aqui afirma que montar DOM é rápido. O prazo existe para um travamento virar
     * erro legível, e por isso fica muito acima do trabalho real.
     *
     * Cada arquivo levanta o seu happy-dom — o próprio vitest avisa que isso é ~60% do tempo da
     * suíte — e com `pnpm -r test` rodando cinco pacotes juntos os 5 s do padrão são atravessados
     * por montagens que sozinhas levam milissegundos.
     *
     * É a terceira suíte do repositório a cair nisso: antes foi a espera do socket no servidor
     * (que custou um deploy pulado) e a codificação de PNG em tools/assets. O padrão do vitest é
     * dimensionado para teste unitário puro; nenhuma das três é isso.
     */
    testTimeout: 20_000,
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/scene/app.ts', 'src/scene/map-layer.ts', 'src/scene/sprites.ts', 'src/scene/effects.ts', 'src/scene/entities.ts', 'src/main.ts'], thresholds: { lines: 80, statements: 80, branches: 70 } },
  },
})
