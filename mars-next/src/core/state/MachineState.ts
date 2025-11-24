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
  static readonly FPU_REGISTER_COUNT = 32;
  static readonly FPU_FLAG_COUNT = 8;

  private readonly registers: Int32Array;
  private readonly floatRegisters: Int32Array;
  private readonly cop0Registers: Int32Array;
  private programCounter: number;
  private hi: number;
  private lo: number;
  private cop0Status: number;
  private cop0Epc: number;
  private terminated: boolean;
  private kernelMode: boolean;

  private readonly fpuConditionFlags: boolean[];

  private delayedBranchTarget: number | null;
  private delayedBranchState: DelayedBranchState;
  private loadLinkedAddress: number | null;

  constructor() {
    this.registers = new Int32Array(MachineState.REGISTER_COUNT);
    this.floatRegisters = new Int32Array(MachineState.FPU_REGISTER_COUNT);
    this.cop0Registers = new Int32Array(MachineState.REGISTER_COUNT);
    this.programCounter = DEFAULT_TEXT_BASE;
    this.hi = 0;
    this.lo = 0;
    this.cop0Status = 0;
    this.cop0Epc = 0;
    this.terminated = false;
    this.kernelMode = false;
    this.fpuConditionFlags = Array.from({ length: MachineState.FPU_FLAG_COUNT }, () => false);
    this.delayedBranchTarget = null;
    this.delayedBranchState = "cleared";
    this.loadLinkedAddress = null;
    this.reset();
  }

  reset(): void {
    this.registers.fill(0);
    this.floatRegisters.fill(0);
    this.cop0Registers.fill(0);
    this.registers[28] = this.toInt32(DEFAULT_GLOBAL_POINTER);
    this.registers[29] = this.toInt32(DEFAULT_STACK_POINTER);
    this.hi = 0;
    this.lo = 0;
    this.setCop0Status(0x1); // Start in user mode by default.
    this.setCop0Epc(0);
    this.programCounter = this.toUint32(DEFAULT_TEXT_BASE);
    this.terminated = false;
    this.fpuConditionFlags.fill(false);
    this.clearDelayedBranch();
    this.clearLoadLinkedReservation();
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

  getCop0Status(): number {
    return this.cop0Status;
  }

  setCop0Status(value: number): void {
    const normalized = this.toUint32(value);
    this.cop0Status = normalized;
    this.cop0Registers[12] = normalized;
    this.kernelMode = (normalized & 0x1) === 0;
  }

  getCop0Epc(): number {
    return this.cop0Epc;
  }

  setCop0Epc(value: number): void {
    const normalized = this.toUint32(value);
    this.cop0Epc = normalized;
    this.cop0Registers[14] = normalized;
  }

  isKernelMode(): boolean {
    return this.kernelMode;
  }

  setKernelMode(enabled: boolean): void {
    const statusWithMode = enabled ? this.cop0Status & ~0x1 : this.cop0Status | 0x1;
    this.setCop0Status(statusWithMode);
  }

  getCop0Register(index: number): number {
    this.validateCop0RegisterIndex(index);
    if (index === 12) return this.getCop0Status();
    if (index === 14) return this.getCop0Epc();
    return this.cop0Registers[index];
  }

  setCop0Register(index: number, value: number): void {
    this.validateCop0RegisterIndex(index);
    const normalized = this.toUint32(value);
    this.cop0Registers[index] = normalized;
    if (index === 12) {
      this.cop0Status = normalized;
    }
    if (index === 14) {
      this.cop0Epc = normalized;
    }
  }

  getProgramCounter(): number {
    return this.programCounter;
  }

  setProgramCounter(value: number): void {
    this.programCounter = this.toUint32(value);
  }

  incrementProgramCounter(delta = 4): void {
    this.programCounter = this.toUint32(this.programCounter + delta);
  }

  terminate(): void {
    this.terminated = true;
  }

  isTerminated(): boolean {
    return this.terminated;
  }

  registerDelayedBranch(targetAddress: number): void {
    switch (this.delayedBranchState) {
      case "cleared":
        this.delayedBranchTarget = this.toUint32(targetAddress);
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

  getFloatRegisterBits(index: number): number {
    this.validateFpuRegisterIndex(index);
    return this.floatRegisters[index];
  }

  setLoadLinkedReservation(address: number): void {
    this.loadLinkedAddress = this.toUint32(address);
  }

  isLoadLinkedReservationValid(address: number): boolean {
    return this.loadLinkedAddress !== null && this.loadLinkedAddress === this.toUint32(address);
  }

  invalidateLoadLinkedReservation(address: number, size: number): void {
    if (this.loadLinkedAddress === null) return;

    const start = this.toUint32(address);
    const end = this.toUint32(start + size - 1);
    if (this.loadLinkedAddress >= start && this.loadLinkedAddress <= end) {
      this.clearLoadLinkedReservation();
    }
  }

  clearLoadLinkedReservation(): void {
    this.loadLinkedAddress = null;
  }

  setFloatRegisterBits(index: number, value: number): void {
    this.validateFpuRegisterIndex(index);
    this.floatRegisters[index] = this.toInt32(value);
  }

  getFloatRegisterSingle(index: number): number {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setInt32(0, this.getFloatRegisterBits(index));
    return view.getFloat32(0);
  }

  setFloatRegisterSingle(index: number, value: number): void {
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setFloat32(0, value);
    this.setFloatRegisterBits(index, view.getInt32(0));
  }

  getFloatRegisterDouble(index: number): number {
    this.validateEvenFpuRegister(index);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(0, this.getFloatRegisterBits(index + 1) >>> 0);
    view.setUint32(4, this.getFloatRegisterBits(index) >>> 0);
    return view.getFloat64(0);
  }

  setFloatRegisterDouble(index: number, value: number): void {
    this.validateEvenFpuRegister(index);
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, value);
    this.setFloatRegisterBits(index + 1, view.getInt32(0));
    this.setFloatRegisterBits(index, view.getInt32(4));
  }

  setFpuConditionFlag(index: number, value: boolean): void {
    this.validateFpuFlagIndex(index);
    this.fpuConditionFlags[index] = value;
  }

  getFpuConditionFlag(index: number): boolean {
    this.validateFpuFlagIndex(index);
    return this.fpuConditionFlags[index];
  }

  private validateRegisterIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= MachineState.REGISTER_COUNT) {
      throw new RangeError(`Register index out of bounds: ${index}`);
    }
  }

  private validateCop0RegisterIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= MachineState.REGISTER_COUNT) {
      throw new RangeError(`Coprocessor 0 register index out of bounds: ${index}`);
    }
  }

  private validateFpuRegisterIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= MachineState.FPU_REGISTER_COUNT) {
      throw new RangeError(`FPU register index out of bounds: ${index}`);
    }
  }

  private validateEvenFpuRegister(index: number): void {
    this.validateFpuRegisterIndex(index);
    if (index % 2 !== 0) {
      throw new RangeError(`FPU register ${index} must be even for double precision operations`);
    }
    this.validateFpuRegisterIndex(index + 1);
  }

  private validateFpuFlagIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= MachineState.FPU_FLAG_COUNT) {
      throw new RangeError(`FPU condition flag index out of bounds: ${index}`);
    }
  }

  private toInt32(value: number): number {
    return value | 0;
  }

  private toUint32(value: number): number {
    return value >>> 0;
  }
}
