export const SNAPSHOT_EVERY_TICKS = 50
export const SYNC_EVERY_TICKS = 300
export const CATCHUP_SLICE_TICKS = 250
/* O teto mora em `@pokeidle/shared`: o cliente precisa do mesmo número para explicá-lo. */
export { MAX_CATCHUP_TICKS } from '@pokeidle/shared'
export const MIN_CATCHUP_TICKS = 5
export const INTENT_MIN_INTERVAL_MS = 200
export const WS_MAX_MESSAGE_BYTES = 4096
export const WS_MAX_INVALID_IN_A_ROW = 3
export const WS_PING_MS = 30_000
export const WS_PONG_TIMEOUT_MS = 60_000
export const WS_SESSION_RECHECK_MS = 300_000
export const WS_MAX_SOCKETS_PER_TRAINER = 8
export const TICK_LAG_WARN_MS = 1000
export const PERSIST_MAX_FAILURES = 3
/** `hunt_log` tem 8 colunas escritas por linha; o Postgres tem um teto de 65 535 parâmetros
 * por statement. 500 linhas × 8 = 4 000 params por lote, bem abaixo do limite. */
export const LOG_INSERT_CHUNK = 500
