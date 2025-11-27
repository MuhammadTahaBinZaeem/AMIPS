import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

export function registerCloInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1c) return null;

    const funct = instruction & 0x3f;
    if (funct !== 0x21) return null;

    const rd = (instruction >>> 11) & 0x1f;
    const rs = (instruction >>> 21) & 0x1f;

    return {
      name: "clo",
      execute: (state: MachineState) => {
        const value = state.getRegister(rs) >>> 0;
        let mask = 0x80000000;
        let count = 0;

        while (mask !== 0 && (value & mask) !== 0) {
          count++;
          mask >>>= 1;
        }

        state.setRegister(rd, count);
      },
    };
  });
}
