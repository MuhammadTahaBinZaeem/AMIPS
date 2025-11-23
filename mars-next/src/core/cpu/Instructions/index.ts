import { Cpu, DecodedInstruction } from "../Cpu";
import { MachineState } from "../../state/MachineState";
import { InstructionMemory } from "../Cpu";

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

function toInt32(value: number): number {
  return value | 0;
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
      default:
        return null;
    }
  }

  const decoded = decodeIType(instruction);

  switch (opcode) {
    case 0x08:
      return createImmediateBinary("addi", decoded, (l, imm) => l + imm);
    case 0x09:
      return createImmediateBinary("addiu", decoded, (l, imm) => l + imm);
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
    case 0x02:
      return makeJump(instruction, pc);
    case 0x03:
      return makeJumpAndLink(instruction, pc);
    default:
      return null;
  }
}

export const instructionSetPlaceholder = false;
export type InstructionExecutor = (state: MachineState, memory: InstructionMemory, cpu: Cpu) => void;
