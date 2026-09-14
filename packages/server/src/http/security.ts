import type { FastifyRequest } from 'fastify'

// `*.password`/`*.token` cobrem o campo um nível abaixo de qualquer chave (ex.: `body.password`);
// `password`/`token` sozinhos cobrem o caso de alguém logar o campo direto na raiz do objeto —
// fast-redact (usado pelo pino) não tem um wildcard recursivo, os dois precisam estar na lista.
export const REDACT_PATHS: readonly string[] = [
  'req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]',
  'password', '*.password', 'token', '*.token',
]

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

function originOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

/** S11: rotas que mudam estado só aceitam requisições da própria origem. */
export function checkOrigin(request: FastifyRequest, appOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method)) return true
  const origin = originOf(request.headers.origin) ?? originOf(request.headers.referer)
  return origin !== null && origin === new URL(appOrigin).origin
}
