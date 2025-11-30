import assert from "node:assert";
import { describe, it } from "node:test";

import { HazardUnit, decodeHazardInfo } from "../../src/core/cpu/Pipeline";

const buildPayload = (instruction: number) => ({ pc: 0, instruction });

// Helper to quickly generate opcodes without assembler dependency.
const opcode = (value: number) => value << 26;
const rs = (value: number) => value << 21;
const rt = (value: number) => value << 16;
const rd = (value: number) => value << 11;

// Representative instructions encoded manually to keep the tests focused on hazard semantics.
const LW_T0_0_T1 = opcode(0x23) | rs(9) | rt(8); // lw $t0, 0($t1)
const ADD_T1_T0_T0 = opcode(0x00) | rs(8) | rt(8) | rd(9); // add $t1, $t0, $t0
const SW_T1_0_T0 = opcode(0x2b) | rs(8) | rt(9); // sw $t1, 0($t0)
const ADDI_T0_ZERO_1 = opcode(0x08) | rt(8) | 1; // addi $t0, $zero, 1
const JAL = opcode(0x03); // jal

// HI/LO transfer: mfhi $t0
const MFHI_T0 = opcode(0x00) | rd(8) | 0x10;

// Load to $zero should not produce hazards on sources reading $zero.
const LW_ZERO_0_ZERO = opcode(0x23); // lw $zero, 0($zero)

const hazardUnit = new HazardUnit();

describe("HazardUnit", () => {
  it("detects load-use hazards for dependent decodes", () => {
    const decodingHazard = decodeHazardInfo(ADD_T1_T0_T0);
    const { loadUseHazard, structuralHazard } = hazardUnit.detect(decodingHazard, buildPayload(LW_T0_0_T1), null);

    assert.strictEqual(loadUseHazard, true);
    assert.strictEqual(structuralHazard, false);
  });

  it("ignores load-use hazards when the destination is $zero", () => {
    const decodingHazard = decodeHazardInfo(ADD_T1_T0_T0);
    const { loadUseHazard } = hazardUnit.detect(decodingHazard, buildPayload(LW_ZERO_0_ZERO), null);

    assert.strictEqual(loadUseHazard, false);
  });

  it("flags structural hazards when memory stage accesses shared memory", () => {
    const decodingHazard = decodeHazardInfo(ADDI_T0_ZERO_1);
    const { structuralHazard } = hazardUnit.detect(decodingHazard, null, buildPayload(SW_T1_0_T0));

    assert.strictEqual(structuralHazard, true);
  });

  it("propagates control metadata for branch and jump operations", () => {
    const branchHazard = decodeHazardInfo(JAL);
    assert.strictEqual(branchHazard.isControl, true);
    assert.strictEqual(branchHazard.destination, 31);

    const hiLoHazard = decodeHazardInfo(MFHI_T0);
    assert.deepStrictEqual(hiLoHazard.sources, [33]);
    assert.strictEqual(hiLoHazard.destination, 8);
  });
});
