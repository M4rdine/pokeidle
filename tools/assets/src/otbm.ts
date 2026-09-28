/**
 * O mapa dos servidores OpenTibia (`.otbm`): geografia pronta, feita à mão.
 *
 * O PORQUÊ. Os nossos dezesseis mapas foram desenhados por script sobre uma paleta de 46 peças, e
 * parecem isso: mancha chapada com aresta reta. Curar mais tiles não conserta — paleta não desenha
 * mapa. Quem desenha é quem senta no editor, e isso já foi feito: um `.otbm` traz litoral, caverna,
 * montanha e cidade prontos, e é o que os servidores de PokeTibia usam por baixo dos Pokémon.
 *
 * O FORMATO. Uma árvore de nós: `0xFE` abre, `0xFF` fecha, `0xFD` escapa o byte seguinte. A raiz
 * traz as dimensões; abaixo dela `MAP_DATA`, e abaixo dele áreas de 256×256 com os tiles.
 *
 * DOIS DETALHES QUE ME CUSTARAM UMA TARDE, e que é por isso que estão escritos aqui:
 *
 *  1. NÃO EXISTE CAMPO DE FLAGS no nó. O `.otb` dos itens tem; o `.otbm` não. Ler quatro bytes a
 *     mais depois do tipo desloca o arquivo inteiro e o cabeçalho ainda parece plausível.
 *  2. OS ATRIBUTOS NÃO SÃO UNIFORMEMENTE PREFIXADOS POR TAMANHO. `ATTR_ITEM` é um u16 cru,
 *     `ATTR_TILE_FLAGS` um u32, e só os de texto levam tamanho. Um `skip` genérico de "tipo mais
 *     u16 de tamanho" atravessa o mapa lendo lixo sem falhar em lugar nenhum.
 *
 * Por isso a tabela de atributos abaixo é explícita e o que não está nela FALHA. Num formato
 * binário, adivinhar o tamanho de um campo desconhecido é escolher corromper o resto do arquivo.
 */
const NO_INICIO = 0xfe
const NO_FIM = 0xff
const ESCAPE = 0xfd

/** Tipos de nó do OTBM 2. */
const RAIZ = 0
const AREA_DE_TILES = 4
const TILE = 5
const ITEM = 6
const CIDADE = 13
const TILE_DE_CASA = 14
const PONTO_DE_ROTA = 16

/** Lado de uma área, em tiles: o `.otbm` guarda a posição do tile em um byte por eixo. */
const LADO_DA_AREA = 256

/**
 * O tamanho do valor de cada atributo, em bytes. `texto` é prefixado por um u16 de tamanho.
 *
 * O que não estiver aqui derruba a leitura de propósito — ver o cabeçalho.
 */
const ATRIBUTOS: Readonly<Record<number, number | 'texto'>> = {
  1: 'texto',   // descrição
  2: 'texto',   // arquivo externo
  3: 4,         // bandeiras do tile
  4: 2,         // action id
  5: 2,         // unique id
  6: 'texto',   // texto
  7: 'texto',   // descrição do item
  8: 5,         // destino de teleporte: x u16, y u16, z u8
  9: 2,         // O CHÃO do tile, ou o id do item
  10: 2,        // depot id
  11: 'texto',  // arquivo de spawn
  12: 2,        // cargas de runa
  13: 'texto',  // arquivo de casas
  14: 1,        // id da porta de casa
  15: 1,        // quantidade
  16: 4,        // duração
  17: 1,        // estado de decaimento
  18: 4,        // escrito em
  19: 'texto',  // escrito por
  20: 4,        // guid de quem dorme
  21: 4,        // início do sono
  22: 2,        // cargas
}

/** Um tile do mundo: onde está, o que é o chão, e o que está empilhado em cima. */
export interface TileDoMapa {
  readonly x: number
  readonly y: number
  readonly z: number
  /** O id de SERVIDOR do chão, ou `null` quando o tile não tem chão (buraco no mundo). */
  readonly chao: number | null
  /** Os ids de servidor empilhados, de baixo para cima. */
  readonly pilha: readonly number[]
  /**
   * Se o tile pertence a uma CASA. É o sinal que separa cidade de natureza sem olhar pixel: uma
   * montanha não tem casa, e calçada de pedra engana qualquer classificador de cor.
   */
  readonly casa: boolean
}

export interface MapaOtbm {
  readonly largura: number
  readonly altura: number
  readonly tiles: readonly TileDoMapa[]
}

/**
 * Cursor sobre a árvore.
 *
 * `cru` lê o byte sem desescapar — é o que enxerga os marcadores de nó. `dado` desescapa: dentro
 * de um valor, `0xFD` significa "o próximo byte é literal", e é isso que permite a um id valer
 * 0xFE sem fechar o nó.
 */
class Arvore {
  private constructor(private readonly b: Uint8Array, private i: number) {}

  static de(bytes: Uint8Array, inicio: number): Arvore {
    return new Arvore(bytes, inicio)
  }

  get fim(): boolean { return this.i >= this.b.length }
  espiar(): number { return this.b[this.i]! }
  cru(): number { return this.b[this.i++]! }

  dado(): number {
    const v = this.b[this.i++]!
    return v === ESCAPE ? this.b[this.i++]! : v
  }

  bytes(n: number): number[] {
    return Array.from({ length: n }, () => this.dado())
  }

  u8(): number { return this.dado() }
  u16(): number { const [a, b] = this.bytes(2); return a! | (b! << 8) }
  u32(): number { const [a, b, c, d] = this.bytes(4); return (a! | (b! << 8) | (c! << 16) | (d! << 24)) >>> 0 }

  /** Consome os atributos do nó atual e devolve o chão, que é o único que este leitor usa. */
  atributos(): number | null {
    let chao: number | null = null
    for (;;) {
      const proximo = this.espiar()
      if (proximo === NO_INICIO || proximo === NO_FIM) return chao
      const attr = this.dado()
      const tamanho = ATRIBUTOS[attr]
      if (tamanho === undefined) {
        throw new Error(`atributo 0x${attr.toString(16)} desconhecido na posição ${this.i}: sem o tamanho, o resto do arquivo vira lixo`)
      }
      if (tamanho === 'texto') { this.bytes(this.u16()); continue }
      const valor = this.bytes(tamanho)
      if (attr === 9) chao = valor[0]! | (valor[1]! << 8)
    }
  }
}

/**
 * Lê o mapa inteiro. Só o que desenha o chão interessa: casas, spawns e waypoints são percorridos
 * para achar o fim do nó, e descartados.
 */
export function lerMapa(dados: Uint8Array): MapaOtbm {
  // Os quatro primeiros bytes são a versão da árvore, e não um nó.
  const a = Arvore.de(dados, 4)
  if (a.cru() !== NO_INICIO || a.u8() !== RAIZ) throw new Error('não é um .otbm: a raiz não abre como nó')
  a.u32() // versão do mapa
  const largura = a.u16()
  const altura = a.u16()
  a.u32(); a.u32() // versão maior e menor do items.otb que gerou este mapa

  const tiles: TileDoMapa[] = []

  /**
   * Percorre um nó e devolve o id do item, quando o nó É um item.
   *
   * Devolver em vez de escrever numa variável de fora é o que deixa o tile montar a própria pilha:
   * os filhos de um tile são os itens empilhados nele, e a ordem em que chegam é a ordem em que
   * foram postos.
   */
  const percorrer = (area: { x: number; y: number; z: number } | null): number | null => {
    a.cru() // NO_INICIO
    const tipo = a.u8()
    let aqui = area
    let tile: { x: number; y: number; z: number } | null = null
    let casa = false
    let idDoItem: number | null = null

    if (tipo === AREA_DE_TILES) {
      aqui = { x: a.u16(), y: a.u16(), z: a.u8() }
    } else if (tipo === TILE || tipo === TILE_DE_CASA) {
      if (!aqui) throw new Error('tile fora de uma área: a árvore não tem a forma esperada')
      tile = { x: aqui.x + a.u8(), y: aqui.y + a.u8(), z: aqui.z }
      if (tipo === TILE_DE_CASA) { casa = true; a.u32() }
    } else if (tipo === ITEM) {
      idDoItem = a.u16()
    } else if (tipo === CIDADE || tipo === PONTO_DE_ROTA) {
      /*
       * CIDADE E PONTO DE ROTA NÃO TÊM ATRIBUTOS: têm campos crus. A cidade traz id, nome e a
       * posição do templo; o ponto de rota, nome e posição.
       *
       * Foi aqui que a leitura morreu a 43 bytes do fim do mapa, depois de atravessar 2 MB certos:
       * o id da cidade foi lido como se fosse um atributo, e o byte seguinte não existia na tabela.
       * Nada disto desenha chão, mas sem consumir os campos não se acha o fim do nó.
       */
      if (tipo === CIDADE) a.u32()
      a.bytes(a.u16())   // nome
      a.u16(); a.u16(); a.u8()  // x, y, z do templo
    }

    const chao = a.atributos()
    const pilha: number[] = []
    while (a.espiar() === NO_INICIO) {
      const filho = percorrer(aqui)
      if (tile !== null && filho !== null) pilha.push(filho)
    }
    a.cru() // NO_FIM

    if (tile) tiles.push({ ...tile, chao, pilha, casa })
    return idDoItem
  }

  while (!a.fim && a.espiar() === NO_INICIO) percorrer(null)
  return { largura, altura, tiles }
}

/** O recorte retangular de um mapa, já indexado por posição relativa. */
export function recortar(mapa: MapaOtbm, x0: number, y0: number, z: number, largura: number, altura: number): (TileDoMapa | null)[] {
  const grade: (TileDoMapa | null)[] = Array.from({ length: largura * altura }, () => null)
  for (const t of mapa.tiles) {
    if (t.z !== z) continue
    const dx = t.x - x0
    const dy = t.y - y0
    if (dx < 0 || dy < 0 || dx >= largura || dy >= altura) continue
    grade[dy * largura + dx] = t
  }
  return grade
}

export { LADO_DA_AREA }
