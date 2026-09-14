import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/client.js'
import { trainers, type TrainerRow } from '../db/schema.js'
import { AppError } from '../http/errors.js'

const percent = z.number().int().min(0).max(100)
export const SettingsPatchSchema = z.object({
  returnHpPercent: percent.optional(),
  capture: z.object({ ballTier: z.enum(['poke', 'great', 'ultra', 'best']).optional(), maxWildHpPercent: percent.optional(), allowDuplicates: z.boolean().optional() }).strict().optional(),
}).strict()
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>

export async function updateSettings(db: Db, trainerId: string, patch: SettingsPatch, now: Date): Promise<TrainerRow> {
  const set = {
    updatedAt: now,
    ...(patch.returnHpPercent !== undefined && { returnHpPercent: patch.returnHpPercent }),
    ...(patch.capture?.ballTier !== undefined && { ballTier: patch.capture.ballTier }),
    ...(patch.capture?.maxWildHpPercent !== undefined && { maxWildHpPercent: patch.capture.maxWildHpPercent }),
    ...(patch.capture?.allowDuplicates !== undefined && { allowDuplicates: patch.capture.allowDuplicates }),
  }
  const [row] = await db.update(trainers).set(set).where(eq(trainers.id, trainerId)).returning()
  if (!row) throw new AppError('not-found', 'treinador não encontrado')
  return row
}
