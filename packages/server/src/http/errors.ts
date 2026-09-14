export type ErrorCode =
  | 'validation' | 'invalid-credentials' | 'unauthorized' | 'forbidden' | 'not-found'
  | 'email-taken' | 'name-taken' | 'starter-already-chosen' | 'no-starter' | 'hunt-active' | 'no-hunt'
  | 'payload-too-large' | 'rate-limited' | 'internal'

export const STATUS_BY_CODE: Readonly<Record<ErrorCode, number>> = {
  validation: 400, 'invalid-credentials': 401, unauthorized: 401, forbidden: 403, 'not-found': 404,
  'email-taken': 409, 'name-taken': 409, 'starter-already-chosen': 409, 'no-starter': 409, 'hunt-active': 409, 'no-hunt': 409,
  'payload-too-large': 413, 'rate-limited': 429, internal: 500,
}

export class AppError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    this.name = 'AppError'
  }
  get status(): number { return STATUS_BY_CODE[this.code] }
}

export const errorBody = (code: ErrorCode, message: string) => ({ error: { code, message } })
