import { buildProgram } from './cli.js'
import { createPokeApi } from './pokeapi.js'

buildProgram({ createApi: (o) => createPokeApi(o) })
  .parseAsync(process.argv)
  .catch((err: unknown) => {
    process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exitCode = 1
  })
