# Pokeidle — contexto de produto

Extraído do GDD (`docs/design/2026-09-14-pokeidle-gdd.md`), do plano de três meses
(`docs/design/2026-09-20-plano-3-meses.md`) e do código em produção. Este arquivo guarda a
verdade do produto; decisões visuais ficam em `DESIGN.md`.

## O que é

Um MMO idle de navegador no estilo PokeTibia: o jogador escolhe uma área, e o seu Pokémon ativo
caça sozinho — anda até o selvagem, luta com golpes em cooldown, ganha XP, ouro e loot, tenta
capturar espécies novas, usa poção quando o HP cai e volta ao Centro Pokémon quando não dá mais.
A caçada continua com a aba fechada; o servidor simula tudo.

## Para quem

Um jogador de idle que quer progresso visível sem exigir atenção contínua, e a referência direta
é pokeidle.io. O projeto também é portfólio técnico: autoridade total no servidor, motor
determinístico e pipeline de assets próprio são argumentos de engenharia tanto quanto de jogo.

## O que o jogador decide

O jogo joga sozinho; o jogador decide o que importa: **qual área caçar**, qual Pokémon está
ativo, quando trocar, o que comprar, quando parar, e os limiares que governam o automático
(usar poção abaixo de X %, voltar ao Centro abaixo de Y %).

## Verdades que não mudam

- **O servidor é a autoridade.** O cliente desenha o que recebe e manda intenção. Nenhum número
  de progresso nasce no navegador.
- **Nada de pressa artificial.** Sem timer de energia, sem anúncio, sem compra. O ritmo vem do
  nível e do renascimento dos selvagens.
- **Progresso offline é sagrado.** Quem volta depois de horas recebe a simulação recuperada, com
  teto de 12 horas.
- **O conteúdo é hierárquico:** região → área. Kanto tem oito áreas de bioma, cada uma com
  espécies, faixa de níveis e um portão de nível de treinador.

## Superfícies

| Superfície | Modo | O que é sucesso |
|---|---|---|
| Registro e inicial | Operate | Entrar e escolher em menos de um minuto |
| **Navegador de áreas** | Operate | Achar onde farmar o que se quer, sem sair da tela |
| Jogo (cena + HUD) | Experience | Ver a caçada acontecer e intervir quando quiser |
| Modais (time, mochila, loja, Pokédex, configurações) | Operate | Resolver a tarefa e voltar ao jogo |

## Restrições técnicas

Cliente TypeScript estrito sem framework: DOM montado à mão (`el`/`mount` em `src/ui/dom.ts`),
PixiJS só dentro da cena do jogo, CSS próprio com tokens em `src/styles/tokens.css`. Orçamento de
bundle de app: < 300 kB gzip. Sem `console.log`, sem mutação, arquivos abaixo de 800 linhas.
