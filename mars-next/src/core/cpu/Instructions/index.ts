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

function makeAdd(decoded: RTypeFields): DecodedInstruction {
  const { rd, rs, rt } = decoded;
  return {
    name: "add",
    execute: (state: MachineState) => {
      const sum = toInt32(state.getRegister(rs) + state.getRegister(rt));
      state.setRegister(rd, sum);
    },
  };
}

function makeAddImmediate(decoded: ITypeFields): DecodedInstruction {
  const { rs, rt, immediate } = decoded;
  const signExtended = signExtend16(immediate);
  return {
    name: "addi",
    execute: (state: MachineState) => {
      const sum = toInt32(state.getRegister(rs) + signExtended);
      state.setRegister(rt, sum);
    },
  };
}

function makeBranchEqual(decoded: ITypeFields, pc: number): DecodedInstruction {
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
}

function makeNop(): DecodedInstruction {
  return {
    name: "nop",
    execute: () => {
      /* intentionally empty */
    },
  };
}

export function decodeInstruction(instruction: number, pc: number): DecodedInstruction | null {
  const opcode = (instruction >>> 26) & 0x3f;

  if (opcode === 0x00) {
    const decoded = decodeRType(instruction);

    switch (decoded.funct) {
      case 0x00:
        if (instruction === 0) return makeNop();
        return null;
      case 0x20:
        return makeAdd(decoded);
      default:
        return null;
    }
  }

  const decoded = decodeIType(instruction);

  switch (opcode) {
    case 0x08:
      return makeAddImmediate(decoded);
    case 0x04:
      return makeBranchEqual(decoded, pc);
    default:
      return null;
  }
}

export const instructionSetPlaceholder = false;
export type InstructionExecutor = (state: MachineState, memory: InstructionMemory, cpu: Cpu) => void;
