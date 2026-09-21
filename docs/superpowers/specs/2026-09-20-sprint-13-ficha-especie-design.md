# Sprint 13 — A ficha de espécie

## O que faltava

Todo o conteúdo já estava no registro — tipos, atributos-base, taxa de captura, experiência-base,
learnset, evolução — e **nada disso chegava à tela**. A Pokédex mostrava sprite e nome; a linha do
Time mostrava nome, nível e HP. Nenhuma das duas abria coisa alguma ao clique.

Era a última reclamação em aberto do dono: "a UI ainda está incompleta". As sprints 12 e 13 atacam
partes diferentes disso — a 12 arrumou o que já existia, a 13 mostra o que existia e nunca aparecia.

## O que esta sprint entrega

### 1. Duas funções puras no `shared`

- `areasOfSpecies(regions, nome)` — toda área onde a espécie é selvagem, da porta de entrada mais
  baixa para a mais alta. Lista vazia é resposta legítima: inicial e lendário têm outra porta, e a
  ficha precisa distinguir "não achei" de "não é caçável".
- `evolutionChain(registry, nome)` — a linha inteira, perguntando por qualquer estágio. Sobe até a
  raiz e depois desce, porque quem abre a ficha do Charizard quer ver de onde ele veio tanto quanto
  para onde vai. Guarda contra evolução circular no conteúdo: um dado errado não pode travar a tela.

### 2. A ficha

`speciesSheet(ctx, nome)` devolve um elemento — não abre modal. Quem chama decide onde ela mora, e
isso é deliberado: o projeto mantém um modal por vez, então abrir um segundo fecharia a Pokédex e o
jogador perderia o lugar na lista. A Pokédex e o Time mostram a ficha **por dentro** dos próprios
modais, com um botão de volta.

Cinco blocos: identidade (sprite, nome, número, tipos), onde aparece, atributos-base em barras de
escala comum, linha evolutiva com o nível de cada passagem, e os golpes por nível com tipo e poder.

### 3. A cor do portão vira leitura

Na lista de áreas, "entra com nv N" só acende quando o nível ainda barra. Apagado quer dizer que dá
para ir agora. Acender os dois gastaria o acento à toa — e o acento, pelo DESIGN.md, existe para
marcar estado ativo, ação primária, recompensa e portão.

## Defeitos que apareceram no caminho

**O modal cortava conteúdo longo.** `.modal` tinha `max-height` e `overflow: auto`, então rolava —
mas rolava inteiro, e o cabeçalho com o botão de fechar saía da tela junto com o resto. Agora o
cabeçalho fica preso e só o corpo rola.

**Um teste do Time exigia demais.** Ele afirmava que *todo* botão do modal fica desabilitado durante
a caçada. O nome do Pokémon virou botão — é a porta para a ficha — e é leitura, não mutação:
consultar a ficha durante a caçada é justamente quando ela mais serve. O teste passou a distinguir
os dois, marcando as ações que mudam o time com `data-acao`.

## Fechamento de portfólio

O README ganhou o diagrama de como as peças se encaixam, a prévia de mapa gerada pelo pipeline e
três capturas: a tela de jogo, a ficha e o painel de operação. O dono decidiu que capturas com os
sprites do pack de fã podem entrar — os arquivos de arte continuam fora do git.

O deploy depende de credencial e ficou com o dono. O que dava para verificar aqui foi verificado
construindo e **rodando** a imagem de produção contra o Postgres local:

- a imagem constrói (471 MB) e o container sobe;
- as migrações rodam no boot e `/health` responde;
- o atlas está dentro da imagem (`/assets/atlas/tiles.json` → 200), que é o ponto do
  `fly deploy --local-only`;
- a guarda do `/metrics` se comporta como documentado: sem `METRICS_TOKEN` responde 404 a quem não
  é loopback; com o token, 401 sem cabeçalho e sem o Bearer certo, 200 com ele.

### Um defeito que só aparece rodando

O log do container mostrou o corepack **baixando o pnpm da npm a cada start**. A causa: o
`Dockerfile` fazia `corepack enable` e o install como root, que cacheia em `/root`, e depois
trocava para `USER node` — cujo home não tem esse cache. Todo start pagava um download antes de a
aplicação começar, e um boot que depende da rede é frágil onde mais importa: o Fly reinicia a
máquina sozinho.

A correção move o cache para `COREPACK_HOME=/opt/corepack`, pré-ativa a versão fixada em
`packageManager` e deixa a pasta legível para todos.

## Testes

- `areasOfSpecies`: acha todas as áreas, vem em ordem de porta, e devolve vazio para inicial;
- `evolutionChain`: mesma linha por qualquer estágio, espécie solitária, desconhecida, e circular;
- a ficha: identidade, seis atributos, áreas com faixa de nível, origem de quem não é selvagem,
  linha evolutiva com o estágio aberto destacado, golpes, e espécie inexistente;
- navegação: a ficha abre dentro do modal que a chamou, volta para a lista, e espécie ainda não
  vista não abre nada.
