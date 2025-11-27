import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: number): number => value | 0;

export function registerInsInstruction(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;
    if (opcode !== 0x1f) return null;

    const funct = instruction & 0x3f;
    if (funct !== 0x04) return null;

    const rs = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const position = (instruction >>> 11) & 0x1f;
    const sizeField = (instruction >>> 6) & 0x1f;

    const width = sizeField + 1;
    const mask = width >= 32 ? 0xffffffff : (1 << width) - 1;

    return {
      name: "ins",
      execute: (state: MachineState) => {
        const source = state.getRegister(rs);
        const target = state.getRegister(rt);
        const cleared = target & ~(mask << position);
        const inserted = (source & mask) << position;
        state.setRegister(rt, toInt32(cleared | inserted));
      },
    };
  });
}
