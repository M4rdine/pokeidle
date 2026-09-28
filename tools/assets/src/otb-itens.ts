/**
 * O `items.otb`: a tradução de id de SERVIDOR para id de CLIENTE.
 *
 * O `.otbm` guarda cada tile pelo id de servidor, e esse número não diz nada sobre desenho. Quem
 * sabe qual sprite ele é são estes pares — e só o `items.otb` do MESMO pacote do mapa serve, porque
 * a numeração muda de servidor para servidor.
 *
 * CONFERIR A VERSÃO DE CLIENTE É O PRIMEIRO PASSO, não o último. O primeiro par que eu encontrei
 * declarava cliente 13.10, de 2023, contra o 8.60 do nosso dump: os espaços de id não têm relação
 * nenhuma, e o mapa teria virado lixo colorido depois do conversor inteiro escrito. Por isso a
 * descrição sai daqui junto com os pares, para quem chama poder olhar antes de gastar trabalho.
 *
 * ELE TEM CAMPO DE BANDEIRAS, e o `.otbm` não. Os dois formatos compartilham a árvore de nós e
 * divergem justo aí — foi o que me fez ler o mapa deslocado em quatro bytes por um bom tempo.
 */

const NO_INICIO = 0xfe
const NO_FIM = 0xff
const ESCAPE = 0xfd

/** Atributo com a descrição e as versões, no nó raiz. */
const RAIZ_VERSAO = 0x01
const ITEM_ID_DE_SERVIDOR = 0x10
const ITEM_ID_DE_CLIENTE = 0x11
/** Tamanho do bloco de versão da raiz: três u32 e 128 bytes de descrição. */
const TAMANHO_DA_DESCRICAO = 128

/**
 * O GRUPO do item, o primeiro byte de cada nó.
 *
 * É o que separa cenário de sujeira. Um servidor vivo derruba cadáver e poça no chão e deixa
 * decair; quem grava o mapa grava o instante, e o recorte herda o lixo do dia. Cadáver é
 * CONTAINER (é dele que se saqueia) e gosma é SPLASH — e é por isso que este byte, que eu
 * descartava, vale ser lido.
 */
export const GRUPO = {
  CONTAINER: 2,
  SPLASH: 11,
  FLUIDO: 12,
} as const

export interface ItensOtb {
  /** O que o arquivo diz de si: por exemplo `OTB 3.21.22-8.61`. */
  readonly descricao: string
  /** Id de servidor → id de cliente. */
  readonly paraCliente: ReadonlyMap<number, number>
  /** Id de servidor → grupo. Ver `GRUPO`. */
  readonly grupos: ReadonlyMap<number, number>
}

class Leitor {
  private i: number
  constructor(private readonly b: Uint8Array, inicio: number) { this.i = inicio }

  get fim(): boolean { return this.i >= this.b.length }
  espiar(): number { return this.b[this.i]! }
  cru(): number { return this.b[this.i++]! }

  /** Desescapa: dentro de um valor, `0xFD` diz que o próximo byte é literal. */
  private dado(): number {
    const v = this.b[this.i++]!
    return v === ESCAPE ? this.b[this.i++]! : v
  }

  bytes(n: number): number[] { return Array.from({ length: n }, () => this.dado()) }
  u8(): number { return this.dado() }
  u16(): number { const [a, b] = this.bytes(2); return a! | (b! << 8) }
  u32(): number { const [a, b, c, d] = this.bytes(4); return (a! | (b! << 8) | (c! << 16) | (d! << 24)) >>> 0 }
}

export function lerItensOtb(dados: Uint8Array): ItensOtb {
  const r = new Leitor(dados, 4) // os quatro primeiros bytes são a versão da árvore
  if (r.cru() !== NO_INICIO) throw new Error('não é um items.otb: a raiz não abre como nó')
  r.u8()   // tipo da raiz
  r.u32()  // bandeiras — este formato TEM, o .otbm não

  let descricao = ''
  if (r.espiar() === RAIZ_VERSAO) {
    r.u8()
    const tamanho = r.u16()
    r.u32(); r.u32(); r.u32() // versão maior, menor e build
    const texto = r.bytes(Math.min(TAMANHO_DA_DESCRICAO, tamanho - 12))
    descricao = new TextDecoder().decode(Uint8Array.from(texto)).replace(/\0.*$/, '')
  }

  const paraCliente = new Map<number, number>()
  const grupos = new Map<number, number>()
  while (!r.fim && r.espiar() === NO_INICIO) {
    r.cru()
    const grupo = r.u8()
    r.u32()  // bandeiras
    let servidor: number | null = null
    let cliente: number | null = null
    while (r.espiar() !== NO_FIM) {
      const attr = r.u8()
      const tamanho = r.u16()
      const valor = r.bytes(tamanho)
      if (attr === ITEM_ID_DE_SERVIDOR) servidor = valor[0]! | (valor[1]! << 8)
      else if (attr === ITEM_ID_DE_CLIENTE) cliente = valor[0]! | (valor[1]! << 8)
    }
    r.cru() // NO_FIM
    // Sem id de cliente não há sprite: o item existe para o servidor e não desenha nada.
    if (servidor !== null && cliente !== null) paraCliente.set(servidor, cliente)
    if (servidor !== null) grupos.set(servidor, grupo)
  }
  return { descricao, paraCliente, grupos }
}
