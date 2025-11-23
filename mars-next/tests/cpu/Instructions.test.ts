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

  test("decodes and executes division and bit count helpers", () => {
    const state = new MachineState();
    state.setRegister(8, -7);
    state.setRegister(9, 2);

    const div = 0x0109001a; // div $t0, $t1
    const divDecoded = decodeInstruction(div, DEFAULT_TEXT_BASE);
    assert.ok(divDecoded);
    divDecoded!.execute(state);
    assert.strictEqual(state.getHi(), -1);
    assert.strictEqual(state.getLo(), -3);

    state.setRegister(8, 10);
    state.setRegister(9, 3);

    const divu = 0x0109001b; // divu $t0, $t1
    const divuDecoded = decodeInstruction(divu, DEFAULT_TEXT_BASE);
    assert.ok(divuDecoded);
    divuDecoded!.execute(state);
    assert.strictEqual(state.getHi(), 1);
    assert.strictEqual(state.getLo(), 3);

    state.setRegister(9, 0x00f00000);
    const clz = 0x71204020; // clz $t0, $t1
    const clzDecoded = decodeInstruction(clz, DEFAULT_TEXT_BASE);
    assert.ok(clzDecoded);
    clzDecoded!.execute(state);
    assert.strictEqual(state.getRegister(8), 8);

    state.setRegister(9, 0xffff0000);
    const clo = 0x71204021; // clo $t0, $t1
    const cloDecoded = decodeInstruction(clo, DEFAULT_TEXT_BASE);
    assert.ok(cloDecoded);
    cloDecoded!.execute(state);
    assert.strictEqual(state.getRegister(8), 16);
  });

  test("decodes floating point conversions and rounding helpers", () => {
    const state = new MachineState();

    state.setFloatRegisterSingle(0, Math.fround(1.5));
    const cvtDs = 0x460000a1; // cvt.d.s $f2, $f0
    const cvtDsDecoded = decodeInstruction(cvtDs, DEFAULT_TEXT_BASE);
    assert.ok(cvtDsDecoded);
    cvtDsDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterDouble(2), 1.5);

    const cvtSd = 0x46201020; // cvt.s.d $f0, $f2
    const cvtSdDecoded = decodeInstruction(cvtSd, DEFAULT_TEXT_BASE);
    assert.ok(cvtSdDecoded);
    cvtSdDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterSingle(0), Math.fround(1.5));

    state.setFloatRegisterBits(4, 0xffffffff); // -1 in word format
    const cvtDw = 0x46802121; // cvt.d.w $f4, $f4
    const cvtDwDecoded = decodeInstruction(cvtDw, DEFAULT_TEXT_BASE);
    assert.ok(cvtDwDecoded);
    cvtDwDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterDouble(4), -1);

    const ceilWs = 0x4600218e; // ceil.w.s $f6, $f4
    state.setFloatRegisterSingle(4, Math.fround(3.2));
    const ceilWsDecoded = decodeInstruction(ceilWs, DEFAULT_TEXT_BASE);
    assert.ok(ceilWsDecoded);
    ceilWsDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterBits(6), 4);

    state.setFloatRegisterDouble(0, -3.8);
    const cvtWd = 0x46200124; // cvt.w.d $f4, $f0
    const cvtWdDecoded = decodeInstruction(cvtWd, DEFAULT_TEXT_BASE);
    assert.ok(cvtWdDecoded);
    cvtWdDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterBits(4), -3);
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
