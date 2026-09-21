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
 * Variáveis que o JavaScript define em tempo de execução, via `style.setProperty`. Elas não
 * aparecem em folha nenhuma de propósito — o valor depende do estado do jogo.
 */
const EM_TEMPO_DE_EXECUCAO: readonly string[] = [
  '--cd',      // fração de recarga de cada golpe, em hud/moves.ts
  '--fracao',  // altura da barra de atributo-base, em ui/species/stats.ts
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
    const noCodigo = new Set([...(await definidos())]
      .map((t) => t.slice(2))
      .filter((n) => !n.startsWith('space-') && !n.startsWith('border-') && n !== 'bisel'))

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
