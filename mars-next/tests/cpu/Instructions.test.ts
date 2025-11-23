import assert from "node:assert";
import { describe, test } from "node:test";

import { decodeInstruction } from "../../src/core/cpu/Instructions";
import { DEFAULT_TEXT_BASE, MachineState } from "../../src/core/state/MachineState";

describe("Instruction decoding", () => {
  test("decodes and executes mul", () => {
    const state = new MachineState();
    state.setRegister(9, 6);
    state.setRegister(10, 7);

    const instruction = 0x712a4002; // mul $t0, $t1, $t2
    const decoded = decodeInstruction(instruction, DEFAULT_TEXT_BASE);

    assert.ok(decoded, "decoder should recognize mul");
    decoded!.execute(state);

    assert.strictEqual(state.getRegister(8), 42);
  });

  test("decodes common arithmetic and logic instructions", () => {
    const state = new MachineState();
    state.setRegister(8, 3);
    state.setRegister(9, 5);

    // addiu $t0, $t0, -1
    const addiu = 0x2508ffff;
    const addiuDecoded = decodeInstruction(addiu, DEFAULT_TEXT_BASE);
    assert.ok(addiuDecoded);
    addiuDecoded!.execute(state);
    assert.strictEqual(state.getRegister(8), 2);

    // ori $t1, $t1, 0xff00
    const ori = 0x3529ff00;
    const oriDecoded = decodeInstruction(ori, DEFAULT_TEXT_BASE);
    assert.ok(oriDecoded);
    oriDecoded!.execute(state);
    assert.strictEqual(state.getRegister(9), 0xff05);

    // slti $t2, $t0, 5
    const slti = 0x290a0005;
    const sltiDecoded = decodeInstruction(slti, DEFAULT_TEXT_BASE);
    assert.ok(sltiDecoded);
    sltiDecoded!.execute(state);
    assert.strictEqual(state.getRegister(10), 1);
  });

  test("decodes control flow helpers", () => {
    const state = new MachineState();

    // beq $zero, $zero, 4 (should schedule branch)
    const beq = 0x10000001;
    const beqDecoded = decodeInstruction(beq, DEFAULT_TEXT_BASE);
    assert.ok(beqDecoded);
    beqDecoded!.execute(state);
    assert.strictEqual(state.isBranchRegistered(), true);

    // j 0x00400000 (PC-relative high bits)
    const jump = 0x08000000;
    const jumpDecoded = decodeInstruction(jump, DEFAULT_TEXT_BASE);
    assert.ok(jumpDecoded);

    // jal 0x00400000 should set $ra
    const jal = 0x0c000000;
    const jalDecoded = decodeInstruction(jal, DEFAULT_TEXT_BASE);
    assert.ok(jalDecoded);
    jalDecoded!.execute(state);
    assert.strictEqual(state.getRegister(31), DEFAULT_TEXT_BASE + 8);
  });
});
