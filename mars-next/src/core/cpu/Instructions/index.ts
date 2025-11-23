import { Cpu, DecodedInstruction, InstructionMemory } from "../Cpu";
import { MachineState } from "../../state/MachineState";

interface RTypeFields {
  rs: number;
  rt: number;
  rd: number;
  shamt: number;
  funct: number;
}

interface ITypeFields {
  rs: number;
  rt: number;
  immediate: number;
}

function decodeRType(instruction: number): RTypeFields {
  return {
    rs: (instruction >>> 21) & 0x1f,
    rt: (instruction >>> 16) & 0x1f,
    rd: (instruction >>> 11) & 0x1f,
    shamt: (instruction >>> 6) & 0x1f,
    funct: instruction & 0x3f,
  };
}

function decodeIType(instruction: number): ITypeFields {
  return {
    rs: (instruction >>> 21) & 0x1f,
    rt: (instruction >>> 16) & 0x1f,
    immediate: instruction & 0xffff,
  };
}

function signExtend16(value: number): number {
  return (value << 16) >> 16;
}

function signExtend8(value: number): number {
  return (value << 24) >> 24;
}

function toInt32(value: number): number {
  return value | 0;
}

function validateHalfwordAddress(address: number): number {
  const normalized = address >>> 0;
  if (normalized % 2 !== 0) {
    throw new RangeError(`Unaligned halfword address: 0x${address.toString(16)}`);
  }
  return normalized;
}

function readHalfword(memory: InstructionMemory, address: number): number {
  const aligned = validateHalfwordAddress(address);
  return ((memory.readByte(aligned) << 8) | memory.readByte(aligned + 1)) & 0xffff;
}

function writeHalfword(memory: InstructionMemory, address: number, value: number): void {
  const aligned = validateHalfwordAddress(address);
  memory.writeByte(aligned, (value >>> 8) & 0xff);
  memory.writeByte(aligned + 1, value & 0xff);
}

function clampFloatToWord(value: number): number {
  if (!Number.isFinite(value)) {
    return value > 0 ? 0x7fffffff : value < 0 ? 0x80000000 : 0;
  }
  if (value >= 0x7fffffff) return 0x7fffffff;
  if (value <= -0x80000000) return -0x80000000;
  return toInt32(Math.trunc(value));
}

function ceilFloatToWord(value: number): number {
  if (!Number.isFinite(value) || value < -0x80000000 || value > 0x7fffffff) {
    return 0x7fffffff;
  }
  return toInt32(Math.ceil(value));
}

const createRegisterBinary = (
  name: string,
  decoded: RTypeFields,
  op: (left: number, right: number) => number,
): DecodedInstruction => {
  const { rd, rs, rt } = decoded;
  return {
    name,
    execute: (state: MachineState) => {
      const result = toInt32(op(state.getRegister(rs), state.getRegister(rt)));
      state.setRegister(rd, result);
    },
  };
};

const createImmediateBinary = (
  name: string,
  decoded: ITypeFields,
  op: (registerValue: number, immediate: number) => number,
  immediateTransform: (immediate: number) => number = signExtend16,
): DecodedInstruction => {
  const { rs, rt, immediate } = decoded;
  const transformed = immediateTransform(immediate);
  return {
    name,
    execute: (state: MachineState) => {
      const result = toInt32(op(state.getRegister(rs), transformed));
      state.setRegister(rt, result);
    },
  };
};

const makeSll = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, shamt } = decoded;
  return {
    name: "sll",
    execute: (state: MachineState) => {
      state.setRegister(rd, toInt32(state.getRegister(rt) << shamt));
    },
  };
};

const makeBranchEqual = (decoded: ITypeFields, pc: number): DecodedInstruction => {
  const { rs, rt, immediate } = decoded;
  const offset = signExtend16(immediate) << 2;
  const branchTarget = toInt32(pc + 4 + offset);

  return {
    name: "beq",
    execute: (state: MachineState) => {
      if (state.getRegister(rs) === state.getRegister(rt)) {
        state.registerDelayedBranch(branchTarget);
      }
    },
  };
};

const makeBranchNotEqual = (decoded: ITypeFields, pc: number): DecodedInstruction => {
  const { rs, rt, immediate } = decoded;
  const offset = signExtend16(immediate) << 2;
  const branchTarget = toInt32(pc + 4 + offset);

  return {
    name: "bne",
    execute: (state: MachineState) => {
      if (state.getRegister(rs) !== state.getRegister(rt)) {
        state.registerDelayedBranch(branchTarget);
      }
    },
  };
};

const makeJump = (instruction: number, pc: number): DecodedInstruction => {
  const targetField = instruction & 0x03ffffff;
  const branchTarget = ((pc + 4) & 0xf0000000) | (targetField << 2);

  return {
    name: "j",
    execute: (state: MachineState) => state.registerDelayedBranch(branchTarget),
  };
};

const makeJumpAndLink = (instruction: number, pc: number): DecodedInstruction => {
  const targetField = instruction & 0x03ffffff;
  const branchTarget = ((pc + 4) & 0xf0000000) | (targetField << 2);
  const returnAddress = toInt32(pc + 8);

  return {
    name: "jal",
    execute: (state: MachineState) => {
      state.setRegister(31, returnAddress);
      state.registerDelayedBranch(branchTarget);
    },
  };
};

const makeJumpRegister = (decoded: RTypeFields): DecodedInstruction => {
  const { rs } = decoded;
  return {
    name: "jr",
    execute: (state: MachineState) => {
      state.registerDelayedBranch(state.getRegister(rs));
    },
  };
};

const makeLoadUpperImmediate = (decoded: ITypeFields): DecodedInstruction => {
  const { rt, immediate } = decoded;
  return {
    name: "lui",
    execute: (state: MachineState) => {
      state.setRegister(rt, toInt32(immediate << 16));
    },
  };
};

const makeSyscall = (): DecodedInstruction => ({
  name: "syscall",
  execute: () => {
    throw new Error("Encountered syscall instruction without a SyscallTable wired");
  },
});

const makeNop = (): DecodedInstruction => ({
  name: "nop",
  execute: () => {
    /* intentionally empty */
  },
});

const makeAndImmediate = (decoded: ITypeFields): DecodedInstruction =>
  createImmediateBinary("andi", decoded, (l, imm) => l & imm, (imm) => imm & 0xffff);

const computeAddress = (decoded: ITypeFields, state: MachineState): number => {
  const { rs, immediate } = decoded;
  return toInt32(state.getRegister(rs) + signExtend16(immediate));
};

const makeLoadByte = (name: string, decoded: ITypeFields, signed: boolean): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name,
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      const value = memory.readByte(address);
      state.setRegister(rt, signed ? signExtend8(value) : value & 0xff);
    },
  };
};

const makeLoadHalf = (name: string, decoded: ITypeFields, signed: boolean): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name,
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      const value = readHalfword(memory, address);
      state.setRegister(rt, signed ? signExtend16(value) : value & 0xffff);
    },
  };
};

const makeLoadWord = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "lw",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      state.setRegister(rt, memory.readWord(address));
    },
  };
};

const makeStoreByte = (name: string, decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name,
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      memory.writeByte(address, state.getRegister(rt));
    },
  };
};

const makeStoreHalf = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "sh",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      writeHalfword(memory, address, state.getRegister(rt));
    },
  };
};

const makeStoreWord = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "sw",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      memory.writeWord(address, state.getRegister(rt));
    },
  };
};

const makeBranchOnReg = (
  name: string,
  decoded: ITypeFields,
  pc: number,
  predicate: (value: number) => boolean,
  withLink: boolean,
): DecodedInstruction => {
  const { rs, immediate } = decoded;
  const offset = signExtend16(immediate) << 2;
  const branchTarget = toInt32(pc + 4 + offset);
  const returnAddress = toInt32(pc + 8);

  return {
    name,
    execute: (state: MachineState) => {
      const value = state.getRegister(rs);
      if (predicate(value)) {
        if (withLink) {
          state.setRegister(31, returnAddress);
        }
        state.registerDelayedBranch(branchTarget);
      }
    },
  };
};

const makeBranchOnConditionFlag = (
  name: string,
  instruction: number,
  pc: number,
  expected: boolean,
): DecodedInstruction => {
  const conditionFlag = (instruction >>> 18) & 0x7;
  const immediate = instruction & 0xffff;
  const offset = signExtend16(immediate) << 2;
  const branchTarget = toInt32(pc + 4 + offset);

  return {
    name,
    execute: (state: MachineState) => {
      if (state.getFpuConditionFlag(conditionFlag) === expected) {
        state.registerDelayedBranch(branchTarget);
      }
    },
  };
};

const makeBreak = (): DecodedInstruction => ({
  name: "break",
  execute: () => {
    throw new Error("Encountered break instruction");
  },
});

const decodeCop1 = (instruction: number, pc: number): DecodedInstruction | null => {
  const fmt = (instruction >>> 21) & 0x1f;

  if (fmt === 0x08) {
    const isTrueBranch = ((instruction >>> 16) & 0x1) === 1;
    return makeBranchOnConditionFlag(isTrueBranch ? "bc1t" : "bc1f", instruction, pc, isTrueBranch);
  }

  const ft = (instruction >>> 16) & 0x1f;
  const fs = (instruction >>> 11) & 0x1f;
  const fd = (instruction >>> 6) & 0x1f;
  const funct = instruction & 0x3f;
  const conditionCode = (instruction >>> 8) & 0x7;

  const isSingle = fmt === 0x10;
  const isDouble = fmt === 0x11;
  const isWord = fmt === 0x14;

  const read = isSingle
    ? (register: number, state: MachineState) => state.getFloatRegisterSingle(register)
    : (register: number, state: MachineState) => state.getFloatRegisterDouble(register);
  const write = isSingle
    ? (register: number, state: MachineState, value: number) => state.setFloatRegisterSingle(register, value)
    : (register: number, state: MachineState, value: number) => state.setFloatRegisterDouble(register, value);

  switch (funct) {
    case 0x00:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "add.s" : "add.d",
        execute: (state: MachineState) => {
          const result = read(fs, state) + read(ft, state);
          write(fd, state, isSingle ? Math.fround(result) : result);
        },
      };
    case 0x03:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "div.s" : "div.d",
        execute: (state: MachineState) => {
          const result = read(fs, state) / read(ft, state);
          write(fd, state, isSingle ? Math.fround(result) : result);
        },
      };
    case 0x05:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "abs.s" : "abs.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          write(fd, state, isSingle ? Math.fround(Math.abs(value)) : Math.abs(value));
        },
      };
    case 0x0e:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "ceil.w.s" : "ceil.w.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          state.setFloatRegisterBits(fd, ceilFloatToWord(value));
        },
      };
    case 0x20:
      if (isDouble) {
        return {
          name: "cvt.s.d",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterDouble(fs);
            state.setFloatRegisterSingle(fd, Math.fround(value));
          },
        };
      }
      if (isWord) {
        return {
          name: "cvt.s.w",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterBits(fs);
            state.setFloatRegisterSingle(fd, Math.fround(value));
          },
        };
      }
      return null;
    case 0x21:
      if (isSingle) {
        return {
          name: "cvt.d.s",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterSingle(fs);
            state.setFloatRegisterDouble(fd, value);
          },
        };
      }
      if (isWord) {
        return {
          name: "cvt.d.w",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterBits(fs);
            state.setFloatRegisterDouble(fd, value);
          },
        };
      }
      return null;
    case 0x24:
      if (isSingle) {
        return {
          name: "cvt.w.s",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterSingle(fs);
            state.setFloatRegisterBits(fd, clampFloatToWord(value));
          },
        };
      }
      if (isDouble) {
        return {
          name: "cvt.w.d",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterDouble(fs);
            state.setFloatRegisterBits(fd, clampFloatToWord(value));
          },
        };
      }
      return null;
    case 0x32:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "c.eq.s" : "c.eq.d",
        execute: (state: MachineState) => {
          state.setFpuConditionFlag(conditionCode, read(fs, state) === read(ft, state));
        },
      };
    case 0x3e:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "c.le.s" : "c.le.d",
        execute: (state: MachineState) => {
          state.setFpuConditionFlag(conditionCode, read(fs, state) <= read(ft, state));
        },
      };
    case 0x3c:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "c.lt.s" : "c.lt.d",
        execute: (state: MachineState) => {
          state.setFpuConditionFlag(conditionCode, read(fs, state) < read(ft, state));
        },
      };
    default:
      return null;
  }
};

export function decodeInstruction(instruction: number, pc: number): DecodedInstruction | null {
  const opcode = (instruction >>> 26) & 0x3f;

  if (opcode === 0x00) {
    const decoded = decodeRType(instruction);

    switch (decoded.funct) {
      case 0x00:
        if (instruction === 0) return makeNop();
        return makeSll(decoded);
      case 0x08:
        return makeJumpRegister(decoded);
      case 0x0c:
        return makeSyscall();
      case 0x0d:
        return makeBreak();
      case 0x1a: {
        const { rs, rt } = decoded;
        return {
          name: "div",
          execute: (state: MachineState) => {
            const divisor = state.getRegister(rt);
            if (divisor === 0) return;
            const dividend = state.getRegister(rs);
            state.setHi(dividend % divisor);
            state.setLo(toInt32(dividend / divisor));
          },
        };
      }
      case 0x1b: {
        const { rs, rt } = decoded;
        return {
          name: "divu",
          execute: (state: MachineState) => {
            const divisor = state.getRegister(rt) >>> 0;
            if (divisor === 0) return;
            const dividend = state.getRegister(rs) >>> 0;
            state.setHi(toInt32((dividend % divisor) >>> 0));
            state.setLo(toInt32((dividend / divisor) >>> 0));
          },
        };
      }
      case 0x20:
        return createRegisterBinary("add", decoded, (l, r) => l + r);
      case 0x21:
        return createRegisterBinary("addu", decoded, (l, r) => l + r);
      case 0x22:
        return createRegisterBinary("sub", decoded, (l, r) => l - r);
      case 0x24:
        return createRegisterBinary("and", decoded, (l, r) => l & r);
      case 0x25:
        return createRegisterBinary("or", decoded, (l, r) => l | r);
      case 0x2a:
        return createRegisterBinary("slt", decoded, (l, r) => (l < r ? 1 : 0));
      default:
        return null;
    }
  }

  if (opcode === 0x1c) {
    const decoded = decodeRType(instruction);
    switch (decoded.funct) {
      case 0x02:
        return createRegisterBinary("mul", decoded, (l, r) => l * r);
      case 0x20: {
        const { rd, rs } = decoded;
        return {
          name: "clz",
          execute: (state: MachineState) => {
            const value = state.getRegister(rs) >>> 0;
            let count = 0;
            for (let bit = 31; bit >= 0 && ((value >>> bit) & 1) === 0; bit--) {
              count++;
            }
            state.setRegister(rd, count);
          },
        };
      }
      case 0x21: {
        const { rd, rs } = decoded;
        return {
          name: "clo",
          execute: (state: MachineState) => {
            const value = state.getRegister(rs) >>> 0;
            let count = 0;
            for (let bit = 31; bit >= 0 && ((value >>> bit) & 1) === 1; bit--) {
              count++;
            }
            state.setRegister(rd, count);
          },
        };
      }
      default:
        return null;
    }
  }

  if (opcode === 0x11) {
    const copDecoded = decodeCop1(instruction, pc);
    if (copDecoded) {
      return copDecoded;
    }
  }

  const decoded = decodeIType(instruction);

  switch (opcode) {
    case 0x08:
      return createImmediateBinary("addi", decoded, (l, imm) => l + imm);
    case 0x09:
      return createImmediateBinary("addiu", decoded, (l, imm) => l + imm);
    case 0x0c:
      return makeAndImmediate(decoded);
    case 0x0d:
      return createImmediateBinary("ori", decoded, (l, imm) => l | imm, (imm) => imm & 0xffff);
    case 0x0f:
      return makeLoadUpperImmediate(decoded);
    case 0x04:
      return makeBranchEqual(decoded, pc);
    case 0x05:
      return makeBranchNotEqual(decoded, pc);
    case 0x0a:
      return createImmediateBinary("slti", decoded, (l, imm) => (l < imm ? 1 : 0));
    case 0x01:
      switch (decoded.rt) {
        case 0x00:
          return makeBranchOnReg("bltz", decoded, pc, (value) => value < 0, false);
        case 0x01:
          return makeBranchOnReg("bgez", decoded, pc, (value) => value >= 0, false);
        case 0x10:
          return makeBranchOnReg("bltzal", decoded, pc, (value) => value < 0, true);
        case 0x11:
          return makeBranchOnReg("bgezal", decoded, pc, (value) => value >= 0, true);
        default:
          return null;
      }
    case 0x07:
      return makeBranchOnReg("bgtz", decoded, pc, (value) => value > 0, false);
    case 0x06:
      return makeBranchOnReg("blez", decoded, pc, (value) => value <= 0, false);
    case 0x02:
      return makeJump(instruction, pc);
    case 0x03:
      return makeJumpAndLink(instruction, pc);
    case 0x20:
      return makeLoadByte("lb", decoded, true);
    case 0x24:
      return makeLoadByte("lbu", decoded, false);
    case 0x21:
      return makeLoadHalf("lh", decoded, true);
    case 0x25:
      return makeLoadHalf("lhu", decoded, false);
    case 0x23:
      return makeLoadWord(decoded);
    case 0x28:
      return makeStoreByte("sb", decoded);
    case 0x29:
      return makeStoreHalf(decoded);
    case 0x2b:
      return makeStoreWord(decoded);
    default:
      return null;
  }
}

export const instructionSetPlaceholder = false;
export type InstructionExecutor = (state: MachineState, memory: InstructionMemory, cpu: Cpu) => void;
