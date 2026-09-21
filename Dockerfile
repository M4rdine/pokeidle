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
# O cache do corepack fora do home do root: o processo roda como `node`, e sem isto o corepack
# não achava o pnpm já baixado e ia buscá-lo na npm a cada start do container — cold start mais
# lento e, pior, um boot que depende da rede para começar.
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate && chmod -R a+rX /opt/corepack
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
