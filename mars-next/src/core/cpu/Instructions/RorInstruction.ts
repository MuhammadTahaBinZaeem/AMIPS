import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: number): number => value | 0;

const rotateRight = (value: number, amount: number): number => {
  const shift = amount & 0x1f;
  if (shift === 0) return toInt32(value);
  return toInt32((value >>> shift) | (value << (32 - shift)));
};

export function registerRorInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x00) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const funct = instruction & 0x3f;
    if (funct !== 0x02 || rs !== 0x01) return null;

    const rt = (instruction >>> 16) & 0x1f;
    const rd = (instruction >>> 11) & 0x1f;
    const shamt = (instruction >>> 6) & 0x1f;

    return {
      name: "rotr",
      execute: (state: MachineState) => {
        const value = state.getRegister(rt);
        state.setRegister(rd, rotateRight(value, shamt));
      },
    };
  });
}
