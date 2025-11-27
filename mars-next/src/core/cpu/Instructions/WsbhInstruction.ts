import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: number): number => value | 0;

export function registerWsbhInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1f) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const rd = (instruction >>> 11) & 0x1f;
    const shamt = (instruction >>> 6) & 0x1f;
    const funct = instruction & 0x3f;

    if (rs !== 0 || shamt !== 0x02 || funct !== 0x20) return null;

    return {
      name: "wsbh",
      execute: (state: MachineState) => {
        const value = state.getRegister(rt);
        const swapped = ((value & 0x00ff00ff) << 8) | ((value & 0xff00ff00) >>> 8);
        state.setRegister(rd, toInt32(swapped));
      },
    };
  });
}
