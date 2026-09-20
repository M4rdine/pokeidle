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

Para gerar o atlas na sua máquina antes do primeiro deploy:

```bash
pnpm assets build --extracted assets/extracted-otp2019
```

O build já publica os quatro arquivos servidos em `packages/server/public/atlas`. Antes isso era
um `cp` manual, e bastava esquecê-lo uma vez para o jogo abrir com o mapa em branco — o navegador
pedia tiles que a cópia servida não tinha. `packages/server/test/atlas-cobertura.test.ts` falha
quando a cópia fica para trás.

## Primeiro deploy

1. Criar o banco no Neon e copiar a URL de conexão com `sslmode=require`.
2. `fly launch --no-deploy` (o `fly.toml` deste repositório já está pronto; responda que não quer
   criar Postgres nem Redis do Fly).
3. `fly secrets set DATABASE_URL='...' APP_ORIGIN='https://<app>.fly.dev'`
4. `fly deploy --local-only`

   O `--local-only` é obrigatório: o atlas de sprites **não está no repositório**, porque são
   assets de um pack de fã e publicá-los seria redistribuição. Ele existe só na máquina de quem
   desenvolve, em `packages/server/public/atlas`, e entra no contexto do build local. Um build
   remoto geraria uma imagem sem sprites.
5. Conferir `https://<app>.fly.dev/health`, que responde status, versão e tempo de atividade.

## Deploy seguinte

`fly deploy --local-only`. As migrações rodam no boot; se uma falhar, o processo sai e o Fly mantém a máquina
antiga no ar.

## Trocar de host

A imagem é um `Dockerfile` comum, sem nada do Fly. Em Render, Railway ou qualquer runner de
container, basta apontar para o repositório, definir as quatro variáveis acima e expor a porta
3000. O `healthcheck` da imagem já responde em `/health`.
