# Sprint 8: segunda região e portão de região — Design

Data: 2026-09-20. Plano: `docs/design/2026-09-20-plano-3-meses.md`. Triagem: item A1.

## 1. Problema

O modelo de conteúdo é região → área desde a sprint 2, mas só existe uma região. Tudo que depende
de haver duas continua sem prova: o portão de nível da região nunca barrou ninguém, o navegador de
áreas nunca precisou separar uma região da outra, e a validação "toda espécie tem área" ficou de
fora da sprint 7 porque com uma região só ela acusaria 28 espécies legítimas.

E o conteúdo acaba cedo. O Pico Rochoso vai até o nível 35; depois dele não há para onde ir, e o
jogo termina no meio da tabela de destraves, que vai até 40.

## 2. Objetivo e limites

Uma segunda região, desenhada pelo mesmo caminho que Kanto, com portão de nível próprio que o
servidor cobra, e o navegador de áreas mostrando as duas.

Fora do escopo: bosses, sistema de qualidade, evolução ramificada. Nenhuma espécie nova é
importada — as que já existem e nunca tiveram lugar são distribuídas entre as duas regiões.

Critério de pronto: um treinador de nível baixo que tenta entrar numa área da segunda região
recebe recusa com o nível que falta; a tela lista as duas regiões separadas; e a validação de
conteúdo passa a exigir que toda espécie selvagem tenha uma área.

## 3. A região

**Terras Altas** (`terras-altas`), o que existe depois que Kanto acaba: cavernas fundas, planalto
e o cume. Mesmo tamanho de Kanto, 96×72, oito áreas de 24×36. Portão de região no nível **30**,
que é onde o Pico Rochoso de Kanto deixa o jogador.

| Área | Bioma | Níveis | Espécies |
|---|---|---|---|
| gruta-umida | caverna | 36–44 | arbok, magmar |
| tunel-rocha | caverna fechada | 40–48 | kabutops, beedrill |
| campo-safari | campo aberto | 44–52 | exeggutor, wigglytuff |
| usina-velha | pedra e ruína | 48–56 | raichu, magmar |
| ilhas-espuma | areia e água | 52–60 | kabutops, wigglytuff |
| mata-fechada | floresta densa | 56–64 | exeggutor, pidgeot |
| trilha-da-vitoria | pedra alta | 60–68 | pidgeot, wigglytuff |
| cume-indigo | pico | 64–72 | nidoking, raichu, snorlax |

A ordem é a da experiência base das espécies, de 157 a 227: a progressão de recompensa sai do
elenco, não de um multiplicador inventado. O portão da região fica no nível **34**, que é o que a
área de entrada exige.

## 4. O que precisa mudar no gerador

`kanto-draw.ts` desenha Kanto e só Kanto: a lista de biomas está embutida e as dimensões são
constantes do módulo. A sprint troca isso por um gerador que recebe a região como dado.

```ts
export interface RegionSpec {
  readonly id: string
  readonly name: string
  readonly order: number
  readonly minTrainerLevel: number
  readonly biomas: readonly Bioma[]
}

export function desenharRegiao(spec: RegionSpec, temTile: (nome: string) => boolean): RegionDraft
```

`kanto-biomas.ts` vira `regioes.ts`, com as duas listas. O script passa a receber o id da região:
`pnpm mapa <regiao>`. Nada da composição muda — é a mesma pintura de canto, a mesma trilha, os
mesmos props; o que sai é o acoplamento a uma região específica.

## 5. O portão de região

`areaUnlockLevel` já devolve o maior entre o nível da região e o da área, e o servidor já recusa
com 403. Falta só a região ter um nível que não seja 1: `unlocks.json` ganha
`"terras-altas": 30`. O teste que hoje inventa uma região fictícia passa a usar a real.

## 6. O navegador de áreas

A ficha passa a agrupar por região, com um cabeçalho por grupo trazendo o nome e, quando
bloqueada, o nível que a abre. Sem o agrupamento, dezesseis linhas numa lista contínua perdem a
noção de "onde estou e o que vem depois", que é metade do que a tela faz.

O filtro de nível e o de tipo continuam valendo sobre a lista inteira: quem procura onde farmar
elétrico não quer saber de fronteira de região.

## 7. A validação que volta

Com duas regiões, "toda espécie selvagem tem área" passa a acusar algo de verdade e entra como
erro em `buildRegistry`. Iniciais, evoluções e lendários ficam de fora da conta por serem
obteníveis de outra forma — a checagem olha só as espécies que ninguém consegue de nenhum jeito.

## 8. Arquivos

- `tools/assets/src/regioes.ts` — as duas listas de bioma (renomeia `kanto-biomas.ts`).
- `tools/assets/src/region-draw.ts` — o gerador parametrizado (renomeia `kanto-draw.ts`).
- `tools/assets/scripts/desenhar-regiao.ts` — o script, agora com argumento.
- `packages/shared/data/unlocks.json` — o portão da região nova.
- `packages/shared/src/registry.ts` — a checagem de espécie sem área.
- `packages/client/src/ui/screens/areas/index.ts` — agrupamento por região.

## 9. Testes

- O gerador: desenhar as duas regiões com a mesma semente é determinístico, e cada uma usa só o
  pincel dos seus biomas; a região nova passa nas mesmas invariantes que Kanto.
- O servidor: treinador de nível 20 recebe 403 com "abre no nível 30" ao tentar `gruta-umida`;
  com nível 30, entra.
- O registro: as duas regiões carregam juntas, sem área duplicada entre elas, e toda espécie
  selvagem tem casa.
- A tela: as duas regiões aparecem com cabeçalho, e o filtro atravessa a fronteira.
- O balanceamento: a primeira área da região nova, com um time do nível dela, rende mais XP por
  hora que a última de Kanto — senão a região nova é um degrau para baixo.

## 10. Riscos

O maior é o mapa novo nascer injogável de um jeito que o importador não pega: ele valida caminho
até o Centro e spawn alcançável, mas não valida se o confronto de tipos torna a área impossível.
Mitigação: o teste de balanceamento da área de entrada roda com um time coerente com o nível.

O segundo é o gerador parametrizado quebrar Kanto na refatoração. Mitigação: o teste de
equivalência já existe e compara o mapa recortado com o conteúdo publicado, tile a tile — se a
refatoração mudar um pixel de Kanto, ele acusa.
