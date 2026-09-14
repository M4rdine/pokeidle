import type { FastifyRequest } from 'fastify'

export const REDACT_PATHS: readonly string[] = ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]', '*.password', '*.token']

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
