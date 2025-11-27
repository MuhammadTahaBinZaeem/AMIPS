import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: number): number => value | 0;

export function registerSebInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1f) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const shamt = (instruction >>> 6) & 0x1f;
    const funct = instruction & 0x3f;
    if (funct !== 0x10 || rs !== 0 || shamt !== 0) return null;

    const rd = (instruction >>> 11) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;

    return {
      name: "seb",
      execute: (state: MachineState) => {
        const value = state.getRegister(rt);
        state.setRegister(rd, toInt32((value << 24) >> 24));
      },
    };
  });
}
