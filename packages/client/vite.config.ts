import { defineConfig } from 'vite'
const target = 'http://localhost:3000'
export default defineConfig({
  build: { assetsDir: 'app', sourcemap: false, target: 'es2022' },
  server: {
    port: 5173, strictPort: true,
    proxy: {
      '/auth': target, '/me': target, '/trainer': target, '/hunts': target, '/shop': target, '/assets/atlas': target, '/assets/maps': target,
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
