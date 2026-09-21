import { readFile, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ESTILOS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'styles')

/** Variáveis declaradas em `:root`; são elas que o resto do sistema pode usar. */
async function definidos(): Promise<Set<string>> {
  const texto = await readFile(join(ESTILOS, 'tokens.css'), 'utf8')
  return new Set([...texto.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]!))
}

/**
 * Só os tokens cujo VALOR é uma cor hexadecimal. Antes isto era uma lista de prefixos a ignorar
 * (`space-`, `border-`, `bisel`), e a lista envelheceu no dia em que o sistema ganhou tokens de
 * face, de escala de texto e de tempo: `--t-xs` passou a ser cobrado como se fosse uma cor.
 * Perguntar pelo valor não envelhece.
 */
async function cores(): Promise<Set<string>> {
  const texto = await readFile(join(ESTILOS, 'tokens.css'), 'utf8')
  return new Set([...texto.matchAll(/^\s*--([a-z0-9-]+):\s*#[0-9a-f]{6};/gim)].map((m) => m[1]!))
}

/**
 * Variáveis que o JavaScript define em tempo de execução, via `style.setProperty`. Elas não
 * aparecem em folha nenhuma de propósito — o valor depende do estado do jogo.
 */
const EM_TEMPO_DE_EXECUCAO: readonly string[] = [
  '--cd',      // fração de recarga de cada golpe, em hud/moves.ts
  '--fracao',  // altura da barra de atributo-base, em ui/species/stats.ts
  '--zoom',    // degrau de zoom do mapa da região, em screens/areas/MapaRegiao.ts
]

/** Variáveis usadas via `var(--x)`, exceto as declaradas em qualquer folha. */
async function usados(): Promise<Map<string, string[]>> {
  const arquivos = (await readdir(ESTILOS)).filter((f) => f.endsWith('.css'))
  const onde = new Map<string, string[]>()
  for (const arquivo of arquivos) {
    const texto = await readFile(join(ESTILOS, arquivo), 'utf8')
    // Tokens declarados fora do :root (por componente) também valem como definidos.
    // A declaração pode estar no meio da linha (`.hp-bar { --x: ... }`), então não se ancora início.
    const locais = new Set([...texto.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]!))
    for (const m of texto.matchAll(/var\((--[a-z0-9-]+)/g)) {
      const nome = m[1]!
      if (locais.has(nome) || EM_TEMPO_DE_EXECUCAO.includes(nome)) continue
      onde.set(nome, [...(onde.get(nome) ?? []), arquivo])
    }
  }
  return onde
}

/**
 * Um `var(--nao-existe)` não quebra o CSS: o navegador resolve para vazio e a regra some em
 * silêncio. Foi assim que a troca do mundo visual deixou dezesseis bordas invisíveis na Pokédex,
 * na tela de áreas e nos modais sem nenhum erro em lugar nenhum.
 */
describe('todo token usado existe', () => {
  it('nenhuma folha de estilo referencia variável que ninguém declara', async () => {
    // Declarada em qualquer folha conta: `--t` nasce em layout.css e é consumida em areas.css.
    const declarados = await definidos()
    const todas = new Set(declarados)
    for (const arquivo of (await readdir(ESTILOS)).filter((f) => f.endsWith('.css'))) {
      const texto = await readFile(join(ESTILOS, arquivo), 'utf8')
      for (const m of texto.matchAll(/(--[a-z0-9-]+)\s*:/g)) todas.add(m[1]!)
    }
    const orfas = [...(await usados())].filter(([nome]) => !todas.has(nome))
    expect(orfas.map(([nome, arquivos]) => `${nome} usado em ${[...new Set(arquivos)].join(', ')}`)).toEqual([])
  })

  it('a paleta declara os dezoito tipos, que a ficha e os filtros usam por nome', async () => {
    const declarados = await definidos()
    for (const tipo of ['fire', 'water', 'grass', 'electric', 'normal', 'poison', 'ground', 'flying',
      'psychic', 'bug', 'rock', 'ghost', 'ice', 'dragon', 'fighting', 'dark', 'steel', 'fairy']) {
      expect(declarados.has(`--type-${tipo}`), tipo).toBe(true)
    }
  })
})

/**
 * A face de HUD é bitmap e tem um piso de tamanho: abaixo de `--t-l` a grade de pixels cai fora
 * do grid de tela e a forma apodrece — "Configurações" chegou a sair renderizado como
 * "ConAgurações", e a coluna de poder dos golpes mostrava 95, 50 e 35 lendo-se 98, 80 e 38.
 *
 * O teste existe porque essa regra é invisível: o CSS fica válido, a tela fica bonita, e o dado
 * é que sai errado. Foi violada duas vezes na própria sprint que a escreveu.
 */
describe('a face de HUD respeita o piso de tamanho', () => {
  const GRANDES = ['--t-l', '--t-xl', '--t-2xl']

  it('nenhuma regra usa a face de HUD junto de um tamanho abaixo de --t-l', async () => {
    const arquivos = (await readdir(ESTILOS)).filter((f) => f.endsWith('.css'))
    const infratores: string[] = []
    for (const arquivo of arquivos) {
      const texto = await readFile(join(ESTILOS, arquivo), 'utf8')
      // Um bloco por vez: `seletor { ... }`. Comentários saem antes, senão a prosa que CITA a
      // regra (e cita, de propósito) contaria como violação dela.
      const semComentario = texto.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const bloco of semComentario.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const corpo = bloco[2]!
        if (!corpo.includes('var(--fonte-hud)')) continue
        const tamanho = /font-size:\s*var\((--t-[a-z0-9]+)\)/.exec(corpo)
        if (tamanho === null || GRANDES.includes(tamanho[1]!)) continue
        infratores.push(`${arquivo}: ${bloco[1]!.trim()} usa a face de HUD a ${tamanho[1]!}`)
      }
    }
    expect(infratores).toEqual([])
  })

  it('nenhuma regra põe número na face de HUD', async () => {
    // `tabular-nums` na mesma regra é a confissão: só se alinha coluna de dígito. E dígito é
    // justamente o que esta face erra — o 5 e o 8 têm quase a mesma silhueta.
    const arquivos = (await readdir(ESTILOS)).filter((f) => f.endsWith('.css'))
    const infratores: string[] = []
    for (const arquivo of arquivos) {
      const texto = (await readFile(join(ESTILOS, arquivo), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '')
      for (const bloco of texto.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const corpo = bloco[2]!
        if (!corpo.includes('var(--fonte-hud)') || !corpo.includes('tabular-nums')) continue
        infratores.push(`${arquivo}: ${bloco[1]!.trim()} alinha dígito na face de HUD`)
      }
    }
    expect(infratores).toEqual([])
  })

  it('o chip declara a face de leitura em vez de herdar', async () => {
    // Chip quase sempre carrega número e vive dentro de títulos que falam na voz de HUD.
    const texto = await readFile(join(ESTILOS, 'quadro.css'), 'utf8')
    const bloco = /\.chip\s*\{([^}]*)\}/.exec(texto)
    expect(bloco?.[1]).toContain('var(--fonte-texto)')
  })
})

/**
 * Token que o TypeScript lê em tempo de execução é o mais fácil de quebrar do sistema inteiro:
 * `getComputedStyle` de um nome que não existe devolve string vazia, sem erro e sem aviso, e o
 * código cai no valor de reserva para sempre.
 *
 * Foi o que aconteceu: a cena pedia `--fora`, que nunca existiu, e por isso pintava a tarja em
 * volta do mundo com um MARROM sobrevivente da paleta de madeira. Duas trocas de mundo visual
 * inteiras, e ninguém viu — tarja escura continua parecendo tarja escura.
 */
describe('todo token lido em tempo de execução existe no CSS', () => {
  it('o token do fundo que a cena lê está declarado em tokens.css', async () => {
    const cena = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'scene', 'app.ts'), 'utf8')
    const lido = /getPropertyValue\(([A-Z_]+|'--[a-z-]+')\)/.exec(cena)
    expect(lido, 'a cena deixou de ler um token — confira se esta regra ainda faz sentido').not.toBeNull()
    const nome = /export const TOKEN_DO_FUNDO = '(--[a-z-]+)'/.exec(cena)?.[1]
    expect(nome, 'TOKEN_DO_FUNDO sumiu de scene/app.ts').toBeDefined()
    expect([...(await cores())]).toContain(nome!.slice(2))
  })

  it('o valor de reserva da cena é o mesmo do token', async () => {
    // Ele só entra quando o CSS ainda não chegou, e por isso envelhece sem ninguém ver: ficou
    // marrom por duas trocas de mundo visual. Um número que diverge do token é o mesmo bug de
    // novo, só que dentro do prazo em que a folha carrega.
    const cena = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'scene', 'app.ts'), 'utf8')
    const reserva = /const FUNDO_PADRAO = 0x([0-9a-f]{6})/.exec(cena)?.[1]
    const folha = await readFile(join(ESTILOS, 'tokens.css'), 'utf8')
    const token = /^\s*--fundo:\s*(#[0-9a-f]{6});/im.exec(folha)?.[1]
    expect(reserva, 'FUNDO_PADRAO sumiu de scene/app.ts').toBeDefined()
    expect(token, '--fundo sumiu de tokens.css').toBeDefined()
    expect(`#${reserva}`).toBe(token)
  })
})

/**
 * O `DESIGN.md` é a descrição do sistema; `tokens.css` é o sistema. Quando os dois divergem, a
 * descrição vira mentira — e mentira documentada é pior que documentação nenhuma. Aconteceu duas
 * vezes na troca do mundo visual: o sidecar ficou apontando para cores removidas, e a paleta de
 * tipos sumiu do frontmatter enquanto o CSS seguia usando.
 */
describe('a descrição do sistema bate com o sistema', () => {
  const DESIGN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'DESIGN.md')

  it('toda cor que o DESIGN.md declara existe como token, e vice-versa', async () => {
    const doc = await readFile(DESIGN, 'utf8')
    const frontmatter = doc.split('---')[1] ?? ''
    const naDoc = new Set([...frontmatter.matchAll(/^ {2}([a-z0-9-]+):\s*"#/gm)].map((m) => m[1]!))
    const noCodigo = await cores()

    expect([...naDoc].filter((c) => !noCodigo.has(c)), 'documentadas mas inexistentes').toEqual([])
    expect([...noCodigo].filter((c) => !naDoc.has(c)), 'existentes mas não documentadas').toEqual([])
  })

  it('toda cor citada na prosa do DESIGN.md está na paleta que ele mesmo declara', async () => {
    const doc = await readFile(DESIGN, 'utf8')
    const frontmatter = doc.split('---')[1] ?? ''
    const declaradas = new Set([...frontmatter.matchAll(/^ {2}([a-z0-9-]+):\s*"#/gm)].map((m) => m[1]!))
    const citadas = [...doc.matchAll(/\{colors\.([a-z0-9-]+)\}/g)].map((m) => m[1]!)
    expect([...new Set(citadas)].filter((c) => !declaradas.has(c))).toEqual([])
  })
})
