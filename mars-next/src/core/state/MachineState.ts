// Ported from legacy/java/mars/mips/hardware/RegisterFile.java and related
// simulator state management in legacy/java/mars/simulator/Simulator.java.
// This class maintains register values, the program counter and delayed
// branch bookkeeping in a TypeScript-friendly form.

export const DEFAULT_TEXT_BASE = 0x00400000;
export const DEFAULT_GLOBAL_POINTER = 0x10008000;
export const DEFAULT_STACK_POINTER = 0x7fffeffc;

type DelayedBranchState = "cleared" | "registered" | "triggered";

export class MachineState {
  static readonly REGISTER_COUNT = 32;
  static readonly HI_REGISTER = 33;
  static readonly LO_REGISTER = 34;

  private readonly registers: Int32Array;
  private programCounter: number;
  private hi: number;
  private lo: number;

  private delayedBranchTarget: number | null;
  private delayedBranchState: DelayedBranchState;

  constructor() {
    this.registers = new Int32Array(MachineState.REGISTER_COUNT);
    this.programCounter = DEFAULT_TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    this.delayedBranchTarget = null;
    this.delayedBranchState = "cleared";
    this.reset();
  }

  reset(): void {
    this.registers.fill(0);
    this.registers[28] = this.toInt32(DEFAULT_GLOBAL_POINTER);
    this.registers[29] = this.toInt32(DEFAULT_STACK_POINTER);
    this.hi = 0;
    this.lo = 0;
    this.programCounter = this.toInt32(DEFAULT_TEXT_BASE);
    this.clearDelayedBranch();
  }

  getRegister(index: number): number {
    this.validateRegisterIndex(index);
    return this.registers[index];
  }

  setRegister(index: number, value: number): void {
    this.validateRegisterIndex(index);
    if (index === 0) return; // $zero is immutable
    this.registers[index] = this.toInt32(value);
  }

  getHi(): number {
    return this.hi;
  }

  setHi(value: number): void {
    this.hi = this.toInt32(value);
  }

  getLo(): number {
    return this.lo;
  }

  setLo(value: number): void {
    this.lo = this.toInt32(value);
  }

  getProgramCounter(): number {
    return this.programCounter;
  }

  setProgramCounter(value: number): void {
    this.programCounter = this.toInt32(value);
  }

  incrementProgramCounter(delta = 4): void {
    this.programCounter = this.toInt32(this.programCounter + delta);
  }

  registerDelayedBranch(targetAddress: number): void {
    switch (this.delayedBranchState) {
      case "cleared":
        this.delayedBranchTarget = this.toInt32(targetAddress);
      // fall through
      case "registered":
      case "triggered":
        this.delayedBranchState = "registered";
    }
  }

  finalizeDelayedBranch(): void {
    if (this.delayedBranchState === "triggered" && this.delayedBranchTarget !== null) {
      this.programCounter = this.delayedBranchTarget;
      this.clearDelayedBranch();
    } else if (this.delayedBranchState === "registered") {
      this.delayedBranchState = "triggered";
    }
  }

  isBranchRegistered(): boolean {
    return this.delayedBranchState === "registered";
  }

  isBranchTriggered(): boolean {
    return this.delayedBranchState === "triggered";
  }

  getDelayedBranchTarget(): number | null {
    return this.delayedBranchTarget;
  }

  clearDelayedBranch(): void {
    this.delayedBranchTarget = null;
    this.delayedBranchState = "cleared";
  }

  private validateRegisterIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= MachineState.REGISTER_COUNT) {
      throw new RangeError(`Register index out of bounds: ${index}`);
    }
  }

  private toInt32(value: number): number {
    return value | 0;
  }
}
