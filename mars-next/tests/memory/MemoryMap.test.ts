import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { BinaryImage } from "../../src/core/assembler/Assembler";
import { ProgramLoader } from "../../src/core/loader/ProgramLoader";
import { Memory } from "../../src/core/memory/Memory";
import { MemoryMap } from "../../src/core/memory/MemoryMap";
import { MachineState } from "../../src/core/state/MachineState";

describe("MemoryMap", () => {
  it("identifies segments and offsets for valid addresses", () => {
    const map = new MemoryMap();

    const text = map.resolve(map.textBase);
    assert.equal(text.segment.name, "text");
    assert.equal(text.offset, 0);

    const data = map.resolve(map.dataBase + 0x10);
    assert.equal(data.segment.name, "data");
    assert.equal(data.offset, 0x10);

    const stack = map.resolve(map.stackBase - 0x20);
    assert.equal(stack.segment.name, "stack");
    assert.equal(stack.offset, 0x20);
  });

  it("raises a fault for addresses outside all segments", () => {
    const map = new MemoryMap();

    assert.throws(() => map.resolve(0x08000000), /out of bounds/i);
  });
});

describe("Program loading placement", () => {
  it("places text, data, and stack pointers in their respective segments", () => {
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();
    const map = new MemoryMap();

    const binary: BinaryImage = {
      textBase: map.textBase,
      dataBase: 0x10010000,
      ktextBase: 0x80000000,
      kdataBase: 0x90000000,
      text: [0x8fa40000, 0x27bdfff0],
      data: [0xaa, 0xbb, 0xcc, 0xdd],
      ktext: [],
      kdata: [],
      dataWords: [],
      kdataWords: [],
      symbols: {},
    };

    const layout = loader.loadProgram(state, binary);

    const textPlacement = map.resolve(layout.textBase);
    assert.equal(textPlacement.segment.name, "text");
    assert.equal(memory.readWord(layout.textBase) >>> 0, binary.text[0] >>> 0);
    assert.equal(memory.readWord(layout.textBase + 4) >>> 0, binary.text[1] >>> 0);

    const dataPlacement = map.resolve(layout.dataBase);
    assert.equal(dataPlacement.segment.name, "data");
    assert.equal(memory.readByte(layout.dataBase), 0xaa);
    assert.equal(memory.readByte(layout.dataBase + 3), 0xdd);

    const stackPointer = state.getRegister(29);
    const stackPlacement = map.resolve(stackPointer);
    assert.equal(stackPlacement.segment.name, "stack");
  });
});
