import { describe, expect, it } from 'vitest'
import { AppError, errorBody, STATUS_BY_CODE } from '../src/http/errors.js'

describe('AppError', () => {
  it('carrega código, status e corpo', () => {
    const e = new AppError('hunt-active', 'já existe hunt')
    expect(e).toBeInstanceOf(Error)
    expect(e.status).toBe(409)
    expect(errorBody(e.code, e.message)).toEqual({ error: { code: 'hunt-active', message: 'já existe hunt' } })
  })
  it('tabela de status cobre todos os códigos', () => {
    expect(STATUS_BY_CODE).toEqual({
      validation: 400, 'invalid-credentials': 401, unauthorized: 401, forbidden: 403, 'not-found': 404,
      'email-taken': 409, 'name-taken': 409, 'starter-already-chosen': 409, 'no-starter': 409, 'hunt-active': 409, 'no-hunt': 409,
      locked: 409, 'insufficient-gold': 409,
      'payload-too-large': 413, 'rate-limited': 429, internal: 500,
    })
  })
})
