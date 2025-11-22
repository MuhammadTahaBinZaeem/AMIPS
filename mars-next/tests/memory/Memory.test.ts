import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Memory } from "../../src/core/memory/Memory";
import { MemoryMap } from "../../src/core/memory/MemoryMap";

function createMemory(): Memory {
  const map = new MemoryMap({
    textBase: 0x00000000,
    textSize: 0x1000,
    dataBase: 0x00001000,
    dataSize: 0x2000,
    heapBase: 0x00002000,
    stackBase: 0x00005000,
    stackSize: 0x1000,
    mmioBase: 0x00006000,
    mmioSize: 0x1000,
  });

  return new Memory({ map });
}

describe("Memory", () => {
  it("stores and retrieves a word", () => {
    const memory = createMemory();
    const address = 0x1000;
    const value = 0x12345678;

    memory.writeWord(address, value);
    assert.equal(memory.readWord(address), value >>> 0);
  });

  it("rejects misaligned word accesses", () => {
    const memory = createMemory();

    assert.throws(() => memory.writeWord(0x1001, 0xdeadbeef), /unaligned/i);
    assert.throws(() => memory.readWord(0x1001), /unaligned/i);
  });

  it("throws on out-of-bounds access", () => {
    const memory = createMemory();

    assert.throws(() => memory.readByte(0x9000), /out of bounds/i);
    assert.throws(() => memory.writeByte(0x9000, 0xff), /out of bounds/i);
  });

  it("maps data and heap segments separately", () => {
    const memory = createMemory();
    const dataAddress = 0x1004;
    const heapAddress = 0x2008;

    memory.writeWord(dataAddress, 0x0badcafe);
    memory.writeWord(heapAddress, 0xfeedbeef);

    assert.equal(memory.readWord(dataAddress), 0x0badcafe >>> 0);
    assert.equal(memory.readWord(heapAddress), 0xfeedbeef >>> 0);
  });
});
