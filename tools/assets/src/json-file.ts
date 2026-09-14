import { readFile } from 'node:fs/promises'

/** Lê um arquivo JSON do disco; erros de sintaxe citam o caminho do arquivo. */
export async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8')
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}
