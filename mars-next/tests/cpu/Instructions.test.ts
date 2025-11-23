import assert from "node:assert";
import { describe, test } from "node:test";

import { decodeInstruction } from "../../src/core/cpu/Instructions";
import { Memory } from "../../src/core/memory/Memory";
import { DEFAULT_TEXT_BASE, MachineState } from "../../src/core/state/MachineState";

const buildR = (rs: number, rt: number, rd: number, shamt: number, funct: number) =>
  ((rs << 21) | (rt << 16) | (rd << 11) | (shamt << 6) | funct) >>> 0;

const buildI = (opcode: number, rs: number, rt: number, immediate: number) =>
  ((opcode << 26) | (rs << 21) | (rt << 16) | (immediate & 0xffff)) >>> 0;

const buildCop1 = (fmt: number, ft: number, fs: number, fd: number, funct: number) =>
  ((0x11 << 26) | (fmt << 21) | (ft << 16) | (fs << 11) | (fd << 6) | funct) >>> 0;

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

    const xori = decodeInstruction(buildI(0x0e, 0, 11, 0xffff), DEFAULT_TEXT_BASE);
    assert.ok(xori);
    xori!.execute(state);
    assert.strictEqual(state.getRegister(11), 0x0000ffff);

    const xor = decodeInstruction(buildR(8, 9, 12, 0, 0x26), DEFAULT_TEXT_BASE);
    assert.ok(xor);
    xor!.execute(state);
    assert.strictEqual(state.getRegister(12), 0x0000ff07);
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

    state.setFloatRegisterSingle(8, Math.fround(-2.9));
    const truncWsDecoded = decodeInstruction(buildCop1(0x10, 0, 8, 6, 0x0d), DEFAULT_TEXT_BASE);
    assert.ok(truncWsDecoded);
    truncWsDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterBits(6), -2);

    state.setFloatRegisterDouble(8, 7.9);
    const truncWdDecoded = decodeInstruction(buildCop1(0x11, 0, 8, 10, 0x0d), DEFAULT_TEXT_BASE);
    assert.ok(truncWdDecoded);
    truncWdDecoded!.execute(state);
    assert.strictEqual(state.getFloatRegisterBits(10), 7);
  });

  test("decodes and executes memory load/store instructions", () => {
    const state = new MachineState();
    const memory = new Memory();
    const base = 0x10010000;

    state.setRegister(1, base); // $at
    memory.writeWord(base, 0x11223344);
    memory.writeByte(base + 4, 0x80);
    memory.writeByte(base + 5, 0xfe);
    memory.writeByte(base + 6, 0x12);
    memory.writeByte(base + 7, 0x34);
    memory.writeByte(base + 8, 0x80);
    memory.writeByte(base + 9, 0x01);

    const lw = decodeInstruction(buildI(0x23, 1, 2, 0), DEFAULT_TEXT_BASE);
    lw?.execute(state, memory);
    assert.strictEqual(state.getRegister(2), 0x11223344 | 0);

    const lb = decodeInstruction(buildI(0x20, 1, 3, 4), DEFAULT_TEXT_BASE);
    lb?.execute(state, memory);
    assert.strictEqual(state.getRegister(3), -128);

    const lbu = decodeInstruction(buildI(0x24, 1, 4, 5), DEFAULT_TEXT_BASE);
    lbu?.execute(state, memory);
    assert.strictEqual(state.getRegister(4), 0xfe);

    const lh = decodeInstruction(buildI(0x21, 1, 5, 6), DEFAULT_TEXT_BASE);
    lh?.execute(state, memory);
    assert.strictEqual(state.getRegister(5), 0x1234);

    const lhu = decodeInstruction(buildI(0x25, 1, 6, 8), DEFAULT_TEXT_BASE);
    lhu?.execute(state, memory);
    assert.strictEqual(state.getRegister(6), 0x8001);

    state.setRegister(7, 0x55667788);
    const sw = decodeInstruction(buildI(0x2b, 1, 7, 12), DEFAULT_TEXT_BASE);
    sw?.execute(state, memory);
    assert.strictEqual(memory.readWord(base + 12), 0x55667788 | 0);

    state.setRegister(8, 0xaabbccdd);
    const sh = decodeInstruction(buildI(0x29, 1, 8, 18), DEFAULT_TEXT_BASE);
    sh?.execute(state, memory);
    assert.strictEqual(memory.readByte(base + 18), 0xcc);
    assert.strictEqual(memory.readByte(base + 19), 0xdd);

    state.setRegister(9, 0x12345678);
    const sb = decodeInstruction(buildI(0x28, 1, 9, 22), DEFAULT_TEXT_BASE);
    sb?.execute(state, memory);
    assert.strictEqual(memory.readByte(base + 22), 0x78);

    const swl = decodeInstruction(buildI(0x2a, 1, 8, 1), DEFAULT_TEXT_BASE);
    swl?.execute(state, memory);
    assert.strictEqual(memory.readByte(base), 0xbb);
    assert.strictEqual(memory.readByte(base + 1), 0xaa);

    const swr = decodeInstruction(buildI(0x2e, 1, 8, 6), DEFAULT_TEXT_BASE);
    swr?.execute(state, memory);
    assert.strictEqual(memory.readByte(base + 6), 0xdd);
    assert.strictEqual(memory.readByte(base + 7), 0xcc);

    state.setFloatRegisterBits(2, 0x0bad1dea);
    const swc1 = decodeInstruction(buildI(0x39, 1, 2, 32), DEFAULT_TEXT_BASE);
    swc1?.execute(state, memory);
    assert.strictEqual(memory.readWord(base + 32), 0x0bad1dea | 0);
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

  test("decodes trap instructions", () => {
    const teqState = new MachineState();
    teqState.setRegister(8, 5);
    teqState.setRegister(9, 5);
    const teq = decodeInstruction(buildR(8, 9, 0, 0, 0x34), DEFAULT_TEXT_BASE);
    assert.ok(teq);
    assert.throws(() => teq!.execute(teqState));
    teqState.setRegister(9, 6);
    assert.doesNotThrow(() => teq!.execute(teqState));

    const unsignedState = new MachineState();
    unsignedState.setRegister(4, -1);
    unsignedState.setRegister(5, 1);
    const tgeu = decodeInstruction(buildR(4, 5, 0, 0, 0x31), DEFAULT_TEXT_BASE);
    assert.ok(tgeu);
    assert.throws(() => tgeu!.execute(unsignedState));
    unsignedState.setRegister(4, 0);
    unsignedState.setRegister(5, -1);
    assert.doesNotThrow(() => tgeu!.execute(unsignedState));

    const tltiu = decodeInstruction(buildI(0x01, 6, 0x0b, 4), DEFAULT_TEXT_BASE);
    assert.ok(tltiu);
    const immediateTrapState = new MachineState();
    immediateTrapState.setRegister(6, 3);
    assert.throws(() => tltiu!.execute(immediateTrapState));
    immediateTrapState.setRegister(6, 9);
    assert.doesNotThrow(() => tltiu!.execute(immediateTrapState));

    const teqi = decodeInstruction(buildI(0x01, 7, 0x0c, -1), DEFAULT_TEXT_BASE);
    assert.ok(teqi);
    const equalityTrapState = new MachineState();
    equalityTrapState.setRegister(7, -1);
    assert.throws(() => teqi!.execute(equalityTrapState));
    equalityTrapState.setRegister(7, 0);
    assert.doesNotThrow(() => teqi!.execute(equalityTrapState));
  });
});
