import { randomBytes } from 'node:crypto'
import argon2 from 'argon2'

export interface HashOptions { readonly memoryCost?: number; readonly timeCost?: number }

export function hashPassword(plain: string, options: HashOptions = {}): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, ...options })
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain).catch(() => false)
}

/** Hash de um segredo aleatório, usado para igualar o tempo de resposta quando o e-mail não existe (S7). */
export const DUMMY_HASH: string = await hashPassword(randomBytes(32).toString('hex'), { memoryCost: 4096, timeCost: 1 })
