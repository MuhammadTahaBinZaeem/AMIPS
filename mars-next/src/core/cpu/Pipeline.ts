import { decodeInstruction } from "./Instructions";
import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "./Cpu";
import { MachineState, DEFAULT_TEXT_BASE } from "../state/MachineState";
import { BreakpointEngine } from "../debugger/BreakpointEngine";
import { WatchEngine } from "../debugger/WatchEngine";

export interface PipelineOptions {
  memory?: InstructionMemory;
  state?: MachineState;
  decoder?: InstructionDecoder;
  cpu?: Cpu;
  breakpoints?: BreakpointEngine;
  watchEngine?: WatchEngine;
}

export class ProgramMemory implements InstructionMemory {
  private readonly words: Map<number, number>;
  private readonly bytes: Map<number, number>;
  private readonly baseAddress: number;

  constructor(program: number[], baseAddress = DEFAULT_TEXT_BASE) {
    this.words = new Map();
    this.bytes = new Map();
    this.baseAddress = baseAddress | 0;

    program.forEach((word, index) => {
      const address = (this.baseAddress + index * 4) | 0;
      this.writeWord(address, word);
      this.words.set(address, word | 0);
    });
  }

  hasInstruction(address: number): boolean {
    const alignedAddress = this.validateWordAddress(address);
    return this.words.has(alignedAddress);
  }

  loadWord(address: number): number {
    const alignedAddress = address | 0;
    if ((alignedAddress - this.baseAddress) % 4 !== 0) {
      throw new Error(`Unaligned instruction fetch at 0x${alignedAddress.toString(16)}`);
    }

    if (!this.words.has(alignedAddress)) {
      throw new Error(`No instruction at 0x${alignedAddress.toString(16)}`);
    }
    return this.readWord(alignedAddress);
  }

  readWord(address: number): number {
    const aligned = this.validateWordAddress(address);
    let value = 0;
    for (let i = 0; i < 4; i++) {
      value = (value << 8) | this.readByte(aligned + i);
    }
    return value | 0;
  }

  writeWord(address: number, value: number): void {
    const aligned = this.validateWordAddress(address);
    for (let i = 0; i < 4; i++) {
      const shift = 24 - 8 * i;
      this.writeByte(aligned + i, (value >>> shift) & 0xff);
    }
    this.words.set(aligned, value | 0);
  }

  readByte(address: number): number {
    const normalized = this.validateAddress(address);
    return this.bytes.get(normalized) ?? 0;
  }

  writeByte(address: number, value: number): void {
    const normalized = this.validateAddress(address);
    this.bytes.set(normalized, value & 0xff);
  }

  private validateAddress(address: number): number {
    if (!Number.isInteger(address)) {
      throw new Error(`Invalid address: 0x${address.toString(16)}`);
    }
    return address >>> 0;
  }

  private validateWordAddress(address: number): number {
    const normalized = this.validateAddress(address);
    if (normalized % 4 !== 0) {
      throw new Error(`Invalid address: 0x${address.toString(16)}`);
    }
    return normalized;
  }
}

type PipelineRegisterPayload = { pc: number; instruction: number; decoded?: DecodedInstruction } | null;

class PipelineRegister {
  private current: PipelineRegisterPayload;
  private next: PipelineRegisterPayload;

  constructor(private readonly emptyValue: PipelineRegisterPayload = null) {
    this.current = emptyValue;
    this.next = emptyValue;
  }

  getCurrent(): PipelineRegisterPayload {
    return this.current;
  }

  setNext(value: PipelineRegisterPayload): void {
    this.next = value;
  }

  advance(): void {
    this.current = this.next;
    this.next = this.emptyValue;
  }

  clear(): void {
    this.current = this.emptyValue;
    this.next = this.emptyValue;
  }

  isEmpty(): boolean {
    return this.current === this.emptyValue;
  }
}

export class Pipeline {
  private readonly cpu: Cpu;
  private readonly breakpoints: BreakpointEngine | null;
  private readonly watchEngine: WatchEngine | null;
  private readonly ifId: PipelineRegister;
  private readonly idEx: PipelineRegister;
  private readonly exMem: PipelineRegister;
  private readonly memWb: PipelineRegister;
  private halted = false;

  constructor(options: PipelineOptions) {
    const decoder = options.decoder ?? ({
      decode: (instruction: number, pc: number): DecodedInstruction | null => decodeInstruction(instruction, pc),
    } as InstructionDecoder);

    if (!options.cpu && !options.memory) {
      throw new Error("Pipeline requires either a CPU instance or instruction memory");
    }

    this.cpu = options.cpu ?? new Cpu({ memory: options.memory!, decoder, state: options.state });
    this.breakpoints = options.breakpoints ?? null;
    this.watchEngine = options.watchEngine ?? null;
    this.ifId = new PipelineRegister();
    this.idEx = new PipelineRegister();
    this.exMem = new PipelineRegister();
    this.memWb = new PipelineRegister();
  }

  getState(): MachineState {
    return this.cpu.getState();
  }

  isHalted(): boolean {
    return this.halted;
  }

  halt(): void {
    this.halted = true;
  }

  resume(): void {
    this.halted = false;
  }

  addBreakpoint(address: number): void {
    this.breakpoints?.setBreakpoint(address);
  }

  removeBreakpoint(address: number): void {
    this.breakpoints?.removeBreakpoint(address);
  }

  clearBreakpoints(): void {
    this.breakpoints?.clearAll();
  }

  executeCycle(): "running" | "breakpoint" | "halted" | "terminated" {
    return this.step();
  }

  step(): "running" | "breakpoint" | "halted" | "terminated" {
    if (this.halted) return "halted";

    const state = this.cpu.getState();
    const memory = this.cpu.getMemory();
    const decoder = this.cpu.getDecoder();

    this.watchEngine?.beginStep();

    // MEM/WB stage simply tracks the instruction retiring from EX/MEM.
    this.memWb.setNext(this.exMem.getCurrent());

    // EX/MEM stage executes the decoded instruction.
    const executing = this.idEx.getCurrent();
    let branchRegistered = false;
    if (executing?.decoded) {
      executing.decoded.execute(state, memory, this.cpu);
      branchRegistered = state.isBranchRegistered();
    }
    this.exMem.setNext(executing);

    // Finalize delayed branches before fetching the next instruction.
    state.finalizeDelayedBranch();

    // ID/EX stage decodes the fetched instruction.
    const decoding = this.ifId.getCurrent();
    if (decoding) {
      const decoded = decoder.decode(decoding.instruction, decoding.pc);
      if (!decoded) {
        throw new Error(`Unknown instruction 0x${decoding.instruction.toString(16)} at PC 0x${decoding.pc.toString(16)}`);
      }
      this.idEx.setNext({ ...decoding, decoded });
    } else {
      this.idEx.setNext(null);
    }

    // Evaluate breakpoints for the next fetch address after branch resolution.
    const fetchPc = state.getProgramCounter();
    const instructionIndex = ((fetchPc - DEFAULT_TEXT_BASE) / 4) | 0;
    const breakpointHit = this.breakpoints?.checkForHit(fetchPc, instructionIndex) ?? false;

    // IF/ID stage fetches the next instruction unless halted or terminated.
    if (!breakpointHit && !state.isTerminated() && !branchRegistered && this.canFetchInstruction(fetchPc)) {
      const rawInstruction = memory.loadWord(fetchPc);
      state.incrementProgramCounter();
      this.ifId.setNext({ pc: fetchPc, instruction: rawInstruction });
    } else {
      this.ifId.setNext(null);
    }

    this.advancePipeline();

    this.watchEngine?.completeStep();

    if (state.isTerminated()) {
      this.halted = true;
      this.clearPipeline();
      return "terminated";
    }

    if (breakpointHit) {
      this.halted = true;
      return "breakpoint";
    }

    if (this.isPipelineEmpty() && !this.canFetchInstruction(state.getProgramCounter())) {
      this.halted = true;
      return "halted";
    }

    return "running";
  }

  run(maxCycles = Number.MAX_SAFE_INTEGER): void {
    let cycles = 0;
    while (!this.halted && cycles < maxCycles) {
      this.step();
      cycles += 1;
    }
  }

  private canFetchInstruction(address: number): boolean {
    const memory = this.cpu.getMemory();
    if (typeof memory.hasInstruction === "function") {
      return memory.hasInstruction(address);
    }
    return true;
  }

  private advancePipeline(): void {
    this.memWb.advance();
    this.exMem.advance();
    this.idEx.advance();
    this.ifId.advance();
  }

  private isPipelineEmpty(): boolean {
    return this.ifId.isEmpty() && this.idEx.isEmpty() && this.exMem.isEmpty() && this.memWb.isEmpty();
  }

  private clearPipeline(): void {
    this.ifId.clear();
    this.idEx.clear();
    this.exMem.clear();
    this.memWb.clear();
  }
}
