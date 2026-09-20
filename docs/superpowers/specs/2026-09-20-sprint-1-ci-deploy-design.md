# Sprint 1: integração contínua e deploy público — Design

Data: 2026-09-20. Plano de três meses: `docs/design/2026-09-20-plano-3-meses.md`.

## 1. Problema

O projeto tem 583 testes, motor determinístico e smoke de navegador, e nada disso é visível para
ninguém. Não há repositório remoto, não há CI, não há endereço público. Para um portfólio técnico,
isso é o que mais custa: o trabalho existe e não pode ser mostrado nem verificado por terceiros.

Hoje a suíte roda só na máquina do autor, contra um Postgres local no Docker, e quebra de forma
intermitente sob carga. Um pull request não é barrado por nada.

## 2. Objetivo e limites

Entregar três coisas: o código num repositório remoto, uma esteira que barra regressão a cada
push, e o jogo rodando num endereço que qualquer pessoa abre.

Fora do escopo: monitoramento e métricas (sprint 9), domínio próprio pago, CDN, múltiplas
regiões, deploy automático de banco com dados de exemplo.

Critério de pronto: um push numa branch abre PR com a esteira verde ou vermelha conforme o
código; o endereço público serve o jogo com o mapa e o atlas atuais; e o README explica em cinco
linhas como rodar tudo localmente.

## 3. Decisões tomadas

Sem perguntar ao usuário, porque ele pediu execução contínua. Cada uma com o custo de errar.

**Hospedagem: Fly.io para a aplicação, Neon para o Postgres.** O jogo mantém processo longo com
WebSocket e agendador a 5 ticks por segundo; plataformas serverless matam isso. O Fly roda
container e mantém processo. O Neon tem camada gratuita real e faz ramificação de banco, que
serve para a esteira. Custo se errado: trocar de host é editar um `Dockerfile` e um arquivo de
configuração, porque nada no código conhece o provedor.

**Repositório público.** É portfólio; o código fechado não serve ao objetivo. Os assets do Tibia
não entram: `/assets/` já é ignorado pelo git e permanece assim. Custo se errado: tornar privado
depois é um clique, mas o que já foi clonado não volta.

**Imagem única, servidor servindo o cliente.** O `@fastify/static` já serve `dist` e o atlas.
Manter isso evita CDN, CORS e um segundo deploy. Custo se errado: quando o tráfego justificar,
separa-se depois.

**Postgres de teste na esteira em container de serviço**, não o Neon. A suíte trunca tabelas entre
arquivos e não pode compartilhar banco com nada. Custo se errado: nenhum, é o padrão.

## 4. A esteira

Um workflow, quatro jobs, rodando em push e em pull request:

| Job | O que faz | Barra o PR? |
|---|---|---|
| `verificar` | instala, typecheck e lint de todos os pacotes | sim |
| `testar` | suíte completa com Postgres de serviço, e cobertura | sim |
| `smoke` | build do cliente e Playwright contra o servidor real | sim |
| `imagem` | build do `Dockerfile` para provar que a imagem compila | sim |

Concorrência por branch, cancelando execução antiga. Cache de pnpm pela store. O job de teste
recebe `DATABASE_URL_TEST` apontando para o serviço, e roda migrações antes.

A suíte do servidor é sequencial por arquivo (`fileParallelism: false`) e o runner do GitHub tem
dois núcleos. É esperado que leve mais que na máquina local; o limite do job fica em vinte
minutos.

## 5. A imagem

`Dockerfile` multi-estágio: um estágio instala dependências e compila cliente e servidor, outro
recebe só o resultado e as dependências de produção. Entrada roda migrações e sobe o servidor.

O atlas é o ponto de atenção: ele vive em `/assets/`, que é ignorado pelo git, e o servidor o
serve em `/assets/atlas/*`. Sem ele o jogo carrega sem sprites. A imagem precisa recebê-lo, e a
única fonte hoje é a máquina do autor. A solução desta sprint é publicar o atlas gerado como
artefato versionado fora do git ignorado: `packages/server/public/atlas/`, escrito pelo build de
assets e **rastreado**, porque são cerca de 700 kB de PNG e JSON, não os 300 MB do dump.

## 6. Configuração e segredos

Nada de novo no código: o servidor já lê tudo de ambiente com validação por schema. Entram três
segredos no repositório remoto, usados só pelo deploy: token do Fly, URL do Neon e a origem
pública da aplicação.

`.env.example` ganha comentário explicando cada variável e qual é obrigatória em produção.

## 7. Testes

Infraestrutura não tem teste unitário; o que prova que funciona é a própria esteira rodar. O que
ganha teste de verdade:

- `Dockerfile` compila, provado pelo job `imagem`.
- A rota de saúde responde com versão e tempo de atividade, com teste de integração no servidor.
- O servidor recusa subir sem as variáveis obrigatórias, com teste que já existe em `config.test.ts`
  e ganha um caso para a origem pública.

## 8. Riscos

O maior é o smoke na esteira ser instável, porque depende de subir servidor, banco e navegador no
mesmo runner. Mitigação: o job usa o mesmo caminho do local, com porta fixa e banco de serviço, e
falha rápido com artefato de vídeo anexado.

O segundo é o deploy exigir conta do usuário. A esteira e a imagem ficam prontas e testadas sem
isso; o passo final é um comando com o token dele. Se o token não existir, o job de deploy é
pulado, não falha.

O terceiro é o tamanho da imagem. O atlas de Pokémon tem 1,2 MB e o de tiles 464 kB. Somados ao
Node e às dependências, a imagem deve ficar perto de 300 MB, o que é aceitável.
