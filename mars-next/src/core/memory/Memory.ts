export class Memory {
  private readonly bytes = new Map<number, number>();

  read(address: number): number {
    return this.readWord(address);
  }

  write(address: number, value: number): void {
    this.writeWord(address, value);
  }

  readByte(address: number): number {
    this.validateAddress(address);
    return this.bytes.get(address) ?? 0;
  }

  writeByte(address: number, value: number): void {
    this.validateAddress(address);
    this.bytes.set(address, value & 0xff);
  }

  readWord(address: number): number {
    this.validateAddress(address);
    const b0 = this.readByte(address);
    const b1 = this.readByte(address + 1);
    const b2 = this.readByte(address + 2);
    const b3 = this.readByte(address + 3);
    return (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) | 0;
  }

  writeWord(address: number, value: number): void {
    this.validateAddress(address);
    const normalized = value | 0;
    this.writeByte(address, normalized & 0xff);
    this.writeByte(address + 1, (normalized >>> 8) & 0xff);
    this.writeByte(address + 2, (normalized >>> 16) & 0xff);
    this.writeByte(address + 3, (normalized >>> 24) & 0xff);
  }

  private validateAddress(address: number): void {
    if (!Number.isInteger(address) || address < 0) {
      throw new RangeError(`Invalid memory address: ${address}`);
    }
  }
}
