import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: bigint): number => Number(value & 0xffffffffn);

const createMask = (width: number): bigint => {
  if (width >= 64) return 0xffffffffffffffffn;
  return (1n << BigInt(width)) - 1n;
};

export function registerDinsInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1f) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const sizeField = (instruction >>> 11) & 0x1f;
    const position = (instruction >>> 6) & 0x1f;
    const funct = instruction & 0x3f;

    if (funct !== 0x07) return null;

    const width = sizeField + 1;
    if (position + width > 64) {
      throw new RangeError(`dins width (${width}) with position ${position} exceeds register size`);
    }

    const mask = createMask(width);

    return {
      name: "dins",
      execute: (state: MachineState) => {
        const source = BigInt(state.getRegister(rs)) & mask;
        const target = BigInt(state.getRegister(rt)) & 0xffffffffffffffffn;
        const cleared = target & ~(mask << BigInt(position));
        const inserted = (source & mask) << BigInt(position);
        const result = cleared | inserted;
        state.setRegister(rt, toInt32(result));
      },
    };
  });
}
