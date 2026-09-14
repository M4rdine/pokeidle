import { program } from './cli.js'

program.parseAsync(process.argv).catch((err: unknown) => {
  process.stderr.write(`erro: ${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
