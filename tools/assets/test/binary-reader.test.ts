import { describe, expect, it } from 'vitest'
import { BinaryReader } from '../src/binary-reader.js'

describe('BinaryReader', () => {
  const bytes = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0xaa, 0xbb])

  it('lê u8, u16 e u32 em little-endian avançando o cursor', () => {
    const r = BinaryReader.fromBuffer(bytes)
    expect(r.u8()).toBe(0x01)
    expect(r.u16()).toBe(0x0302)
    expect(r.u32()).toBe(0x07060504)
    expect(r.position).toBe(7)
  })

  it('lê um bloco de bytes e faz seek', () => {
    const r = BinaryReader.fromBuffer(bytes)
    r.seek(7)
    expect(Array.from(r.bytes(2))).toEqual([0xaa, 0xbb])
    expect(r.length).toBe(9)
  })

  it('lança RangeError ao ler além do fim', () => {
    const r = BinaryReader.fromBuffer(bytes)
    r.seek(8)
    expect(() => r.u16()).toThrow(RangeError)
  })

  it('lança RangeError em seek fora do buffer', () => {
    const r = BinaryReader.fromBuffer(bytes)
    expect(() => r.seek(10)).toThrow(RangeError)
  })

  it('respeita o byteOffset de uma subarray', () => {
    const r = BinaryReader.fromBuffer(bytes.subarray(7))
    expect(r.u8()).toBe(0xaa)
  })

  it('seek para exatamente length sucede', () => {
    const r = BinaryReader.fromBuffer(bytes)
    expect(() => r.seek(r.length)).not.toThrow()
    expect(r.position).toBe(9)
  })

  it('lê quando offset === length lança RangeError', () => {
    const r = BinaryReader.fromBuffer(bytes)
    r.seek(r.length)
    expect(() => r.u8()).toThrow(RangeError)
  })
})
