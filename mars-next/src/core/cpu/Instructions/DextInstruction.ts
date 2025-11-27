import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: bigint): number => Number(value & 0xffffffffn);

const createMask = (width: number): bigint => {
  if (width >= 64) return 0xffffffffffffffffn;
  return (1n << BigInt(width)) - 1n;
};

export function registerDextInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1f) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const sizeField = (instruction >>> 11) & 0x1f;
    const position = (instruction >>> 6) & 0x1f;
    const funct = instruction & 0x3f;

    if (funct !== 0x03) return null;

    const width = sizeField + 1;
    if (position + width > 64) {
      throw new RangeError(`dext width (${width}) with position ${position} exceeds register size`);
    }

    const mask = createMask(width);

    return {
      name: "dext",
      execute: (state: MachineState) => {
        const value = BigInt(state.getRegister(rs)) & 0xffffffffn;
        const extracted = (value >> BigInt(position)) & mask;
        state.setRegister(rt, toInt32(extracted));
      },
    };
  });
}
