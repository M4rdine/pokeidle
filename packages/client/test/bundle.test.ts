/**
 * O PixiJS não pode entrar no pedaço inicial do build.
 *
 * Entrar, escolher o inicial e escolher o destino são três telas de DOM puro. Enquanto a cena era
 * importada estaticamente, quem abria a tela de entrar baixava o motor de renderização inteiro
 * para ver um formulário de e-mail e senha: o pedaço inicial era 445 KB, e virou 164 KB no dia em
 * que a cena passou a chegar por `import()`.
 *
 * Este teste guarda a REGRA, e não o número do build: um `import` estático de qualquer módulo da
 * cena, em qualquer lugar do caminho que sai de `main.ts`, desfaz a separação sem erro nenhum —
 * o build continua verde, a tela continua funcionando, e só o tempo até a primeira tela piora.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src')
const ENTRADA = join(SRC, 'main.ts')

const semComentario = (texto: string): string =>
  texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/**
 * Os especificadores que este arquivo puxa DE VERDADE para o pacote.
 *
 * `import type` fica de fora porque o TypeScript o apaga — é justamente assim que `game.ts`
 * continua declarando o tipo `Scene` sem carregar a cena. `import()` também fica de fora: ele é o
 * mecanismo que estamos protegendo, não uma violação dele.
 */
function importesEstaticos(fonte: string): string[] {
  const texto = semComentario(fonte)
  const achados: string[] = []
  // `import ... from 'x'` e `export ... from 'x'`, com a cláusula sem quebra de contrato: o grupo
  // do meio não pode conter `(`, que é o que separa `import x from` de `import('x')`.
  for (const m of texto.matchAll(/(?:^|\n)\s*(import|export)\s+([^'"();]*?)\s*from\s*['"]([^'"]+)['"]/g)) {
    if (m[1] === 'import' && /^type\s/.test(m[2]!.trim())) continue
    achados.push(m[3]!)
  }
  // `import 'x'` puro, que é como as folhas de estilo entram.
  for (const m of texto.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) achados.push(m[1]!)
  return achados
}

/** Tudo que o pacote inicial carrega, seguindo só os caminhos relativos e só os estáticos. */
async function alcancavelDaEntrada(): Promise<Map<string, readonly string[]>> {
  const vistos = new Map<string, readonly string[]>()
  const fila = [ENTRADA]
  while (fila.length > 0) {
    const arquivo = fila.pop()!
    if (vistos.has(arquivo)) continue
    const fonte = await readFile(arquivo, 'utf8')
    const especificadores = importesEstaticos(fonte)
    vistos.set(arquivo, especificadores)
    for (const spec of especificadores) {
      if (!spec.startsWith('.')) continue
      // O projeto é ESM e escreve `.js` no import mesmo em TypeScript.
      const alvo = resolve(dirname(arquivo), spec.replace(/\.js$/, '.ts'))
      if (alvo.endsWith('.ts')) fila.push(alvo)
    }
  }
  return vistos
}

describe('o pedaço inicial não carrega o motor de renderização', () => {
  it('nenhum módulo alcançável de main.ts importa pixi.js estaticamente', async () => {
    const grafo = await alcancavelDaEntrada()
    const infratores = [...grafo]
      .filter(([, specs]) => specs.includes('pixi.js'))
      .map(([arquivo]) => relative(SRC, arquivo))
    expect(infratores).toEqual([])
  })

  it('a âncora: a cena existe, importa pixi, e NÃO está no alcance estático da entrada', async () => {
    /*
     * Sem esta âncora o teste acima passaria por engano no dia em que o caminhamento quebrasse —
     * um grafo vazio não tem infrator nenhum. Ela confirma as duas pontas: que ainda existe módulo
     * com PixiJS, e que ele está do lado de fora do pacote inicial.
     */
    const cena = await readFile(join(SRC, 'scene', 'app.ts'), 'utf8')
    expect(importesEstaticos(cena)).toContain('pixi.js')

    const grafo = await alcancavelDaEntrada()
    expect(grafo.size).toBeGreaterThan(20)
    expect([...grafo.keys()].map((f) => relative(SRC, f))).not.toContain(join('scene', 'app.ts'))
  })

  it('a tela do jogo declara o tipo da cena sem carregá-la', async () => {
    // `import type` some na compilação; trocar por `import` normal aqui é a forma mais provável de
    // o PixiJS voltar ao pacote inicial sem ninguém perceber.
    const tela = await readFile(join(SRC, 'ui', 'screens', 'game.ts'), 'utf8')
    expect(tela).toMatch(/import type \{ Scene \} from '\.\.\/\.\.\/scene\/app\.js'/)
    expect(tela).toMatch(/import\('\.\.\/\.\.\/scene\/app\.js'\)/)
  })
})
