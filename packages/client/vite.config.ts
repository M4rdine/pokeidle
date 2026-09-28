import { defineConfig } from 'vite'
const target = 'http://localhost:3000'
export default defineConfig({
  build: {
    assetsDir: 'app', sourcemap: false, target: 'es2022',
    /*
     * 1 KB, e não os 4 KB do padrão do Vite.
     *
     * Com o padrão, as dezesseis insígnias (1,5 a 5,7 KB cada) entravam como data URI dentro da
     * folha de estilo e ela saltou de 50 KB para 114 KB — estourando o orçamento de CSS da
     * página. Elas são arte de medalha, não ícone de inventário, e a maioria nem é mostrada em
     * cor: como arquivo, cada uma é baixada quando aparece e fica em cache imutável.
     *
     * Acima de 1 KB não entra: os ícones de item e de função têm ~300 bytes e continuam inline,
     * que é onde o data URI de fato paga — uma requisição a menos por peça que sempre aparece.
     */
    assetsInlineLimit: 1024,
  },
  server: {
    port: 5173, strictPort: true,
    proxy: {
      '/auth': target, '/me': target, '/trainer': target, '/hunts': target, '/shop': target, '/assets/atlas': target, '/assets/maps': target,
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
