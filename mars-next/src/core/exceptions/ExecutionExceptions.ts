import { AddressError } from "./AccessExceptions";
import { AccessType } from "../memory/MemoryMap";

export class CpuException extends Error {
  pc: number | null;

  constructor(message: string, pc: number | null = null) {
    super(message);
    this.pc = pc;
    this.name = "CpuException";
  }

  withPc(pc: number): this {
    if (this.pc === null) {
      this.pc = pc >>> 0;
    }
    return this;
  }
}

export class InvalidInstruction extends CpuException {
  readonly instruction: number;

  constructor(instruction: number, pc: number | null = null) {
    super(`Invalid or unimplemented instruction 0x${instruction.toString(16)}`, pc);
    this.instruction = instruction >>> 0;
    this.name = "InvalidInstruction";
  }
}

export class ArithmeticOverflow extends CpuException {
  constructor(pc: number | null = null) {
    super("Arithmetic overflow", pc);
    this.name = "ArithmeticOverflow";
  }
}

export class MemoryAccessException extends CpuException {
  readonly address: number;
  readonly access: AccessType;

  constructor(address: number, access: AccessType, pc: number | null = null, message?: string) {
    super(message ?? `Memory access error at 0x${address.toString(16)}`, pc);
    this.address = address >>> 0;
    this.access = access;
    this.name = "MemoryAccessException";
  }
}

export class SyscallException extends CpuException {
  readonly code: number | null;

  constructor(code: number | null = null, pc: number | null = null, message?: string) {
    super(message ?? `Syscall${code !== null ? ` ${code}` : ""} invoked`, pc);
    this.code = code;
    this.name = "SyscallException";
  }
}

export function normalizeCpuException(error: unknown, pc: number): Error {
  if (error instanceof CpuException) {
    return error.withPc(pc);
  }

  if (error instanceof AddressError) {
    return new MemoryAccessException(error.address, error.access, pc, error.message);
  }

  if (error instanceof Error) {
    return error;
  }

  return new CpuException("Unknown CPU exception", pc);
}
