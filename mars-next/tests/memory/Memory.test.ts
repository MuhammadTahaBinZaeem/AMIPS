import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Memory } from "../../src/core/memory/Memory";
import { MemoryMap } from "../../src/core/memory/MemoryMap";

describe("Memory", () => {
  it("writes and reads 32-bit words", () => {
    const memory = new Memory();
    const address = 0x10000000;
    const value = 0x1234_5678;

    memory.writeWord(address, value);
    assert.equal(memory.readWord(address) >>> 0, value >>> 0);
  });

  it("writes and reads individual bytes", () => {
    const memory = new Memory();
    const baseAddress = 0x10000040;
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

  it("normalizes 32-bit addresses and rejects non-integer input", () => {
    const memory = new Memory();

    const kernelByteAddress = 0x8000_0000;
    memory.writeByte(-0x8000_0000, 0x11);
    assert.equal(memory.readByte(kernelByteAddress), 0x11);

    const kernelWordAddress = 0x9000_0000;
    memory.writeWord(-0x7000_0000, 0xfeedface);
    assert.equal(memory.readWord(kernelWordAddress) >>> 0, 0xfeedface);

    assert.throws(() => memory.writeWord(3.5, 0xbeef), /Invalid memory address/i);
  });

  it("translates through a TLB and enforces access rights", () => {
    const map = new MemoryMap();
    map.addTlbEntry({
      virtualPage: 0x00400000,
      physicalPage: 0x00001000,
      pageSize: 0x1000,
      rights: { read: true, write: true, execute: true },
    });

    map.addTlbEntry({
      virtualPage: 0x10000000,
      physicalPage: 0x00002000,
      pageSize: 0x1000,
      rights: { read: true, write: false, execute: false },
    });

    const memory = new Memory({ map });

    memory.writeWord(0x00400000, 0xfeedface);
    assert.equal(memory.readWord(0x00400000) >>> 0, 0xfeedface);
    assert.equal(memory.entries()[0]?.address, 0x00001000);

    assert.throws(() => memory.writeByte(0x10000010, 0xaa), /Access violation/i);
  });

  it("passes physical offsets to MMIO devices when a TLB remaps pages", () => {
    const map = new MemoryMap();
    const accessedOffsets: { read?: number; write?: number } = {};
    const device = {
      read(offset: number) {
        accessedOffsets.read = offset;
        return 0xbb;
      },
      write(offset: number) {
        accessedOffsets.write = offset;
      },
    };

    map.registerDevice(0x1f000000, 0x200, device);
    map.addTlbEntry({
      virtualPage: map.mmioBase,
      physicalPage: 0x1f000100,
      pageSize: 0x200,
      rights: { read: true, write: true, execute: false },
    });

    const memory = new Memory({ map });
    const virtualBase = map.mmioBase;

    memory.readByte(virtualBase);
    memory.writeByte(virtualBase + 3, 0xaa);

    assert.equal(accessedOffsets.read, 0x100);
    assert.equal(accessedOffsets.write, 0x103);
  });

  it("simulates data cache eviction and write-back", () => {
    const map = new MemoryMap();
    const memory = new Memory({
      map,
      dataCache: { size: 32, lineSize: 8, associativity: 1, writePolicy: "write-back" },
    });

    const setStride = 32; // lineSize * number of sets for this configuration
    const baseAddress = 0x10001000;
    memory.writeByte(baseAddress, 0x11);
    memory.writeByte(baseAddress + setStride, 0x22); // evicts the first line

    assert.equal(memory.readByte(baseAddress), 0x11);
    assert(memory.entries().some((entry) => entry.address === baseAddress));
  });
});
