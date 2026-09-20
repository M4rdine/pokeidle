# Imagem do Pokeidle: um processo serve a API, o WebSocket e o build do cliente.
# O servidor roda TypeScript direto com tsx (é assim que `pnpm --filter @pokeidle/server start`
# funciona), então não há etapa de compilação de servidor — só a do cliente.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
# Manifests primeiro: com eles em cache, mudar código não reinstala dependência.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
COPY tools/assets/package.json tools/assets/
COPY tools/pokedata/package.json tools/pokedata/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @pokeidle/client build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
RUN pnpm install --frozen-lockfile --filter @pokeidle/server... --prod
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY --from=build /app/packages/client/dist packages/client/dist
# Sem usuário root: o processo não precisa escrever em lugar nenhum.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "--filter", "@pokeidle/server", "start"]
