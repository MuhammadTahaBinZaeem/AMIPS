import { AddressError } from "../../exceptions/AccessExceptions";
import { MachineState } from "../../state/MachineState";
import { Cpu, DecodedInstruction, InstructionMemory } from "../Cpu";
import { AccessType } from "../../memory/MemoryMap";
import { ArithmeticOverflow, SyscallException } from "../../exceptions/ExecutionExceptions";

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

function checkedAdd(left: number, right: number): number {
  const result = toInt32(left + right);
  const overflow = ((left ^ result) & (right ^ result)) < 0;
  if (overflow) {
    throw new ArithmeticOverflow();
  }
  return result;
}

function checkedSub(left: number, right: number): number {
  const result = toInt32(left - right);
  const overflow = ((left ^ right) & (left ^ result)) < 0;
  if (overflow) {
    throw new ArithmeticOverflow();
  }
  return result;
}

function validateHalfwordAddress(address: number, access: AccessType): number {
  const normalized = address >>> 0;
  if (normalized % 2 !== 0) {
    throw new AddressError(address, access, `Unaligned halfword address: 0x${address.toString(16)}`);
  }
  return normalized;
}

function readHalfword(memory: InstructionMemory, address: number): number {
  const aligned = validateHalfwordAddress(address, "read");
  return ((memory.readByte(aligned) << 8) | memory.readByte(aligned + 1)) & 0xffff;
}

function writeHalfword(memory: InstructionMemory, address: number, value: number): void {
  const aligned = validateHalfwordAddress(address, "write");
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

function roundFloatToNearestEvenWord(value: number): number {
  if (!Number.isFinite(value) || value < -0x80000000 || value > 0x7fffffff) {
    return 0x7fffffff;
  }

  const floorValue = Math.floor(value);
  const ceilValue = Math.ceil(value);
  const distanceToFloor = value - floorValue;
  const distanceToCeil = ceilValue - value;

  if (distanceToFloor === distanceToCeil) {
    return toInt32(ceilValue % 2 === 0 ? ceilValue : floorValue);
  }

  return toInt32(distanceToFloor < distanceToCeil ? floorValue : ceilValue);
}

function ceilFloatToWord(value: number): number {
  if (!Number.isFinite(value) || value < -0x80000000 || value > 0x7fffffff) {
    return 0x7fffffff;
  }
  return toInt32(Math.ceil(value));
}

function floorFloatToWord(value: number): number {
  if (!Number.isFinite(value) || value < -0x80000000 || value > 0x7fffffff) {
    return 0x7fffffff;
  }
  return toInt32(Math.floor(value));
}

function setByteInWord(word: number, byteIndex: number, byteValue: number): number {
  const masked = byteValue & 0xff;
  const shift = byteIndex << 3;
  const cleared = word & ~(0xff << shift);
  return toInt32(cleared | (masked << shift));
}

const extractByteFromWord = (word: number, byteIndex: number): number => (word >>> (byteIndex << 3)) & 0xff;

function composeHiLo(hi: number, lo: number): bigint {
  return (BigInt(hi) << 32n) | (BigInt(lo) & 0xffffffffn);
}

function splitToHiLo(value: bigint): { hi: number; lo: number } {
  const hi = Number((value >> 32n) & 0xffffffffn);
  const lo = Number(value & 0xffffffffn);
  return { hi, lo };
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

const makeSrl = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, shamt } = decoded;
  return {
    name: "srl",
    execute: (state: MachineState) => {
      state.setRegister(rd, toInt32(state.getRegister(rt) >>> shamt));
    },
  };
};

const makeSra = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, shamt } = decoded;
  return {
    name: "sra",
    execute: (state: MachineState) => {
      state.setRegister(rd, toInt32(state.getRegister(rt) >> shamt));
    },
  };
};

const makeSllv = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, rs } = decoded;
  return {
    name: "sllv",
    execute: (state: MachineState) => {
      const shift = state.getRegister(rs) & 0x1f;
      state.setRegister(rd, toInt32(state.getRegister(rt) << shift));
    },
  };
};

const makeSrlv = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, rs } = decoded;
  return {
    name: "srlv",
    execute: (state: MachineState) => {
      const shift = state.getRegister(rs) & 0x1f;
      state.setRegister(rd, toInt32(state.getRegister(rt) >>> shift));
    },
  };
};

const makeSrav = (decoded: RTypeFields): DecodedInstruction => {
  const { rd, rt, rs } = decoded;
  return {
    name: "srav",
    execute: (state: MachineState) => {
      const shift = state.getRegister(rs) & 0x1f;
      state.setRegister(rd, toInt32(state.getRegister(rt) >> shift));
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

const makeJumpAndLinkRegister = (decoded: RTypeFields, pc: number): DecodedInstruction => {
  const { rd, rs } = decoded;
  const destination = rd === 0 ? 31 : rd;
  const returnAddress = toInt32(pc + 8);

  return {
    name: "jalr",
    execute: (state: MachineState) => {
      state.setRegister(destination, returnAddress);
      state.registerDelayedBranch(state.getRegister(rs));
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
  execute: (state: MachineState) => {
    throw new SyscallException(state.getRegister(2));
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

const makeExclusiveOr = (decoded: RTypeFields): DecodedInstruction =>
  createRegisterBinary("xor", decoded, (l, r) => l ^ r);

const makeExclusiveOrImmediate = (decoded: ITypeFields): DecodedInstruction =>
  createImmediateBinary("xori", decoded, (l, imm) => l ^ imm, (imm) => imm & 0xffff);

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

const makeLoadLinked = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "ll",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      state.setRegister(rt, memory.readWord(address));
      state.setLoadLinkedReservation(address);
    },
  };
};

const makeLoadWordLeft = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "lwl",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      let result = state.getRegister(rt);
      const offset = address % 4;
      const alignedAddress = address - offset;
      for (let i = 0; i < 4 - offset; i++) {
        result = setByteInWord(
          result,
          3 - i,
          memory.readByte(alignedAddress + i)
        );
      }
      state.setRegister(rt, result);
    },
  };
};

const makeLoadWordRight = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "lwr",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      let result = state.getRegister(rt);
      const offset = address % 4;
      const alignedAddress = address - offset;
      for (let i = 0; i <= offset; i++) {
        result = setByteInWord(
          result,
          offset - i,
          memory.readByte(alignedAddress + (3 - offset) + i)
        );
      }
      state.setRegister(rt, result);
    },
  };
};

const makeLoadWordCop1 = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "lwc1",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      state.setFloatRegisterBits(rt, memory.readWord(address));
    },
  };
};

const makeLoadDoubleCop1 = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "ldc1",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      if (rt % 2 !== 0) {
        throw new RangeError("ldc1 target register must be even-numbered");
      }
      if ((address & 0x7) !== 0) {
        throw new AddressError(address, "read", `Unaligned doubleword address: 0x${address.toString(16)}`);
      }
      const high = memory.readWord(address);
      const low = memory.readWord(address + 4);
      state.setFloatRegisterBits(rt, low);
      state.setFloatRegisterBits(rt + 1, high);
    },
  };
};

const makeStoreByte = (name: string, decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name,
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      state.invalidateLoadLinkedReservation(address, 1);
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
      state.invalidateLoadLinkedReservation(address, 2);
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
      state.invalidateLoadLinkedReservation(address, 4);
      memory.writeWord(address, state.getRegister(rt));
    },
  };
};

const makeStoreWordCop1 = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "swc1",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      state.invalidateLoadLinkedReservation(address, 4);
      memory.writeWord(address, state.getFloatRegisterBits(rt));
    },
  };
};

const makeStoreWordLeft = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "swl",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      const value = state.getRegister(rt);
      const offset = address % 4;
      state.invalidateLoadLinkedReservation(address - offset, offset + 1);
      for (let i = 0; i <= offset; i++) {
        const byteIndex = 3 - i;
        memory.writeByte(address - i, extractByteFromWord(value, byteIndex));
      }
    },
  };
};

const makeStoreWordRight = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "swr",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      const value = state.getRegister(rt);
      const offset = address % 4;
      state.invalidateLoadLinkedReservation(address, 4 - offset);
      for (let i = 0; i <= 3 - offset; i++) {
        memory.writeByte(address + i, extractByteFromWord(value, i));
      }
    },
  };
};

const makeStoreConditional = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "sc",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      const success = state.isLoadLinkedReservationValid(address);

      if (success) {
        memory.writeWord(address, state.getRegister(rt));
        state.setRegister(rt, 1);
      } else {
        state.setRegister(rt, 0);
      }

      state.clearLoadLinkedReservation();
    },
  };
};

const makeStoreDoubleCop1 = (decoded: ITypeFields): DecodedInstruction => {
  const { rt } = decoded;
  return {
    name: "sdc1",
    execute: (state: MachineState, memory: InstructionMemory) => {
      const address = computeAddress(decoded, state);
      if (rt % 2 !== 0) {
        throw new RangeError("sdc1 source register must be even-numbered");
      }
      if ((address & 0x7) !== 0) {
        throw new AddressError(address, "write", `Unaligned doubleword address: 0x${address.toString(16)}`);
      }
      const low = state.getFloatRegisterBits(rt);
      const high = state.getFloatRegisterBits(rt + 1);
      state.invalidateLoadLinkedReservation(address, 8);
      memory.writeWord(address, high);
      memory.writeWord(address + 4, low);
    },
  };
};

const triggerTrap = (name: string): never => {
  throw new Error(`Trap exception triggered by ${name}`);
};

const makeTrapRegisterComparison = (
  name: string,
  decoded: RTypeFields,
  predicate: (left: number, right: number) => boolean,
): DecodedInstruction => {
  const { rs, rt } = decoded;
  return {
    name,
    execute: (state: MachineState) => {
      if (predicate(state.getRegister(rs), state.getRegister(rt))) {
        triggerTrap(name);
      }
    },
  };
};

const makeTrapImmediateComparison = (
  name: string,
  decoded: ITypeFields,
  predicate: (left: number, immediate: number) => boolean,
  transform: (immediate: number) => number = signExtend16,
): DecodedInstruction => {
  const { rs, immediate } = decoded;
  const transformed = transform(immediate);
  return {
    name,
    execute: (state: MachineState) => {
      if (predicate(state.getRegister(rs), transformed)) {
        triggerTrap(name);
      }
    },
  };
};

const makeMultiplyAccumulate = (
  name: string,
  decoded: RTypeFields,
  unsigned: boolean,
): DecodedInstruction => {
  const { rs, rt } = decoded;
  return {
    name,
    execute: (state: MachineState) => {
      const left = unsigned ? BigInt(state.getRegister(rs) >>> 0) : BigInt(state.getRegister(rs));
      const right = unsigned ? BigInt(state.getRegister(rt) >>> 0) : BigInt(state.getRegister(rt));
      const product = left * right;
      const sum = composeHiLo(state.getHi(), state.getLo()) + product;
      const { hi, lo } = splitToHiLo(sum);
      state.setHi(hi);
      state.setLo(lo);
    },
  };
};

const makeMultiplySubtract = (
  name: string,
  decoded: RTypeFields,
  unsigned: boolean,
): DecodedInstruction => {
  const { rs, rt } = decoded;
  return {
    name,
    execute: (state: MachineState) => {
      const left = unsigned ? BigInt(state.getRegister(rs) >>> 0) : BigInt(state.getRegister(rs));
      const right = unsigned ? BigInt(state.getRegister(rt) >>> 0) : BigInt(state.getRegister(rt));
      const product = left * right;
      const difference = composeHiLo(state.getHi(), state.getLo()) - product;
      const { hi, lo } = splitToHiLo(difference);
      state.setHi(hi);
      state.setLo(lo);
    },
  };
};

const makeMultiply = (name: string, decoded: RTypeFields, unsigned: boolean): DecodedInstruction => {
  const { rs, rt } = decoded;
  return {
    name,
    execute: (state: MachineState) => {
      const left = unsigned ? BigInt(state.getRegister(rs) >>> 0) : BigInt(state.getRegister(rs));
      const right = unsigned ? BigInt(state.getRegister(rt) >>> 0) : BigInt(state.getRegister(rt));
      const product = left * right;
      const { hi, lo } = splitToHiLo(product);
      state.setHi(hi);
      state.setLo(lo);
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

const makeExceptionReturn = (): DecodedInstruction => ({
  name: "eret",
  execute: (state: MachineState) => {
    const status = state.getCop0Status();
    const cleared = status & ~(1 << 1);
    state.setCop0Status(cleared);
    state.setProgramCounter(state.getCop0Epc());
    state.clearDelayedBranch();
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
    case 0x01:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "sub.s" : "sub.d",
        execute: (state: MachineState) => {
          const result = read(fs, state) - read(ft, state);
          write(fd, state, isSingle ? Math.fround(result) : result);
        },
      };
    case 0x02:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "mul.s" : "mul.d",
        execute: (state: MachineState) => {
          const result = read(fs, state) * read(ft, state);
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
    case 0x04:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "sqrt.s" : "sqrt.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          const result = Math.sqrt(value);
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
    case 0x06:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "mov.s" : "mov.d",
        execute: (state: MachineState) => {
          write(fd, state, read(fs, state));
        },
      };
    case 0x07:
      if (!isSingle && !isDouble) return null;
      if (isSingle) {
        return {
          name: "neg.s",
          execute: (state: MachineState) => {
            const value = state.getFloatRegisterBits(fs);
            state.setFloatRegisterBits(fd, value ^ 0x80000000);
          },
        };
      }
      return {
        name: "neg.d",
        execute: (state: MachineState) => {
          if (fs % 2 !== 0 || fd % 2 !== 0) {
            throw new RangeError("neg.d source and destination registers must be even-numbered");
          }
          const low = state.getFloatRegisterBits(fs);
          const high = state.getFloatRegisterBits(fs + 1);
          state.setFloatRegisterBits(fd, low);
          state.setFloatRegisterBits(fd + 1, high ^ 0x80000000);
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
    case 0x0f:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "floor.w.s" : "floor.w.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          state.setFloatRegisterBits(fd, floorFloatToWord(value));
        },
      };
    case 0x0c:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "round.w.s" : "round.w.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          state.setFloatRegisterBits(fd, roundFloatToNearestEvenWord(value));
        },
      };
    case 0x0d:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "trunc.w.s" : "trunc.w.d",
        execute: (state: MachineState) => {
          const value = read(fs, state);
          state.setFloatRegisterBits(fd, clampFloatToWord(value));
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
    case 0x11: {
      if (!isSingle && !isDouble) return null;
      const condition = ft >> 2;
      const moveOnTrue = (ft & 0x1) === 1;
      return {
        name: isSingle ? (moveOnTrue ? "movt.s" : "movf.s") : moveOnTrue ? "movt.d" : "movf.d",
        execute: (state: MachineState) => {
          if (state.getFpuConditionFlag(condition) === moveOnTrue) {
            write(fd, state, read(fs, state));
          }
        },
      };
    }
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
    case 0x12:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "movz.s" : "movz.d",
        execute: (state: MachineState) => {
          if (state.getRegister(ft) === 0) {
            write(fd, state, read(fs, state));
          }
        },
      };
    case 0x13:
      if (!isSingle && !isDouble) return null;
      return {
        name: isSingle ? "movn.s" : "movn.d",
        execute: (state: MachineState) => {
          if (state.getRegister(ft) !== 0) {
            write(fd, state, read(fs, state));
          }
        },
      };
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
      case 0x02:
        return makeSrl(decoded);
      case 0x03:
        return makeSra(decoded);
      case 0x04:
        return makeSllv(decoded);
      case 0x08:
        return makeJumpRegister(decoded);
      case 0x09:
        return makeJumpAndLinkRegister(decoded, pc);
      case 0x0c:
        return makeSyscall();
      case 0x0d:
        return makeBreak();
      case 0x0a: {
        const { rd, rs, rt } = decoded;
        return {
          name: "movz",
          execute: (state: MachineState) => {
            if (state.getRegister(rt) === 0) {
              state.setRegister(rd, state.getRegister(rs));
            }
          },
        };
      }
      case 0x0b: {
        const { rd, rs, rt } = decoded;
        return {
          name: "movn",
          execute: (state: MachineState) => {
            if (state.getRegister(rt) !== 0) {
              state.setRegister(rd, state.getRegister(rs));
            }
          },
        };
      }
      case 0x01: {
        const { rd, rs, rt } = decoded;
        const conditionCode = rt >> 2;
        const moveOnTrue = (rt & 0x1) === 1;
        return {
          name: moveOnTrue ? "movt" : "movf",
          execute: (state: MachineState) => {
            if (state.getFpuConditionFlag(conditionCode) === moveOnTrue) {
              state.setRegister(rd, state.getRegister(rs));
            }
          },
        };
      }
      case 0x10: {
        const { rd } = decoded;
        return {
          name: "mfhi",
          execute: (state: MachineState) => {
            state.setRegister(rd, state.getHi());
          },
        };
      }
      case 0x12: {
        const { rd } = decoded;
        return {
          name: "mflo",
          execute: (state: MachineState) => {
            state.setRegister(rd, state.getLo());
          },
        };
      }
      case 0x11: {
        const { rs } = decoded;
        return {
          name: "mthi",
          execute: (state: MachineState) => {
            state.setHi(state.getRegister(rs));
          },
        };
      }
      case 0x13: {
        const { rs } = decoded;
        return {
          name: "mtlo",
          execute: (state: MachineState) => {
            state.setLo(state.getRegister(rs));
          },
        };
      }
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
      case 0x18:
        return makeMultiply("mult", decoded, false);
      case 0x19:
        return makeMultiply("multu", decoded, true);
      case 0x20:
        return createRegisterBinary("add", decoded, (l, r) => checkedAdd(l, r));
      case 0x21:
        return createRegisterBinary("addu", decoded, (l, r) => l + r);
      case 0x22:
        return createRegisterBinary("sub", decoded, (l, r) => checkedSub(l, r));
      case 0x23:
        return createRegisterBinary("subu", decoded, (l, r) => l - r);
      case 0x24:
        return createRegisterBinary("and", decoded, (l, r) => l & r);
      case 0x25:
        return createRegisterBinary("or", decoded, (l, r) => l | r);
      case 0x26:
        return makeExclusiveOr(decoded);
      case 0x27:
        return createRegisterBinary("nor", decoded, (l, r) => ~(l | r));
      case 0x2a:
        return createRegisterBinary("slt", decoded, (l, r) => (l < r ? 1 : 0));
      case 0x2b:
        return createRegisterBinary("sltu", decoded, (l, r) => ((l >>> 0) < (r >>> 0) ? 1 : 0));
      case 0x30:
        return makeTrapRegisterComparison("tge", decoded, (l, r) => l >= r);
      case 0x31:
        return makeTrapRegisterComparison("tgeu", decoded, (l, r) => (l >>> 0) >= (r >>> 0));
      case 0x32:
        return makeTrapRegisterComparison("tlt", decoded, (l, r) => l < r);
      case 0x33:
        return makeTrapRegisterComparison("tltu", decoded, (l, r) => (l >>> 0) < (r >>> 0));
      case 0x34:
        return makeTrapRegisterComparison("teq", decoded, (l, r) => l === r);
      case 0x36:
        return makeTrapRegisterComparison("tne", decoded, (l, r) => l !== r);
      case 0x06:
        return makeSrlv(decoded);
      case 0x07:
        return makeSrav(decoded);
      default:
        return null;
    }
  }

  if (opcode === 0x1c) {
    const decoded = decodeRType(instruction);
    switch (decoded.funct) {
      case 0x02:
        return createRegisterBinary("mul", decoded, (l, r) => l * r);
      case 0x00:
        return makeMultiplyAccumulate("madd", decoded, false);
      case 0x01:
        return makeMultiplyAccumulate("maddu", decoded, true);
      case 0x04:
        return makeMultiplySubtract("msub", decoded, false);
      case 0x05:
        return makeMultiplySubtract("msubu", decoded, true);
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
    const copOpcode = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const fs = (instruction >>> 11) & 0x1f;

    if (copOpcode === 0x00) {
      return {
        name: "mfc1",
        execute: (state: MachineState) => {
          state.setRegister(rt, state.getFloatRegisterBits(fs));
        },
      };
    }

    if (copOpcode === 0x04) {
      return {
        name: "mtc1",
        execute: (state: MachineState) => {
          state.setFloatRegisterBits(fs, state.getRegister(rt));
        },
      };
    }

    const copDecoded = decodeCop1(instruction, pc);
    if (copDecoded) {
      return copDecoded;
    }
  }

  if (opcode === 0x10) {
    const copOpcode = (instruction >>> 21) & 0x1f;
    const rt = (instruction >>> 16) & 0x1f;
    const rd = (instruction >>> 11) & 0x1f;
    const funct = instruction & 0x3f;
    if (copOpcode === 0x00) {
      return {
        name: "mfc0",
        execute: (state: MachineState) => {
          state.setRegister(rt, state.getCop0Register(rd));
        },
      };
    }
    if (copOpcode === 0x04) {
      return {
        name: "mtc0",
        execute: (state: MachineState) => {
          state.setCop0Register(rd, state.getRegister(rt));
        },
      };
    }
    if (copOpcode === 0x10 && funct === 0x18) {
      return makeExceptionReturn();
    }
  }

  const decoded = decodeIType(instruction);

  switch (opcode) {
    case 0x08:
      return createImmediateBinary("addi", decoded, (l, imm) => checkedAdd(l, imm));
    case 0x09:
      return createImmediateBinary("addiu", decoded, (l, imm) => l + imm);
    case 0x0c:
      return makeAndImmediate(decoded);
    case 0x0d:
      return createImmediateBinary("ori", decoded, (l, imm) => l | imm, (imm) => imm & 0xffff);
    case 0x0e:
      return makeExclusiveOrImmediate(decoded);
    case 0x0f:
      return makeLoadUpperImmediate(decoded);
    case 0x04:
      return makeBranchEqual(decoded, pc);
    case 0x05:
      return makeBranchNotEqual(decoded, pc);
    case 0x0a:
      return createImmediateBinary("slti", decoded, (l, imm) => (l < imm ? 1 : 0));
    case 0x0b:
      return createImmediateBinary("sltiu", decoded, (l, imm) => ((l >>> 0) < (imm >>> 0) ? 1 : 0));
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
        case 0x08:
          return makeTrapImmediateComparison("tgei", decoded, (l, imm) => l >= imm);
        case 0x09:
          return makeTrapImmediateComparison("tgeiu", decoded, (l, imm) => (l >>> 0) >= (imm >>> 0));
        case 0x0a:
          return makeTrapImmediateComparison("tlti", decoded, (l, imm) => l < imm);
        case 0x0b:
          return makeTrapImmediateComparison("tltiu", decoded, (l, imm) => (l >>> 0) < (imm >>> 0));
        case 0x0c:
          return makeTrapImmediateComparison("teqi", decoded, (l, imm) => l === imm);
        case 0x0e:
          return makeTrapImmediateComparison("tnei", decoded, (l, imm) => l !== imm);
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
    case 0x22:
      return makeLoadWordLeft(decoded);
    case 0x26:
      return makeLoadWordRight(decoded);
    case 0x30:
      return makeLoadLinked(decoded);
    case 0x31:
      return makeLoadWordCop1(decoded);
    case 0x35:
      return makeLoadDoubleCop1(decoded);
    case 0x28:
      return makeStoreByte("sb", decoded);
    case 0x29:
      return makeStoreHalf(decoded);
    case 0x2b:
      return makeStoreWord(decoded);
    case 0x2a:
      return makeStoreWordLeft(decoded);
    case 0x2e:
      return makeStoreWordRight(decoded);
    case 0x38:
      return makeStoreConditional(decoded);
    case 0x39:
      return makeStoreWordCop1(decoded);
    case 0x3d:
      return makeStoreDoubleCop1(decoded);
    default:
      return null;
  }
}

export const instructionSetPlaceholder = false;
export type InstructionExecutor = (state: MachineState, memory: InstructionMemory, cpu: Cpu) => void;
