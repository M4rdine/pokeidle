import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

export interface HashOptions { readonly memoryCost?: number; readonly timeCost?: number }

export function hashPassword(plain: string, options: HashOptions = {}): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, ...options })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain).catch(() => false)
}

const dummyHashCache = new Map<string, Promise<string>>()

/**
 * Hash de um segredo aleatório, com o MESMO custo do hash real (`options`), usado para igualar
 * o tempo de resposta quando o e-mail não existe (S7). Memoizado por combinação de opções para
 * não recalcular a cada tentativa de login.
 */
export function dummyHashFor(options: HashOptions): Promise<string> {
  const key = `${options.memoryCost ?? 'default'}:${options.timeCost ?? 'default'}`
  const cached = dummyHashCache.get(key)
  if (cached) return cached
  // Se o hash falhar (ex.: config inválida), tira a chave do cache antes de relançar — senão
  // toda chamada seguinte com as mesmas opções ficaria presa devolvendo a mesma promise já
  // rejeitada pra sempre, em vez de tentar de novo.
  const promise = hashPassword(randomBytes(32).toString('hex'), options).catch((error: unknown) => {
    dummyHashCache.delete(key)
    throw error
  })
  dummyHashCache.set(key, promise)
  return promise
}
