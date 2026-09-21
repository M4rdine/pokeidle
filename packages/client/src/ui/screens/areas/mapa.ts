export interface GradeDaRegiao { readonly width: number; readonly height: number }
export interface Ponto { readonly x: number; readonly y: number }
export interface PosicaoNoMapa { readonly esquerda: number; readonly topo: number }

const prender = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v))

/**
 * Posição do marcador na imagem do mapa, em porcentagem.
 *
 * Porcentagem e não pixel porque a imagem escala com a tela: o marcador acompanha sem ninguém
 * recalcular. Região de tamanho zero devolve o canto em vez de `NaN`, que o navegador descarta
 * em silêncio e empilha todos os marcadores no mesmo lugar.
 */
export function posicaoNoMapa(regiao: GradeDaRegiao, ancora: Ponto): PosicaoNoMapa {
  if (regiao.width <= 0 || regiao.height <= 0) return { esquerda: 0, topo: 0 }
  return {
    esquerda: prender((ancora.x / regiao.width) * 100, 0, 100),
    topo: prender((ancora.y / regiao.height) * 100, 0, 100),
  }
}
