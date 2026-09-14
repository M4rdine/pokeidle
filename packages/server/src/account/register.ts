import { z } from 'zod'
import { hashPassword, type HashOptions } from '../auth/password.js'
import { createSession } from '../auth/session.js'
import type { Db } from '../db/client.js'
import { inventory, trainers, users, type TrainerRow, type UserRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

export const STARTER_INVENTORY: ReadonlyArray<{ itemId: string; quantity: number }> = [
  { itemId: 'poke-ball', quantity: 5 },
  { itemId: 'potion', quantity: 3 },
]

export const RegisterSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    password: z.string().min(8).max(128),
    name: z
      .string()
      .trim()
      .min(3)
      .max(16)
      .regex(/^[A-Za-z0-9 ]+$/, 'só letras, números e espaço'),
  })
  .strict()
export type RegisterInput = z.infer<typeof RegisterSchema>

export interface RegisterResult { readonly user: UserRow; readonly trainer: TrainerRow; readonly token: string }

export async function register(db: Db, input: RegisterInput, opts: { hash: HashOptions; now: Date }): Promise<RegisterResult> {
  const passwordHash = await hashPassword(input.password, opts.hash)
  return db.transaction(async (tx) => {
    const [user] = await tx.insert(users).values({ email: input.email, passwordHash }).onConflictDoNothing().returning()
    if (!user) throw new AppError('email-taken', 'e-mail já cadastrado')
    // Alvo explícito: `trainers` também tem `user_id` único (não pode colidir aqui, `user.id`
    // acabou de ser criado), mas sem `target` o ON CONFLICT DO NOTHING abafaria qualquer
    // conflito de qualquer constraint única da tabela, não só o de nome.
    const [trainer] = await tx.insert(trainers).values({ userId: user.id, name: input.name }).onConflictDoNothing({ target: trainers.name }).returning()
    if (!trainer) throw new AppError('name-taken', 'nome já em uso')
    await tx.insert(inventory).values(STARTER_INVENTORY.map((i) => ({ ...i, trainerId: trainer.id })))
    const token = await createSession(tx, user.id, opts.now)
    return { user, trainer, token }
  })
}
