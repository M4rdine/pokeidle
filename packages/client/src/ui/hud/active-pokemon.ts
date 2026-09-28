import { xpForLevel } from '@pokeidle/shared'
import type { AppContext } from '../../app-context.js'
import { activePokemon } from '../../state/hunt-view.js'
import { displayName } from '../../state/log.js'
import { comTipo, el, pct, pulsar } from '../dom.js'
import { spriteThumb } from '../sprite-css.js'

/** Lado do sprite do ativo, em pixels. Dobro da miniatura das listas: aqui ele é o assunto. */
const LADO_SPRITE = 64
/** Acima disto o HP é saudável; abaixo do segundo degrau é crítico. Leitura de instrumento. */
const HP_SAUDAVEL = 0.5
const HP_CRITICO = 0.2

const estadoDoHp = (hp: number, hpMax: number): string => {
  const fracao = hpMax > 0 ? hp / hpMax : 0
  if (fracao > HP_SAUDAVEL) return 'ok'
  return fracao > HP_CRITICO ? 'ferido' : 'critico'
}

/** Um medidor rotulado: rótulo e número na mesma linha, barra embaixo. */
function medidor(rotulo: string, valor: HTMLElement, barra: HTMLElement): HTMLElement {
  return el('div', { class: 'medidor' },
    el('div', { class: 'medidor-topo' }, el('span', {}, rotulo), valor), barra)
}

/** Cartão do Pokémon ativo: sprite, nome, nível, HP e XP até o próximo nível. */
export function mountActivePokemon(root: HTMLElement, ctx: AppContext): () => void {
  // O sprite vive numa caixa de tamanho fixo. Antes era `transform: scale(2)` solto, que mantinha
  // a caixa do tamanho do frame e transbordava por cima do nome — "Charizard L61" saía ilegível.
  const caixaSprite = el('div', { class: 'active-sprite-box' })
  // Nome e nível em elementos separados, como na faixa do time. O nível é VALOR, e valor não
  // pode ir na face de HUD: ela confunde 5 com 8, e "Charizard L65" saía na tela como "L68"
  // enquanto o rótulo do mundo, ao lado, dizia L65. Separar também alinha as duas superfícies
  // que mostram o mesmo Pokémon.
  const nome = el('span', { 'data-name': '' }, 'sem Pokémon em campo')
  const nivel = el('span', { class: 'chip chip-nivel', 'data-level': '', hidden: '' })
  const title = el('h2', { class: 'active-nome' }, nome, nivel)
  const hp = el('progress', { class: 'hp-bar', 'data-hp': '', 'data-hp-state': 'ok', max: '1', value: '0' })
  const hpText = el('span', { 'data-hp-text': '' }, '—')
  const xp = el('progress', { class: 'xp-bar', 'data-xp': '', max: '100', value: '0' })
  const xpText = el('span', { class: 'muted', 'data-xp-text': '' }, '—')
  const corpo = el('div', { class: 'active-corpo' }, medidor('HP', hpText, hp), medidor('XP', xpText, xp))
  const cartao = el('section', { class: 'active-card panel' },
    el('div', { class: 'active-topo' }, caixaSprite, title), corpo)
  root.append(cartao)

  let species = ''
  /** Quem está em campo agora. Separa "trocou de Pokémon" de "o mesmo mudou". */
  let emCampo = ''
  return ctx.hunt.subscribe(activePokemon, (active) => {
    if (!active) {
      // Estado vazio com palavra, não travessão: quem chega e vê "—" não sabe se quebrou ou se
      // ainda não começou.
      nome.textContent = 'sem Pokémon em campo'
      nivel.hidden = true
      corpo.hidden = true
      caixaSprite.replaceChildren()
      species = ''
      // Também zera quem estava em campo: voltar depois de o campo ficar vazio é uma ENTRADA, e
      // sem isto o mesmo Pokémon voltaria sem o deslize que anuncia a troca.
      emCampo = ''
      return
    }
    corpo.hidden = false
    /*
     * A TROCA DE POKÉMON ENTRA, não corta.
     *
     * O retrato trocava de imagem no mesmo quadro, e num idle — onde a troca acontece sozinha,
     * sem ninguém clicar — o jogador só descobria olhando o nome. O deslize dura o tempo de um
     * pulso e diz, pela FORMA, que alguém novo entrou em campo.
     */
    // Calculado ANTES de qualquer atualização: as duas reações abaixo dependem de saber se
    // trocou, e `emCampo` só avança no fim.
    const trocou = active.id !== emCampo
    if (trocou) {
      caixaSprite.classList.remove('entrou-em-campo')
      void caixaSprite.offsetWidth
      caixaSprite.classList.add('entrou-em-campo')
    }
    if (active.speciesName !== species) {
      species = active.speciesName
      caixaSprite.replaceChildren(spriteThumb(ctx.atlas, species, LADO_SPRITE))
      const tipos = ctx.registry.species.get(species)?.types ?? []
      comTipo(caixaSprite, tipos)
      // A TESE DO SISTEMA, aplicada ao lugar onde ela mais rende e onde faltava: o cartão do
      // Pokémon em campo leva a cor do PRÓPRIO tipo. Era o único painel da coluna que mostrava
      // uma criatura e continuava sendo ardósia lisa — o slot dela, três dedos abaixo, já tinha
      // trilho e poço tingidos.
      comTipo(cartao, tipos)
    }
    nome.textContent = displayName(active.speciesName)
    /*
     * SUBIR DE NÍVEL PULSA. É o progresso do jogo acontecendo, e ele passava como um número que
     * trocava calado — o mesmo tratamento que o HP e o XP recebem a cada tique.
     *
     * Só quando SOBE, e só no MESMO Pokémon: trocar de ativo muda o número sem ninguém ter subido
     * nada, e pulsar ali contaria uma conquista que não houve.
     */
    const nivelAnterior = Number(nivel.getAttribute('data-nivel'))
    if (!trocou && Number.isFinite(nivelAnterior) && active.level > nivelAnterior) {
      pulsar(nivel)
      cartao.classList.remove('subiu-de-nivel')
      void cartao.offsetWidth
      cartao.classList.add('subiu-de-nivel')
      cartao.addEventListener('animationend', () => cartao.classList.remove('subiu-de-nivel'), { once: true })
    }
    nivel.textContent = `nv ${active.level}`
    nivel.setAttribute('data-nivel', String(active.level))
    nivel.hidden = false
    /*
     * O CLARÃO DO DANO. A barra já encolhe com transição, mas encolher devagar esconde o susto:
     * com dano pequeno, o comprimento sozinho não conta que o Pokémon foi atingido.
     *
     * Só quando CAI, e só quando é o MESMO Pokémon: trocar de ativo muda o HP sem ninguém ter
     * levado golpe nenhum, e piscar ali seria mentir sobre o que aconteceu.
     */
    const hpAnterior = Number(hp.getAttribute('value'))
    const mesmoPokemon = hp.getAttribute('data-de') === active.id
    hp.setAttribute('max', String(active.hpMax))
    hp.setAttribute('value', String(active.hp))
    hp.setAttribute('data-de', active.id)
    hp.setAttribute('data-hp-state', estadoDoHp(active.hp, active.hpMax))
    if (mesmoPokemon && active.hp < hpAnterior) {
      hp.classList.remove('levou-dano')
      void hp.offsetWidth
      hp.classList.add('levou-dano')
      hp.addEventListener('animationend', () => hp.classList.remove('levou-dano'), { once: true })
    }
    hpText.textContent = `${active.hp}/${active.hpMax}`
    const growth = ctx.registry.species.get(active.speciesName)?.growthRate ?? 'medium-fast'
    const floor = xpForLevel(growth, active.level)
    const span = xpForLevel(growth, active.level + 1) - floor
    const dentro = pct(Math.max(0, active.xp - floor), span)
    xp.setAttribute('value', String(dentro))
    xpText.textContent = `${dentro}%`
    emCampo = active.id
  })
}
