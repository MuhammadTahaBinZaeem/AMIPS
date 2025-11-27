import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

export function registerClzInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1c) return null;

    const funct = instruction & 0x3f;
    if (funct !== 0x20) return null;

    const rd = (instruction >>> 11) & 0x1f;
    const rs = (instruction >>> 21) & 0x1f;

    return {
      name: "clz",
      execute: (state: MachineState) => {
        const value = state.getRegister(rs) >>> 0;
        const count = Math.clz32(value);
        state.setRegister(rd, count);
      },
    };
  });
}
