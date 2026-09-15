import type { ZodType } from 'zod'

export class ApiError extends Error {
  constructor(readonly code: string, readonly status: number, message: string) { super(message); this.name = 'ApiError' }
}
export interface HttpDeps { readonly fetch: typeof globalThis.fetch; readonly onUnauthorized: () => void }
export interface Http {
  get<T>(url: string, schema: ZodType<T>): Promise<T>
  post<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
  put<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
  patch<T>(url: string, body: unknown, schema: ZodType<T>): Promise<T>
}
const ErrorBody = (x: unknown): { code: string; message: string } | null => {
  const e = (x as { error?: { code?: unknown; message?: unknown } } | null)?.error
  return e && typeof e.code === 'string' && typeof e.message === 'string' ? { code: e.code, message: e.message } : null
}

export function createHttp(deps: HttpDeps): Http {
  const call = async <T>(method: string, url: string, body: unknown, schema: ZodType<T>): Promise<T> => {
    let res: Response
    try {
      res = await deps.fetch(url, { method, credentials: 'same-origin', headers: body === undefined ? {} : { 'content-type': 'application/json' }, ...(body !== undefined && { body: JSON.stringify(body) }) })
    } catch { throw new ApiError('network', 0, 'sem conexão com o servidor') }
    const json: unknown = res.status === 204 ? null : await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 401) deps.onUnauthorized()
      const e = ErrorBody(json)
      throw new ApiError(e?.code ?? 'internal', res.status, e?.message ?? `erro ${res.status}`)
    }
    const parsed = schema.safeParse(json)
    if (!parsed.success) throw new ApiError('bad-response', res.status, 'resposta inesperada do servidor')
    return parsed.data
  }
  return {
    get: (url, schema) => call('GET', url, undefined, schema),
    post: (url, body, schema) => call('POST', url, body, schema),
    put: (url, body, schema) => call('PUT', url, body, schema),
    patch: (url, body, schema) => call('PATCH', url, body, schema),
  }
}
