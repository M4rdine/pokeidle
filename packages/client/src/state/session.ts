import type { SocketStatus } from '../api/ws.js'
import type { HuntSummary, Me } from '../api/dto.js'

export type Screen = 'loading' | 'auth' | 'starter' | 'hunts' | 'game'
export interface SessionState { readonly screen: Screen; readonly me: Me | null; readonly hunts: readonly HuntSummary[]; readonly socket: SocketStatus; readonly error: string | null }
export const screenFor = (me: Me | null): Screen => !me ? 'auth' : !me.trainer.hasStarter ? 'starter' : me.trainer.activeHuntId ? 'game' : 'hunts'
export const initialSession = (): SessionState => ({ screen: 'loading', me: null, hunts: [], socket: 'closed', error: null })
export const withMe = (s: SessionState, me: Me | null): SessionState => ({ ...s, me, screen: screenFor(me) })
