export class BinaryReader {
  private offset = 0

  private constructor(private readonly view: DataView) {}

  static fromBuffer(buf: Uint8Array): BinaryReader {
    return new BinaryReader(new DataView(buf.buffer, buf.byteOffset, buf.byteLength))
  }

  get position(): number {
    return this.offset
  }

  get length(): number {
    return this.view.byteLength
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.view.byteLength) {
      throw new RangeError(`seek para ${pos} fora do buffer de ${this.view.byteLength} bytes`)
    }
    this.offset = pos
  }

  u8(): number {
    this.ensure(1)
    const value = this.view.getUint8(this.offset)
    this.offset += 1
    return value
  }

  u16(): number {
    this.ensure(2)
    const value = this.view.getUint16(this.offset, true)
    this.offset += 2
    return value
  }

  u32(): number {
    this.ensure(4)
    const value = this.view.getUint32(this.offset, true)
    this.offset += 4
    return value
  }

  bytes(n: number): Uint8Array {
    this.ensure(n)
    const start = this.view.byteOffset + this.offset
    const out = new Uint8Array(this.view.buffer.slice(start, start + n))
    this.offset += n
    return out
  }

  private ensure(n: number): void {
    if (this.offset + n > this.view.byteLength) {
      throw new RangeError(
        `leitura de ${n} bytes na posição ${this.offset} ultrapassa o buffer de ${this.view.byteLength} bytes`,
      )
    }
  }
}
