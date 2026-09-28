/**
 * O controle de zoom da cena.
 *
 * ELE EXISTIA E NINGUÉM SABIA. O zoom estava em `+` e `−` no teclado desde sempre, sem nada na
 * tela dizendo isso — num jogo que se joga com o mouse, atalho invisível é o mesmo que recurso
 * ausente. A referência do gênero que motivou este trabalho tem os dois botões no canto do visor,
 * e é o primeiro lugar onde a mão procura.
 *
 * Fica SOBRE a cena, no canto, e não numa barra: ele age no que está embaixo dele, e é ali que o
 * olho já está quando quer aproximar.
 */
import type { Scene } from '../../scene/app.js'
/*
 * Os limites vêm do módulo solto, e não de `scene/app.ts`: aquele importa o PixiJS, e este
 * controle é montado com o resto do HUD. Importar dali punha o motor de renderização inteiro no
 * pedaço inicial — o teste do pacote pegou na hora.
 */
import { ZOOM_MAXIMO, ZOOM_MINIMO } from '../../scene/zoom-limites.js'
import { el } from '../dom.js'

export interface ControleDeZoom {
  /** Relê a cena e redesenha o controle. Quem muda o zoom por fora chama isto. */
  readonly sincronizar: () => void
  readonly desmontar: () => void
}

/** Monta o controle. `obter` devolve a cena, que chega depois: ela é carregada por `import()`. */
export function mountZoom(root: HTMLElement, obter: () => Scene | null): ControleDeZoom {
  const nivel = el('span', { class: 'zoom-nivel' }, '')
  const menos = el('button', { type: 'button', class: 'zoom-botao', 'aria-label': 'Afastar' }, '−')
  const mais = el('button', { type: 'button', class: 'zoom-botao', 'aria-label': 'Aproximar' }, '+')
  const caixa = el('div', { class: 'zoom', role: 'group', 'aria-label': 'Zoom do mapa' }, menos, nivel, mais)

  const sincronizar = (): void => {
    const cena = obter()
    // Sem cena não há o que aproximar: o controle some, em vez de ficar apertável e inerte.
    caixa.hidden = cena === null
    if (!cena) return
    const z = cena.zoom()
    nivel.textContent = `${z}×`
    menos.toggleAttribute('disabled', z <= ZOOM_MINIMO)
    mais.toggleAttribute('disabled', z >= ZOOM_MAXIMO)
  }

  const mudar = (passo: number) => (): void => {
    const cena = obter()
    if (!cena) return
    cena.setZoom(cena.zoom() + passo)
    sincronizar()
  }
  menos.addEventListener('click', mudar(-1))
  mais.addEventListener('click', mudar(1))

  root.append(caixa)
  sincronizar()
  return { sincronizar, desmontar: () => caixa.remove() }
}
