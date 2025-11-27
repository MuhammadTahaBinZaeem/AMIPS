import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: bigint): number => Number(value & 0xffffffffn);

export function registerDsll32Instruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x00) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const rd = (instruction >>> 11) & 0x1f;
    const shamt = (instruction >>> 6) & 0x1f;
    const funct = instruction & 0x3f;

    if (rs !== 0 || funct !== 0x3c) return null;

    const shiftAmount = shamt + 32;

    return {
      name: "dsll32",
      execute: (state: MachineState) => {
        const value = BigInt(state.getRegister(rt)) & 0xffffffffn;
        const result = (value << BigInt(shiftAmount)) & 0xffffffffffffffffn;
        state.setRegister(rd, toInt32(result));
      },
    };
  });
}
