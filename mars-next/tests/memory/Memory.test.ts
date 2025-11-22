import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Memory } from "../../src/core/memory/Memory";

describe("Memory", () => {
  it("writes and reads 32-bit words", () => {
    const memory = new Memory();
    const address = 0x100;
    const value = 0x1234_5678;

    memory.writeWord(address, value);
    assert.equal(memory.readWord(address) >>> 0, value >>> 0);
  });

  it("writes and reads individual bytes", () => {
    const memory = new Memory();
    const baseAddress = 0x40;
    const bytes = [0xde, 0xad, 0xbe, 0xef];

    bytes.forEach((byte, index) => memory.writeByte(baseAddress + index, byte));
    assert.equal(memory.readWord(baseAddress) >>> 0, 0xdeadbeef);
    assert.equal(memory.readByte(baseAddress + 3), 0xef);
  });

  it("throws on misaligned word access", () => {
    const memory = new Memory();

    assert.throws(() => memory.writeWord(0x102, 0xfeedface), /Unaligned word address/i);
    assert.throws(() => memory.readWord(0x10a), /Unaligned word address/i);
  });

  it("faults on invalid addresses", () => {
    const memory = new Memory();

    assert.throws(() => memory.writeByte(-1, 0x11), /Invalid memory address/i);
    assert.throws(() => memory.readByte(-4), /Invalid memory address/i);
    assert.throws(() => memory.writeWord(3.5, 0xbeef), /Invalid memory address/i);
  });
});
