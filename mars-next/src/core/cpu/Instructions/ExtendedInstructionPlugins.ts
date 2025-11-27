import { MachineState } from "../../state/MachineState";
import { registerInstructionPlugin } from ".";

const toInt32 = (value: number): number => value | 0;

const rotateRight = (value: number, amount: number): number => {
  const shift = amount & 0x1f;
  if (shift === 0) return toInt32(value);
  return toInt32((value >>> shift) | (value << (32 - shift)));
};

const createExtExecutor = (rs: number, rt: number, position: number, sizeField: number) => {
  const width = sizeField + 1;
  const mask = width >= 32 ? 0xffffffff : (1 << width) - 1;

  return {
    name: "ext",
    execute: (state: MachineState) => {
      const value = state.getRegister(rs) >>> 0;
      const extracted = (value >>> position) & mask;
      state.setRegister(rt, toInt32(extracted));
    },
  };
};

const createInsExecutor = (rs: number, rt: number, position: number, sizeField: number) => {
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
};

const createSebExecutor = (rd: number, rt: number) => ({
  name: "seb",
  execute: (state: MachineState) => {
    const value = state.getRegister(rt);
    state.setRegister(rd, toInt32((value << 24) >> 24));
  },
});

const createSehExecutor = (rd: number, rt: number) => ({
  name: "seh",
  execute: (state: MachineState) => {
    const value = state.getRegister(rt);
    state.setRegister(rd, toInt32((value << 16) >> 16));
  },
});

const createRotrExecutor = (rd: number, rt: number, shamt: number) => ({
  name: "rotr",
  execute: (state: MachineState) => {
    const value = state.getRegister(rt);
    state.setRegister(rd, rotateRight(value, shamt));
  },
});

export function registerExtendedInstructionPlugins(): void {
  registerInstructionPlugin((instruction) => {
    const opcode = (instruction >>> 26) & 0x3f;

    if (opcode === 0x1f) {
      const rs = (instruction >>> 21) & 0x1f;
      const rt = (instruction >>> 16) & 0x1f;
      const rd = (instruction >>> 11) & 0x1f;
      const shamt = (instruction >>> 6) & 0x1f;
      const funct = instruction & 0x3f;

      switch (funct) {
        case 0x00:
          return createExtExecutor(rs, rt, rd, shamt);
        case 0x04:
          return createInsExecutor(rs, rt, rd, shamt);
        case 0x10:
          return createSebExecutor(rd, rt);
        case 0x18:
          return createSehExecutor(rd, rt);
        default:
          break;
      }
    }

    if (opcode === 0x00) {
      const rs = (instruction >>> 21) & 0x1f;
      const rt = (instruction >>> 16) & 0x1f;
      const rd = (instruction >>> 11) & 0x1f;
      const shamt = (instruction >>> 6) & 0x1f;
      const funct = instruction & 0x3f;

      if (funct === 0x02 && rs === 0x01) {
        return createRotrExecutor(rd, rt, shamt);
      }
    }

    return null;
  });
}
