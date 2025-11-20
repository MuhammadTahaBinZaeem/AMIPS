import assert from "node:assert";
import { describe, test } from "node:test";

import {
  DEFAULT_GLOBAL_POINTER,
  DEFAULT_STACK_POINTER,
  DEFAULT_TEXT_BASE,
  MachineState,
} from "../../src/core/state/MachineState";

describe("MachineState", () => {
  test("initializes registers and pc to legacy defaults", () => {
    const state = new MachineState();

    assert.strictEqual(state.getProgramCounter(), DEFAULT_TEXT_BASE | 0);
    assert.strictEqual(state.getRegister(28), DEFAULT_GLOBAL_POINTER | 0);
    assert.strictEqual(state.getRegister(29), DEFAULT_STACK_POINTER | 0);
    assert.strictEqual(state.getHi(), 0);
    assert.strictEqual(state.getLo(), 0);
  });

  test("enforces $zero immutability", () => {
    const state = new MachineState();
    state.setRegister(0, 1234);

    assert.strictEqual(state.getRegister(0), 0);
  });

  test("tracks delayed branch lifecycle", () => {
    const state = new MachineState();
    state.setProgramCounter(0);
    state.registerDelayedBranch(0x40);

    assert.ok(state.isBranchRegistered());
    assert.strictEqual(state.getDelayedBranchTarget(), 0x40 | 0);

    // First finalization toggles to triggered without moving the PC.
    state.finalizeDelayedBranch();
    assert.ok(state.isBranchTriggered());
    assert.strictEqual(state.getProgramCounter(), 0);

    // Second finalization performs the jump and clears the flag.
    state.finalizeDelayedBranch();
    assert.strictEqual(state.getProgramCounter(), 0x40 | 0);
    assert.ok(!state.isBranchRegistered());
    assert.ok(!state.isBranchTriggered());
  });
});

