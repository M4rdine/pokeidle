/**
 * A bola de captura, no mundo.
 *
 * A captura era um anel branco de 400 ms sobre o selvagem — a mesma marca que a poção e a cura
 * usam, com outra cor. Nada dizia que uma BOLA tinha sido atirada, e pegar e errar eram
 * visualmente idênticos: só a linha do registro separava os dois.
 *
 * Este é o tipo de coisa que não se confere por captura de tela: a animação dura 1,1 s e some. O
 * que dá para segurar é a LINHA DO TEMPO — onde a bola começa, onde ela assenta, que ela treme, e
 * que os dois fins são diferentes.
 */
import { Container, Texture } from 'pixi.js'
import { describe, expect, it } from 'vitest'
import { bolaDeCaptura } from '../../src/scene/effects.js'

const ALVO = { x: 120, y: 80 }

/** Avança o efeito em passos e devolve a bola, que é o único filho da camada. */
function correr(ms: number, sucesso: boolean) {
  const camada = new Container()
  const passo = bolaDeCaptura(camada, ALVO.x, ALVO.y, Texture.EMPTY, sucesso)
  const bola = camada.children[0]!
  let vivo = true
  // Passos de 16 ms: o mesmo grão de um quadro, para a leitura ser a que o jogador vê.
  for (let t = 0; t < ms && vivo; t += 16) vivo = passo(16)
  return { bola, vivo, camada }
}

describe('a bola de captura', () => {
  it('começa ACIMA do alvo e menor: é o arco do arremesso', () => {
    const { bola } = correr(0, true)
    expect(bola.x).toBe(ALVO.x)
    expect(bola.y).toBeLessThan(ALVO.y)
    expect(bola.scale.x).toBeLessThan(1)
  })

  it('assenta em cima do alvo, em tamanho cheio', () => {
    // Depois da queda: é a posição do selvagem que ela precisa marcar, não um canto da tela.
    const { bola } = correr(260, true)
    expect(bola.y).toBe(ALVO.y)
    expect(bola.scale.x).toBe(1)
  })

  it('TREME depois de assentar, e para antes do fim', () => {
    /*
     * Três balanços. É o número que o gênero fixou e que se reconhece antes de ler qualquer
     * palavra — dois parecem engasgo, quatro viram espera.
     */
    const durante = correr(500, true).bola.rotation
    expect(Math.abs(durante)).toBeGreaterThan(0)
    const depois = correr(950, true).bola.rotation
    expect(depois).toBe(0)
  })

  it('PEGOU: a bola some sem crescer', () => {
    const { bola } = correr(1100, true)
    expect(bola.alpha).toBeLessThan(0.5)
    expect(bola.scale.x).toBe(1)
  })

  it('ESCAPOU: a mesma bola ABRE — cresce enquanto apaga', () => {
    // Ver o mesmo objeto terminar de dois jeitos é o que faz o movimento informar em vez de
    // enfeitar: o jogador lê o fim e para de procurar no registro se pegou.
    const { bola } = correr(980, false)
    expect(bola.scale.x).toBeGreaterThan(1)
    expect(bola.alpha).toBeLessThan(1)
  })

  it('termina e se remove da camada: um efeito não pode vazar sprite', () => {
    // A cena roda por horas num idle. Um sprite que fica é uma captura a cada minuto virando
    // milhares de nós vivos.
    const { vivo, camada } = correr(2000, true)
    expect(vivo).toBe(false)
    expect(camada.children).toHaveLength(0)
  })
})
