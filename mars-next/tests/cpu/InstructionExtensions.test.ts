import assert from "node:assert";
import { describe, test } from "node:test";

import {
  clearInstructionExtensions,
  decodeInstruction,
  registerInstructionDefinitions,
  registerInstructionPlugin,
  registerJsonInstructionDefinitions,
  InstructionExecutor,
} from "../../src/core/cpu/Instructions";
import { MachineState, DEFAULT_TEXT_BASE } from "../../src/core/state/MachineState";

const resetExtensions = () => clearInstructionExtensions();

describe("Instruction decoder extensions", () => {
  test("prefers plugin decoders over built-ins", () => {
    resetExtensions();

    registerInstructionPlugin((instruction) => {
      if (instruction !== 0) return null;
      return {
        name: "custom-nop",
        execute: (state: MachineState) => {
          state.setRegister(1, 0x1234);
        },
      };
    });

    const decoded = decodeInstruction(0, DEFAULT_TEXT_BASE);
    assert.ok(decoded, "decoder should honor registered plugin");
    assert.strictEqual(decoded!.name, "custom-nop");

    const state = new MachineState();
    decoded!.execute(state);
    assert.strictEqual(state.getRegister(1), 0x1234);

    resetExtensions();
  });

  test("loads instruction definitions from JSON inputs", () => {
    resetExtensions();

    const handlers: Record<string, InstructionExecutor> = {
      writeConst: (state: MachineState) => {
        state.setRegister(2, 0xbeef);
      },
    };

    registerJsonInstructionDefinitions(
      [
        {
          name: "json-op",
          mask: 0xffffffff,
          pattern: 0xfeedbeef,
          handler: "writeConst",
        },
      ],
      handlers,
    );

    const decoded = decodeInstruction(0xfeedbeef, DEFAULT_TEXT_BASE);
    assert.ok(decoded, "decoder should use JSON-defined instruction");

    const state = new MachineState();
    decoded!.execute(state);
    assert.strictEqual(state.getRegister(2), 0xbeef);

    resetExtensions();
  });

  test("registers inline instruction definitions", () => {
    resetExtensions();

    registerInstructionDefinitions([
      {
        name: "inline-op",
        mask: 0xffff0000,
        pattern: 0xcafe0000,
        execute: (state: MachineState) => {
          state.setRegister(3, 0xcafe);
        },
      },
    ]);

    const decoded = decodeInstruction(0xcafe1111, DEFAULT_TEXT_BASE);
    assert.ok(decoded, "decoder should match inline definition");
    assert.strictEqual(decoded!.name, "inline-op");

    const state = new MachineState();
    decoded!.execute(state);
    assert.strictEqual(state.getRegister(3), 0xcafe);

    resetExtensions();
  });
});
