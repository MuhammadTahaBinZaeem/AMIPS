import assert from "node:assert";
import { describe, test } from "node:test";

import { Assembler } from "../../src/core/assembler/Assembler";
import { ProgramLoader } from "../../src/core/loader/ProgramLoader";
import { Memory } from "../../src/core/memory/Memory";
import {
  DEFAULT_GLOBAL_POINTER,
  DEFAULT_STACK_POINTER,
  DEFAULT_TEXT_BASE,
  MachineState,
} from "../../src/core/state/MachineState";

describe("ProgramLoader", () => {
  test("assembles and loads a program with initialized registers and segments", () => {
    const assembler = new Assembler();
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();

    const source = `
      .text
      main:
        addi $t0, $zero, 1
        addi $t1, $t0, 2
        jr $ra
        nop

      .data
      value: .word 0xdeadbeef
      msg:   .asciiz "ok"
    `;

    const image = assembler.assemble(source);
    const layout = loader.loadProgram(state, image);

    assert.strictEqual(layout.entryPoint, DEFAULT_TEXT_BASE);
    assert.strictEqual(layout.textBase, DEFAULT_TEXT_BASE);
    assert.strictEqual(layout.dataBase, image.dataBase);
    assert.strictEqual(state.getProgramCounter(), layout.entryPoint);

    image.text.forEach((word, index) => {
      assert.strictEqual(memory.readWord(layout.textBase + index * 4), word);
    });

    assert.strictEqual(memory.readWord(layout.dataBase), image.dataWords[0]);
    const encodedMsg = new TextEncoder().encode("ok");
    encodedMsg.forEach((byte, index) => {
      assert.strictEqual(memory.readByte(layout.dataBase + 4 + index), byte);
    });
    assert.strictEqual(memory.readByte(layout.dataBase + 4 + encodedMsg.length), 0); // nul terminator

    assert.strictEqual(state.getRegister(0), 0); // $zero preserved
    assert.strictEqual(state.getRegister(28), DEFAULT_GLOBAL_POINTER);
    assert.strictEqual(state.getRegister(29), DEFAULT_STACK_POINTER);
  });

  test("reloading a program clears memory and resets the machine state", () => {
    const assembler = new Assembler();
    const memory = new Memory();
    const loader = new ProgramLoader(memory);
    const state = new MachineState();

    const firstImage = assembler.assemble(`
      .text
        addi $t0, $zero, 1
      .data
        .word 0x11111111
    `);

    loader.loadProgram(state, firstImage);
    const firstTextAddress = firstImage.textBase;
    assert.strictEqual(memory.readWord(firstTextAddress), firstImage.text[0]);
    assert.strictEqual(memory.readWord(firstImage.dataBase), firstImage.dataWords[0]);

    // Dirty memory beyond the first program to ensure it is cleared on reload.
    memory.writeWord(firstTextAddress + 4, 0xabcdef01);

    const secondImage = assembler.assemble(`
      .text
        addi $t0, $zero, 2
    `);

    const layout = loader.loadProgram(state, secondImage);

    assert.strictEqual(memory.readWord(layout.textBase), secondImage.text[0]);
    assert.strictEqual(memory.readWord(layout.textBase + 4), 0); // cleared by memory.reset()
    assert.strictEqual(memory.readWord(firstImage.dataBase), 0); // previous data cleared

    assert.strictEqual(state.getProgramCounter(), layout.entryPoint);
    assert.strictEqual(state.getRegister(28), DEFAULT_GLOBAL_POINTER);
    assert.strictEqual(state.getRegister(29), DEFAULT_STACK_POINTER);
  });
});
