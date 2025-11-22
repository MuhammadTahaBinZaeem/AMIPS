export class Memory {
  private readonly bytes = new Map<number, number>();

  reset(): void {
    this.bytes.clear();
  }

  loadWord(address: number): number {
    return this.readWord(address);
  }

  readWord(address: number): number {
    this.validateWordAddress(address);

    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.readByte(address + i);
    }
    return value | 0;
  }

  writeWord(address: number, value: number): void {
    this.validateWordAddress(address);

    for (let i = 0; i < 4; i++) {
      const shift = 24 - 8 * i;
      this.writeByte(address + i, (value >>> shift) & 0xff);
    }
  }

  readByte(address: number): number {
    this.validateAddress(address);
    return this.bytes.get(address) ?? 0;
  }

  writeByte(address: number, value: number): void {
    this.validateAddress(address);
    this.bytes.set(address, value & 0xff);
  }

  writeBytes(baseAddress: number, values: number[]): void {
    values.forEach((value, index) => this.writeByte(baseAddress + index, value));
  }

  /**
   * Returns a snapshot of all written bytes sorted by address. Useful for simple UIs or debugging
   * scenarios where a read-only view of memory contents is needed.
   */
  entries(): Array<{ address: number; value: number }> {
    return [...this.bytes.entries()]
      .sort(([a], [b]) => a - b)
      .map(([address, value]) => ({ address, value }));
  }

  private validateAddress(address: number): void {
    if (!Number.isInteger(address) || address < 0) {
      throw new RangeError(`Invalid memory address: ${address}`);
    }
  }

  private validateWordAddress(address: number): void {
    this.validateAddress(address);
    if (address % 4 !== 0) {
      throw new RangeError(`Unaligned word address: ${address}`);
    }
  }
}
