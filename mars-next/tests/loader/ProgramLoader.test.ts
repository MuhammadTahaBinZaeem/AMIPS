import assert from "node:assert";
import { describe, test } from "node:test";

import { BinaryImage } from "../../src/core/assembler/Assembler";
import { ProgramLoader } from "../../src/core/loader/ProgramLoader";
import { Memory } from "../../src/core/memory/Memory";
import {
  DEFAULT_GLOBAL_POINTER,
  DEFAULT_STACK_POINTER,
  DEFAULT_TEXT_BASE,
  MachineState,
} from "../../src/core/state/MachineState";

const baseImage: BinaryImage = {
  textBase: DEFAULT_TEXT_BASE,
  dataBase: 0x10010000,
  text: [],
  data: [],
  dataWords: [],
  symbols: {},
};

describe("ProgramLoader", () => {
  test("loads text and initializes registers with relocation support", () => {
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();

    const image: BinaryImage = {
      ...baseImage,
      text: [0x11223344, 0xaabbccdd],
    };

    const relocationOffset = 0x2000;
    const layout = loader.loadProgram(state, image, { relocationOffset });

    assert.strictEqual(layout.entryPoint, DEFAULT_TEXT_BASE + relocationOffset);
    assert.strictEqual(state.getProgramCounter(), layout.entryPoint);
    assert.strictEqual(state.getRegister(0), 0);
    assert.strictEqual(state.getRegister(28), (DEFAULT_GLOBAL_POINTER + relocationOffset) | 0);
    assert.strictEqual(state.getRegister(29), (DEFAULT_STACK_POINTER + relocationOffset) | 0);
    assert.strictEqual(memory.readWord(layout.textBase), 0x11223344 | 0);
    assert.strictEqual(memory.readWord(layout.textBase + 4), 0xaabbccdd | 0);
  });

  test("places data bytes into memory at the data segment base", () => {
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();

    const dataBytes = [0xde, 0xad, 0xbe, 0xef, 0x01];
    loader.loadProgram(state, { ...baseImage, data: dataBytes });

    const dataBase = baseImage.dataBase;
    dataBytes.forEach((value, index) => {
      assert.strictEqual(memory.readByte(dataBase + index), value);
    });
  });

  test("clears previous contents when loading another program", () => {
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();

    loader.loadProgram(state, { ...baseImage, text: [0xffffffff] });
    assert.strictEqual(memory.readWord(DEFAULT_TEXT_BASE), 0xffffffff | 0);

    loader.loadProgram(state, { ...baseImage, text: [0x12345678] });
    assert.strictEqual(memory.readWord(DEFAULT_TEXT_BASE), 0x12345678);
    assert.strictEqual(memory.readWord(DEFAULT_TEXT_BASE + 4), 0);
  });
});

