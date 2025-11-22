import assert from "node:assert";
import { describe, test } from "node:test";

import { ProgramMemory, Pipeline } from "../../src/core/cpu/Pipeline";
import { MachineState, DEFAULT_TEXT_BASE } from "../../src/core/state/MachineState";

function encodeRType(opcode: number, rs: number, rt: number, rd: number, shamt: number, funct: number): number {
  return (opcode << 26) | (rs << 21) | (rt << 16) | (rd << 11) | (shamt << 6) | funct;
}

function encodeIType(opcode: number, rs: number, rt: number, immediate: number): number {
  return (opcode << 26) | (rs << 21) | (rt << 16) | (immediate & 0xffff);
}

describe("Pipeline", () => {
  test("steps through arithmetic program and updates registers", () => {
    const program = [
      encodeIType(0x08, 0, 8, 5), // addi $t0, $zero, 5
      encodeIType(0x08, 0, 9, 7), // addi $t1, $zero, 7
      encodeRType(0x00, 8, 9, 10, 0, 0x20), // add $t2, $t0, $t1
    ];

    const state = new MachineState();
    const pipeline = new Pipeline({ memory: new ProgramMemory(program, state.getProgramCounter()), state });

    pipeline.step();
    assert.strictEqual(state.getRegister(8), 5);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 4) | 0);

    pipeline.step();
    assert.strictEqual(state.getRegister(9), 7);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 8) | 0);

    pipeline.step();
    assert.strictEqual(state.getRegister(10), 12);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 12) | 0);
  });

  test("branches with delay slot and updates PC correctly", () => {
    const offsetToTarget = 2; // jumps past one instruction after the delay slot
    const program = [
      encodeIType(0x08, 0, 8, 1), // addi $t0, $zero, 1
      encodeIType(0x08, 0, 9, 1), // addi $t1, $zero, 1
      encodeIType(0x04, 8, 9, offsetToTarget), // beq $t0, $t1, target
      encodeIType(0x08, 0, 2, 5), // delay slot: addi $v0, $zero, 5
      encodeIType(0x08, 0, 3, 9), // fall-through instruction if not taken
      encodeIType(0x08, 0, 4, 7), // branch target
    ];

    const state = new MachineState();
    const pipeline = new Pipeline({ memory: new ProgramMemory(program, state.getProgramCounter()), state });

    pipeline.step(); // addi t0
    pipeline.step(); // addi t1
    pipeline.step(); // beq, should register branch

    assert.ok(state.isBranchTriggered());
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 12) | 0);

    pipeline.step(); // delay slot executes
    assert.strictEqual(state.getRegister(2), 5);
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 20) | 0); // branch target

    pipeline.step(); // should execute branch target instruction
    assert.strictEqual(state.getRegister(4), 7);
  });

  test("falls through when branch condition fails", () => {
    const program = [
      encodeIType(0x08, 0, 8, 1), // addi $t0, $zero, 1
      encodeIType(0x08, 0, 9, 2), // addi $t1, $zero, 2
      encodeIType(0x04, 8, 9, 2), // beq $t0, $t1, target
      encodeIType(0x08, 0, 2, 5), // delay slot
      encodeIType(0x08, 0, 3, 9), // fall-through executes when branch not taken
      encodeIType(0x08, 0, 4, 7), // code after fall-through
    ];

    const state = new MachineState();
    const pipeline = new Pipeline({ memory: new ProgramMemory(program, state.getProgramCounter()), state });

    pipeline.run(6);

    assert.strictEqual(state.getRegister(2), 5); // delay slot always executed
    assert.strictEqual(state.getRegister(3), 9); // fall-through executed because branch not taken
    assert.strictEqual(state.getRegister(4), 7); // subsequent instruction also executed
    assert.strictEqual(state.getProgramCounter(), (DEFAULT_TEXT_BASE + 24) | 0);
  });
});
