import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    /*
     * O mesmo prazo para os GANCHOS, e não os 10 s do padrão do vitest.
     *
     * Quem fala com o Postgres aqui é quase sempre o `beforeEach`, não o caso: ele apaga as oito
     * tabelas, reinicia a sequência e insere o cenário inteiro antes de o teste começar. Levantar
     * só o `testTimeout` deixou justamente o lado que faz trabalho de banco no prazo curto, e
     * `scheduler.test.ts` caiu com "Hook timed out in 10000ms" na segunda rodada de `pnpm -r test`
     * tendo passado na primeira — com os cinco pacotes disputando a mesma máquina.
     *
     * Como nos outros prazos deste repositório, não é asserção de desempenho nenhuma: nenhum caso
     * afirma que limpar o banco é rápido. O prazo existe para um travamento virar erro legível.
     */
    hookTimeout: 20_000,
    coverage: { provider: 'v8', include: ['src/**'], exclude: ['src/main.ts', 'src/db/migrate-cli.ts'], thresholds: { lines: 80 } },
  },
})
