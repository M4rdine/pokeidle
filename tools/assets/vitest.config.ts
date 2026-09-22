import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    /*
     * Vinte segundos, e não os 5 s do padrão do vitest.
     *
     * Esta suíte não simula: ela CODIFICA PNG de verdade — recorta tileset, monta atlas, comprime.
     * O caso mais pesado leva ~2 s numa máquina ociosa, e passa de 5 s quando `pnpm -r test` roda
     * os cinco pacotes ao mesmo tempo. O prazo não é asserção de desempenho nenhuma: nenhum caso
     * afirma que codificar é rápido. Ele existe só para um travamento virar erro legível.
     *
     * É a MESMA falha que `packages/server` já tinha no prazo do socket: um limite dimensionado
     * para o trabalho parado, que a máquina carregada atravessa. Lá custou um deploy pulado.
     */
    testTimeout: 20_000,
    coverage: { provider: 'v8', include: ['src/**'], thresholds: { lines: 80 } },
  },
})
