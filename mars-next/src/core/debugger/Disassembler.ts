import { decodeInstruction } from "../cpu/Instructions";

const REGISTER_NAMES = [
  "$zero",
  "$at",
  "$v0",
  "$v1",
  "$a0",
  "$a1",
  "$a2",
  "$a3",
  "$t0",
  "$t1",
  "$t2",
  "$t3",
  "$t4",
  "$t5",
  "$t6",
  "$t7",
  "$s0",
  "$s1",
  "$s2",
  "$s3",
  "$s4",
  "$s5",
  "$s6",
  "$s7",
  "$t8",
  "$t9",
  "$k0",
  "$k1",
  "$gp",
  "$sp",
  "$fp",
  "$ra",
];

export interface DisassembledInstruction {
  mnemonic: string;
  operands: string[];
  assembly: string;
}

interface InstructionFields {
  opcode: number;
  rs: number;
  rt: number;
  rd: number;
  shamt: number;
  funct: number;
  immediate: number;
  address: number;
}

const signExtend16 = (value: number): number => (value << 16) >> 16;

const formatRegister = (registerIndex: number): string => {
  if (registerIndex === 33) return "$hi";
  if (registerIndex === 34) return "$lo";
  return REGISTER_NAMES[registerIndex] ?? `$${registerIndex}`;
};

const formatImmediate = (immediate: number): string => {
  const signed = signExtend16(immediate);
  return signed < 0 ? `-${Math.abs(signed)}` : `${signed}`;
};

const decodeFields = (instruction: number): InstructionFields => ({
  opcode: (instruction >>> 26) & 0x3f,
  rs: (instruction >>> 21) & 0x1f,
  rt: (instruction >>> 16) & 0x1f,
  rd: (instruction >>> 11) & 0x1f,
  shamt: (instruction >>> 6) & 0x1f,
  funct: instruction & 0x3f,
  immediate: instruction & 0xffff,
  address: instruction & 0x3ffffff,
});

const formatLoadStore = (mnemonic: string, rt: number, rs: number, immediate: number): DisassembledInstruction => {
  const offset = formatImmediate(immediate);
  const operands = [formatRegister(rt), `${offset}(${formatRegister(rs)})`];
  return { mnemonic, operands, assembly: `${mnemonic} ${operands.join(", ")}` };
};

const formatBranch = (mnemonic: string, rs: number, rt: number, immediate: number, pc: number): DisassembledInstruction => {
  const offset = signExtend16(immediate) << 2;
  const target = (pc + 4 + offset) | 0;
  const operands = [formatRegister(rs)];
  if (mnemonic !== "bgez" && mnemonic !== "bltz") {
    operands.push(formatRegister(rt));
  }
  operands.push(`0x${target.toString(16)}`);
  return { mnemonic, operands, assembly: `${mnemonic} ${operands.join(", ")}` };
};

const formatJump = (mnemonic: string, address: number, pc: number): DisassembledInstruction => {
  const target = ((pc + 4) & 0xf0000000) | (address << 2);
  const operands = [`0x${target.toString(16)}`];
  return { mnemonic, operands, assembly: `${mnemonic} ${operands[0]}` };
};

const formatThreeRegister = (mnemonic: string, rd: number, rs: number, rt: number): DisassembledInstruction => {
  const operands = [formatRegister(rd), formatRegister(rs), formatRegister(rt)];
  return { mnemonic, operands, assembly: `${mnemonic} ${operands.join(", ")}` };
};

const formatTwoRegister = (mnemonic: string, rd: number, rs: number): DisassembledInstruction => {
  const operands = [formatRegister(rd), formatRegister(rs)];
  return { mnemonic, operands, assembly: `${mnemonic} ${operands.join(", ")}` };
};

const formatImmediateArithmetic = (
  mnemonic: string,
  rt: number,
  rs: number,
  immediate: number,
  formatter: (value: number) => string = formatImmediate,
): DisassembledInstruction => {
  const operands = [formatRegister(rt), formatRegister(rs), formatter(immediate)];
  return { mnemonic, operands, assembly: `${mnemonic} ${operands.join(", ")}` };
};

export function disassembleInstruction(instruction: number, pc: number): DisassembledInstruction | null {
  const decoded = decodeInstruction(instruction, pc);
  if (!decoded) {
    return null;
  }

  const fields = decodeFields(instruction);
  const { opcode, rs, rt, rd, shamt, funct, immediate, address } = fields;
  const { name: mnemonic } = decoded;

  if (opcode === 0x00) {
    switch (funct) {
      case 0x00:
      case 0x02:
      case 0x03:
        return { mnemonic, operands: [formatRegister(rd), formatRegister(rt), `${shamt}`], assembly: `${mnemonic} ${formatRegister(rd)}, ${formatRegister(rt)}, ${shamt}` };
      case 0x04:
      case 0x06:
      case 0x07:
        return formatThreeRegister(mnemonic, rd, rt, rs);
      case 0x08:
      case 0x09:
        return { mnemonic, operands: [formatRegister(rs)], assembly: `${mnemonic} ${formatRegister(rs)}` };
      case 0x0a:
      case 0x0b:
        return formatThreeRegister(mnemonic, rd, rs, rt);
      case 0x0c:
      case 0x0d:
        return { mnemonic, operands: [], assembly: mnemonic };
      case 0x10:
      case 0x12:
        return formatTwoRegister(mnemonic, rd, funct === 0x10 ? 33 : 34);
      case 0x11:
      case 0x13:
        return formatTwoRegister(mnemonic, funct === 0x11 ? 33 : 34, rs);
      case 0x18:
      case 0x19:
      case 0x1a:
      case 0x1b:
        return { mnemonic, operands: [formatRegister(rs), formatRegister(rt)], assembly: `${mnemonic} ${formatRegister(rs)}, ${formatRegister(rt)}` };
      case 0x20:
      case 0x21:
      case 0x22:
      case 0x23:
      case 0x24:
      case 0x25:
      case 0x26:
      case 0x27:
      case 0x2a:
      case 0x2b:
        return formatThreeRegister(mnemonic, rd, rs, rt);
      case 0x2c:
        return formatThreeRegister(mnemonic, rd, rs, rt);
      case 0x2f:
        return formatTwoRegister(mnemonic, rd, rs);
      default:
        return { mnemonic, operands: [], assembly: mnemonic };
    }
  }

  switch (opcode) {
    case 0x01: {
      if (rt === 0x01) return formatBranch("bgez", rs, rt, immediate, pc);
      if (rt === 0x00) return formatBranch("bltz", rs, rt, immediate, pc);
      return { mnemonic, operands: [formatRegister(rs), `${immediate}`], assembly: `${mnemonic} ${formatRegister(rs)}, ${immediate}` };
    }
    case 0x02:
    case 0x03:
      return formatJump(mnemonic, address, pc);
    case 0x04:
    case 0x05:
      return formatBranch(mnemonic, rs, rt, immediate, pc);
    case 0x06:
    case 0x07:
      return formatBranch(mnemonic, rs, rt, immediate, pc);
    case 0x08:
    case 0x09:
    case 0x0a:
    case 0x0b:
    case 0x0c:
    case 0x0d:
    case 0x0e:
    case 0x0f:
      return formatImmediateArithmetic(mnemonic, rt, rs, immediate, opcode >= 0x0c && opcode <= 0x0e ? (value) => `0x${value.toString(16)}` : formatImmediate);
    case 0x20:
    case 0x21:
    case 0x22:
    case 0x23:
    case 0x24:
    case 0x25:
      return formatLoadStore(mnemonic, rt, rs, immediate);
    case 0x28:
    case 0x29:
    case 0x2b:
      return formatLoadStore(mnemonic, rt, rs, immediate);
    case 0x32:
      return { mnemonic, operands: [formatRegister(rt), `${immediate}`], assembly: `${mnemonic} ${formatRegister(rt)}, ${immediate}` };
    default:
      return { mnemonic, operands: [], assembly: mnemonic };
  }
}
