# Deploy

O jogo roda como um container só: um processo serve a API, o WebSocket e o build do cliente. O
Postgres fica fora. Nada no código conhece o provedor, então trocar de host é editar este
documento e o `fly.toml`.

## Variáveis obrigatórias em produção

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Postgres da aplicação; as migrações rodam sozinhas no boot |
| `APP_ORIGIN` | Origem pública, usada na checagem de Origin do WebSocket e nos cookies |
| `COOKIE_SECURE` | `true` atrás de HTTPS |
| `TRUST_PROXY` | `1` atrás de um proxy, para o limite por IP ver o IP real |

`ASSETS_DIR` e `CLIENT_DIST` têm padrão correto dentro da imagem e não precisam ser definidos.

O atlas servido já vem no repositório, então um clone limpo constrói e roda. Para regerá-lo depois
de mexer em tile, prop ou conjunto de terreno:

```bash
pnpm assets build --extracted assets/extracted-otp2019
```

O build já publica os quatro arquivos servidos em `packages/server/public/atlas`. Antes isso era
um `cp` manual, e bastava esquecê-lo uma vez para o jogo abrir com o mapa em branco — o navegador
pedia tiles que a cópia servida não tinha. `packages/server/test/atlas-cobertura.test.ts` falha
quando a cópia fica para trás.

## Métricas

`/metrics` responde no formato Prometheus e `/metrics/ui/` é um painel que lê esse mesmo
endpoint — caçadas ativas, quantis de tick, persistência, HTTP e erros por escopo.

Os dois passam pela mesma guarda, e não existe configuração que os deixe abertos:

- Com `METRICS_TOKEN` no ambiente, exigem `Authorization: Bearer <token>` de qualquer origem,
  inclusive local.
- Sem o token, só respondem ao loopback — o caso do desenvolvimento.

Em produção, defina o token junto dos outros segredos:

```bash
fly secrets set METRICS_TOKEN="$(openssl rand -hex 24)"
curl -H "Authorization: Bearer <token>" https://<app>.fly.dev/metrics
```

Para histórico e alerta, aponte um Prometheus para essa URL; o endpoint não guarda série, e o
painel mostra só o agora.

## Antes de começar

Três coisas na máquina de quem publica, e todas as três precisam estar lá porque o build é local:

```bash
brew install flyctl          # ou: curl -L https://fly.io/install.sh | sh
docker info                  # Docker precisa estar no ar (Colima, Docker Desktop, o que for)
pnpm assets build --extracted assets/extracted-otp2019   # gera o atlas que a imagem leva
```

Vale construir a imagem antes de gastar um deploy:

```bash
docker build -t pokeidle:local .
```

Se isso passa, o deploy só pode falhar por credencial, variável ou banco — nunca por build.

## Primeiro deploy

1. Criar o banco no Neon e copiar a URL de conexão com `sslmode=require`.
2. `fly launch --no-deploy` (o `fly.toml` deste repositório já está pronto; responda que não quer
   criar Postgres nem Redis do Fly).
3. Definir os segredos de uma vez. `COOKIE_SECURE`, `TRUST_PROXY`, `PORT` e `NODE_ENV` já vêm do
   `[env]` do `fly.toml` e não entram aqui:

   ```bash
   fly secrets set \
     DATABASE_URL='postgres://...?sslmode=require' \
     APP_ORIGIN='https://<app>.fly.dev' \
     METRICS_TOKEN="$(openssl rand -hex 24)"
   ```
4. `fly deploy`

   O atlas servido está no repositório, então o build remoto do Fly produz a mesma imagem que o
   local. `--local-only` continua valendo quando se quer construir na própria máquina — só não é
   mais obrigatório.
5. Conferir `https://<app>.fly.dev/health`, que responde status, versão e tempo de atividade.
6. Conferir que o mapa desenha: abrir o jogo, registrar e entrar numa área.

## Deploy seguinte

`fly deploy`. As migrações rodam no boot; se uma falhar, o processo sai e o Fly mantém a máquina
antiga no ar.

## Como está publicado hoje

Numa VPS Ubuntu que já hospedava outros projetos, então o Pokeidle foi encaixado sem encostar em
nada do que estava no ar:

- **Postgres próprio, em container.** A máquina tem um Postgres compartilhado; dar um banco
  isolado ao jogo mantém backup, upgrade e raio de estrago separados dos outros projetos.
- **Aplicação publicada só no loopback** (`127.0.0.1:3200`). Quem fala com o mundo é o nginx, que
  termina o TLS. O servidor escuta em `0.0.0.0` dentro do container, então publicar na interface
  pública o exporia sem proxy e sem TLS.
- **Domínio gratuito via sslip.io**, que resolve o IP a partir do próprio nome e dispensa DNS.
- **Certificado pelo certbot**, com renovação automática já agendada.
- **`restart: unless-stopped`** nos dois containers, com o Docker habilitado no boot: reiniciar a
  máquina traz o jogo de volta sozinho.

A pilha vive em `/opt/pokeidle`, e os segredos em `/opt/pokeidle/.env` com permissão só do root —
gerados na própria máquina, nunca versionados.

Para atualizar:

```bash
cd /opt/pokeidle/src && git pull
docker build -t pokeidle:vps . && cd /opt/pokeidle && docker compose up -d --force-recreate app
```

## Trocar de host

A imagem é um `Dockerfile` comum, sem nada do Fly. Em Render, Railway ou qualquer runner de
container, basta apontar para o repositório, definir as quatro variáveis acima e expor a porta
3000. O `healthcheck` da imagem já responde em `/health`.
