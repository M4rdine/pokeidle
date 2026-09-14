import { describe, expect, it } from 'vitest'
import { TOOL_NAME } from '../src/index.js'

describe('scaffold', () => {
  it('exporta o nome da ferramenta', () => {
    expect(TOOL_NAME).toBe('@pokeidle/assets-tools')
  })
})
