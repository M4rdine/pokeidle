import type { AppContext } from '../app-context.js'

/** Verdade do servidor: o `/me` diz se há hunt ativa. O espelho do estado sobrevive à parada. */
export const hasActiveHunt = (ctx: AppContext): boolean => Boolean(ctx.session.get().me?.trainer.activeHuntId)
