/**
 * A tela de escolher onde caçar. É onde o jogador cai quando não há caçada em andamento.
 *
 * TESE: **o mapa é a interface.** O jogador olha o mundo, aponta um marcador e lê o veredito ao
 * lado. É a mesma decisão do modal do Mapa, e agora é literalmente o mesmo componente.
 *
 * O QUE CAIU, e por quê. Esta tela era uma ficha de campo densa: barra de filtros por tipo e
 * confronto, contagem "X de Y", o mapa, e abaixo dele DEZESSEIS LINHAS de tabela com o detalhe
 * abrindo como SANFONA dentro da própria lista. Três formas de ver a mesma área na mesma tela.
 * Duas coisas estavam erradas:
 *
 *  1. O mapa decidia e a lista o empurrava para fora da primeira dobra. Quem chega aqui está
 *     perguntando "para onde vou agora", e o mapa responde de relance o que a tabela só responde
 *     lendo linha por linha.
 *  2. Filtrar dezesseis áreas é resolver um problema que não existe. A barra de filtros custava
 *     o maior bloco da tela, e o mapa mostra as dezesseis de uma vez.
 *
 * A sanfona era a pior parte: abrir uma área empurrava as de baixo, então comparar duas exigia
 * fechar uma. O analisador agora é um painel fixo ao lado, que não empurra nada.
 */
import type { AppContext } from '../../../app-context.js'
import { PokedexSchema, StartHuntSchema, TeamSchema } from '../../../api/dto.js'
import { trainerProgress } from '../../../state/progress.js'
import { el, mount } from '../../dom.js'
import { mountMenu } from '../../hud/menu.js'
import { escolherDestino, type DadosDoTreinador } from './escolher-destino.js'
import type { AreaNoMapa } from './MapaRegiao.js'

export function mountAreas(root: HTMLElement, ctx: AppContext): () => void {
  const { me } = ctx.session.get()
  const regioes = [...ctx.registry.regions.values()].sort((a, b) => a.order - b.order)
  const primeira = regioes[0]

  let regiaoId = primeira?.id ?? ''
  let areaId: string | null = null
  let dados: DadosDoTreinador | null = null
  let erro = ''

  const start = (id: string, botao: HTMLElement): void => {
    erro = ''
    botao.setAttribute('disabled', '')
    void ctx.http.post(`/hunts/${id}/start`, {}, StartHuntSchema)
      .then(() => ctx.go())
      .catch((err: unknown) => {
        erro = err instanceof Error ? err.message : 'não foi possível começar a caçada'
        botao.removeAttribute('disabled')
        render()
      })
  }

  const acao = (area: AreaNoMapa): HTMLElement | null => area.locked
    ? el('p', { class: 'hunt-gate' }, `Abre no nível ${area.minTrainerLevel}`)
    : el('button', { type: 'button', class: 'primary', onclick: (ev) => start(area.id, ev.currentTarget as HTMLElement) }, 'Caçar aqui')

  const progresso = me ? trainerProgress(ctx.registry, me.trainer.xp) : null

  /*
   * A classe no HOSPEDEIRO, porque é ele que pinta a arte do mundo ao fundo — a mesma da tela de
   * jogo. Escolher onde caçar acontece DENTRO do mundo, não numa página sobre ele, e antes disso a
   * tela era um retângulo cinza flutuando no vazio enquanto a do jogo tinha atmosfera: a troca
   * entre as duas lia como troca de produto. Sai no desmonte, junto com o resto.
   */
  root.classList.add('tela-areas')
  /*
   * A BARRA SUPERIOR É A MESMA DO JOGO, pelo mesmo componente — não uma cópia da marcação.
   *
   * Sem caçada ativa não existe HUD, e sem esta barra a tela é um beco: quem parou para comprar
   * poção não tem por onde abrir a Loja. Foi o que aconteceu quando a tela foi reescrita, e quem
   * pegou foi o smoke do Playwright procurando o botão "Loja".
   *
   * Ela era remontada À MÃO aqui, com a marcação antiga, e por isso saiu quebrada no dia em que a
   * barra do jogo ganhou marca, status e moldura: a cópia não acompanhou o original. Chamar o
   * componente é o que impede a próxima divergência.
   *
   * A barra fica FORA do que se redesenha. `render()` troca os filhos, e a barra tem assinatura
   * viva (a luz de status) — redesenhá-la a cada clique vazaria uma assinatura por vez.
   */
  const barra = el('div', { class: 'areas-topo' })
  const conteudo = el('div', { class: 'areas-conteudo' })
  /*
   * `replaceChildren` e não `append`: o hospedeiro é COMPARTILHADO entre as telas, e quem estava
   * aqui antes é o "Carregando…" do arranque. Com `append` ele ficava pendurado acima da barra —
   * o preço de trocar um `mount()`, que limpa, por uma montagem em duas partes.
   */
  root.replaceChildren(barra, conteudo)
  const pararMenu = mountMenu(barra, ctx)

  function render(): void {
    if (primeira === undefined) {
      mount(conteudo, el('main', { class: 'screen screen-areas' }, el('p', { class: 'muted' }, 'Nenhuma região carregada.')))
      return
    }
    mount(conteudo, el('main', { class: 'screen screen-areas' },
      el('header', { class: 'area-head' },
        el('div', { class: 'area-titulo' },
          el('h1', {}, 'Onde caçar'),
          // Instrução, não enfeite: é a única linha da tela que explica como ela funciona, e o
          // mapa não tem como dizer sozinho que os marcadores são clicáveis.
          el('p', { class: 'area-dica' }, 'Aponte um marcador no mapa e confira o rendimento antes de sair.')),
        // As mesmas leituras do painel do treinador, no mesmo componente: quem sai da caçada não
        // pode achar que entrou noutro produto.
        progresso
          ? el('div', { class: 'area-leituras' },
              el('div', { class: 'cartao-leitura' }, el('span', {}, 'nível'), el('span', {}, String(progresso.level))),
              el('div', { class: 'cartao-leitura cartao-ouro' }, el('span', {}, 'ouro'), el('span', {}, (me?.trainer.gold ?? 0).toLocaleString('pt-BR'))),
              el('div', { class: 'cartao-leitura' }, el('span', {}, 'próximo'), el('span', {}, progresso.next?.what ?? 'tudo destravado')))
          : null),
      escolherDestino({
        ctx, regiaoId, areaId, dados, erro, acao,
        aoTrocarRegiao: (id) => { regiaoId = id; areaId = null; erro = ''; render() },
        aoEscolherArea: (id) => { areaId = id; erro = ''; render() },
      })))
  }

  render()

  void Promise.all([
    ctx.http.get('/trainer/team', TeamSchema).then((r) => r.team),
    ctx.http.get('/trainer/pokedex', PokedexSchema).then((r) => r.entries),
  ]).then(([team, entries]) => {
    dados = {
      team: team.map((p) => ({ speciesName: p.speciesName, level: p.level })),
      caught: entries.filter((e) => e.caughtAt !== null).map((e) => e.speciesName),
    }
    render()
  }).catch(() => {
    erro = 'não deu para carregar o seu time; os números do analisador ficam de fora'
    dados = { team: [], caught: [] }
    render()
  })

  return () => { pararMenu(); root.classList.remove('tela-areas'); root.replaceChildren() }
}
