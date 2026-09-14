import { deleteSession } from '../auth/session.js'
import type { Db } from '../db/client.js'

export async function logout(db: Db, token: string | undefined): Promise<void> {
  if (token) await deleteSession(db, token)
}
