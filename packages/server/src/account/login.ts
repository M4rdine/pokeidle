import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { dummyHashFor, verifyPassword, type HashOptions } from '../auth/password.js'
import { createSession } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { trainers, users, type TrainerRow, type UserRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const LoginSchema = z
  .object({ email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(1).max(128) })
  .strict()
export type LoginInput = z.infer<typeof LoginSchema>

const invalid = () => new AppError('invalid-credentials', 'e-mail ou senha inválidos')

export async function login(db: Db, input: LoginInput, opts: { now: Date; hash: HashOptions }): Promise<{ user: UserRow; trainer: TrainerRow; token: string }> {
  const [row] = await db.select({ user: users, trainer: trainers }).from(users).innerJoin(trainers, eq(trainers.userId, users.id)).where(eq(users.email, input.email))
  if (!row) {
    await verifyPassword(await dummyHashFor(opts.hash), input.password)
    throw invalid()
  }
  if (!(await verifyPassword(row.user.passwordHash, input.password))) throw invalid()
  const token = await createSession(db, row.user.id, opts.now)
  return { user: row.user, trainer: row.trainer, token }
}
