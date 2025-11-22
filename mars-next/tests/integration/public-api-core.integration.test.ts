import assert from "node:assert";
import { describe, test } from "node:test";

import {
  MachineState,
  Memory,
  Pipeline,
  ProgramLoader,
  SyscallTable,
  TerminalDevice,
  assemble,
  createDefaultSyscallHandlers,
  type InstructionDecoder,
} from "../../src/core";

const SYSCALL_WORD = 0x0000000c;

function createDecoder(syscalls: SyscallTable): InstructionDecoder {
  const signExtend16 = (value: number) => (value << 16) >> 16;

  return {
    decode: (instruction) => {
      if (instruction === SYSCALL_WORD) {
        return {
          name: "syscall",
          execute: (state) => syscalls.handle(state.getRegister(2), state),
        };
      }

      const opcode = (instruction >>> 26) & 0x3f;

      if (opcode === 0x00) {
        const rs = (instruction >>> 21) & 0x1f;
        const rt = (instruction >>> 16) & 0x1f;
        const rd = (instruction >>> 11) & 0x1f;
        const funct = instruction & 0x3f;

        if (funct === 0x20) {
          return {
            name: "add",
            execute: (state) => {
              state.setRegister(rd, (state.getRegister(rs) + state.getRegister(rt)) | 0);
            },
          };
        }

        if (instruction === 0) {
          return { name: "nop", execute: () => {} };
        }

        return null;
      }

      if (opcode === 0x08) {
        const rs = (instruction >>> 21) & 0x1f;
        const rt = (instruction >>> 16) & 0x1f;
        const immediate = signExtend16(instruction & 0xffff);

        return {
          name: "addi",
          execute: (state) => {
            state.setRegister(rt, (state.getRegister(rs) + immediate) | 0);
          },
        };
      }

      return null;
    },
  };
}

describe("core public API integration", () => {
  test("assembles, loads, runs, and wires syscalls through devices", () => {
    const source = [
      ".data",
      "seed: .word 0x11223344",
      ".text",
      "addi $t0, $zero, 2",
      "addi $t1, $zero, 3",
      "add $a0, $t0, $t1", // => 5
      "addi $v0, $zero, 1", // print_int
      "syscall",
      "addi $v0, $zero, 10", // exit
      "syscall",
    ].join("\n");

    const image = assemble(source);

    const memory = new Memory();
    const state = new MachineState();
    const loader = new ProgramLoader(memory);
    loader.loadProgram(state, image);

    const terminal = new TerminalDevice();
    const syscalls = new SyscallTable(memory, { terminal }, createDefaultSyscallHandlers({ terminal }));
    const decoder = createDecoder(syscalls);
    const pipeline = new Pipeline({ memory, state, decoder });

    let safetyCounter = 0;
    while (!pipeline.isHalted() && safetyCounter < 32) {
      pipeline.step();
      safetyCounter += 1;
    }

    assert.ok(state.isTerminated(), "program should terminate via syscall 10");
    assert.deepStrictEqual(terminal.getOutputLog(), ["5"], "syscall 1 should print computed value");
    assert.strictEqual(state.getRegister(8), 2); // $t0
    assert.strictEqual(state.getRegister(9), 3); // $t1
    assert.strictEqual(state.getRegister(4), 5); // $a0

    // Verify data segment was loaded into memory by the loader.
    assert.strictEqual(memory.readWord(image.dataBase), 0x11223344);
    assert.ok(safetyCounter < 32, "execution should complete in a handful of steps");
  });
});
