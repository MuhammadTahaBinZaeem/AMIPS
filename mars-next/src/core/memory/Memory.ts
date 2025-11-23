export class Memory {
  private readonly bytes = new Map<number, number>();

  reset(): void {
    this.bytes.clear();
  }

  loadWord(address: number): number {
    return this.readWord(address);
  }

  readWord(address: number): number {
    const normalizedAddress = this.validateWordAddress(address);

    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.readByte(normalizedAddress + i);
    }
    return value | 0;
  }

  /**
   * Convenience wrapper used by debugger subsystems to read either a word (aligned) or a single byte (unaligned).
   */
  read(address: number): number {
    if (address % 4 === 0) {
      return this.readWord(address);
    }

    return this.readByte(address);
  }

  writeWord(address: number, value: number): void {
    const normalizedAddress = this.validateWordAddress(address);

    for (let i = 0; i < 4; i++) {
      const shift = 24 - 8 * i;
      this.writeByte(normalizedAddress + i, (value >>> shift) & 0xff);
    }
  }

  readByte(address: number): number {
    const normalizedAddress = this.validateAddress(address);
    return this.bytes.get(normalizedAddress) ?? 0;
  }

  writeByte(address: number, value: number): void {
    const normalizedAddress = this.validateAddress(address);
    this.bytes.set(normalizedAddress, value & 0xff);
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

  private validateAddress(address: number): number {
    if (!Number.isInteger(address)) {
      throw new RangeError(`Invalid memory address: ${address}`);
    }

    return address >>> 0;
  }

  private validateWordAddress(address: number): number {
    const normalizedAddress = this.validateAddress(address);
    if (normalizedAddress % 4 !== 0) {
      throw new RangeError(`Unaligned word address: ${address}`);
    }
    return normalizedAddress;
  }
}
