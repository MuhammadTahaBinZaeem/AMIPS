import { decodeInstruction } from "./Instructions";
import { Cpu, DecodedInstruction, InstructionDecoder, InstructionMemory } from "./Cpu";
import { InvalidInstruction, normalizeCpuException } from "../exceptions/ExecutionExceptions";
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

const HI_REGISTER = 33;
const LO_REGISTER = 34;

type HazardInfo = {
  sources: number[];
  destination: number | null;
  isLoad: boolean;
  isStore: boolean;
  isControl: boolean;
};

const EMPTY_HAZARD: HazardInfo = { sources: [], destination: null, isLoad: false, isStore: false, isControl: false };

const decodeHazardInfo = (instruction: number): HazardInfo => {
  const opcode = (instruction >>> 26) & 0x3f;
  const rs = (instruction >>> 21) & 0x1f;
  const rt = (instruction >>> 16) & 0x1f;
  const rd = (instruction >>> 11) & 0x1f;
  const funct = instruction & 0x3f;

  let sources: number[] = [];
  let destination: number | null = null;
  let isLoad = false;
  let isStore = false;
  let isControl = false;

  switch (opcode) {
    case 0x00: {
      switch (funct) {
        case 0x00: // sll
        case 0x02: // srl
        case 0x03: // sra
          sources = [rt];
          destination = rd;
          break;
        case 0x08: // jr
          sources = [rs];
          isControl = true;
          break;
        case 0x09: // jalr
          sources = [rs];
          destination = rd === 0 ? 31 : rd;
          isControl = true;
          break;
        case 0x10: // mfhi
          sources = [HI_REGISTER];
          destination = rd;
          break;
        case 0x12: // mflo
          sources = [LO_REGISTER];
          destination = rd;
          break;
        case 0x11: // mthi
          sources = [rs, HI_REGISTER];
          destination = HI_REGISTER;
          break;
        case 0x13: // mtlo
          sources = [rs, LO_REGISTER];
          destination = LO_REGISTER;
          break;
        case 0x18: // mult
        case 0x19: // multu
        case 0x1a: // div
        case 0x1b: // divu
          sources = [rs, rt];
          destination = null; // writes HI/LO, track via sources
          break;
        case 0x0c: // syscall
        case 0x0d: // break
          sources = [];
          destination = null;
          break;
        default:
          sources = [rs, rt];
          destination = rd;
      }
      break;
    }
    case 0x01: {
      // REGIMM branches
      sources = [rs];
      isControl = true;
      if (rt === 0x10 || rt === 0x11) {
        destination = 31; // bltzal/bgezal link register
      }
      break;
    }
    case 0x02: // j
      isControl = true;
      break;
    case 0x03: // jal
      isControl = true;
      destination = 31;
      break;
    case 0x04: // beq
    case 0x05: // bne
      sources = [rs, rt];
      isControl = true;
      break;
    case 0x06: // blez
    case 0x07: // bgtz
      sources = [rs];
      isControl = true;
      break;
    case 0x08: // addi
    case 0x09: // addiu
    case 0x0a: // slti
    case 0x0b: // sltiu
    case 0x0c: // andi
    case 0x0d: // ori
    case 0x0e: // xori
      sources = [rs];
      destination = rt;
      break;
    case 0x0f: // lui
      destination = rt;
      break;
    case 0x10: // cop0
      if (rs === 0x00) {
        destination = rt; // mfc0
      } else if (rs === 0x04) {
        sources = [rt]; // mtc0
      }
      break;
    case 0x11: // cop1
      if (rs === 0x00) {
        destination = rt; // mfc1
      } else if (rs === 0x04) {
        sources = [rt]; // mtc1
      }
      break;
    case 0x14: // beql (not fully decoded but behaves like beq for hazards)
    case 0x15: // bnel
      sources = [rs, rt];
      isControl = true;
      break;
    case 0x16: // blezl
    case 0x17: // bgtzl
      sources = [rs];
      isControl = true;
      break;
    case 0x20: // lb
    case 0x21: // lh
    case 0x22: // lwl
    case 0x23: // lw
    case 0x24: // lbu
    case 0x25: // lhu
    case 0x26: // lwr
      sources = [rs];
      destination = rt;
      isLoad = true;
      break;
    case 0x28: // sb
    case 0x29: // sh
    case 0x2b: // sw
    case 0x2a: // swl
    case 0x2e: // swr
      sources = [rs, rt];
      isStore = true;
      break;
    case 0x2c: // swc1
    case 0x2d: // sdc1
      sources = [rs];
      isStore = true;
      break;
    case 0x30: // ll
      sources = [rs];
      destination = rt;
      isLoad = true;
      break;
    case 0x31: // lwc1
    case 0x35: // ldc1
      sources = [rs];
      isLoad = true;
      break;
    case 0x38: // sc
      sources = [rs, rt];
      destination = rt;
      isStore = true;
      break;
    default:
      // Default assumption: I-type arithmetic/logic with rs source and rt destination
      if (opcode !== 0) {
        sources = [rs];
        destination = rt;
      }
  }

  return { sources, destination, isLoad, isStore, isControl };
};

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

    let contextPc = state.getProgramCounter();

    try {
      this.watchEngine?.beginStep();

      const decoding = this.ifId.getCurrent();
      const decodingHazard = decoding ? decodeHazardInfo(decoding.instruction) : EMPTY_HAZARD;
      const { loadUseHazard, structuralHazard } = this.detectHazards(decodingHazard);

      // MEM/WB stage simply tracks the instruction retiring from EX/MEM.
      this.memWb.setNext(this.exMem.getCurrent());

      // EX/MEM stage executes the decoded instruction.
      const executing = this.idEx.getCurrent();
      let branchRegistered = false;
      if (executing?.decoded) {
        contextPc = executing.pc;
        executing.decoded.execute(state, memory, this.cpu);
        branchRegistered = state.isBranchRegistered();
      }
      this.exMem.setNext(executing);

      // Finalize delayed branches before fetching the next instruction.
      state.finalizeDelayedBranch();

      // ID/EX stage decodes the fetched instruction unless stalled by a data hazard.
      if (loadUseHazard) {
        this.idEx.setNext(null);
      } else if (decoding) {
        contextPc = decoding.pc;
        const decoded = decoder.decode(decoding.instruction, decoding.pc);
        if (!decoded) {
          throw new InvalidInstruction(decoding.instruction);
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
      const canFetch =
        !breakpointHit && !state.isTerminated() && !branchRegistered && !structuralHazard && this.canFetchInstruction(fetchPc);

      if (loadUseHazard) {
        this.ifId.setNext(decoding);
      } else if (canFetch) {
        contextPc = fetchPc;
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
    } catch (error) {
      throw normalizeCpuException(error, contextPc);
    }
  }

  private detectHazards(decodingHazard: HazardInfo): { loadUseHazard: boolean; structuralHazard: boolean } {
    const executing = this.idEx.getCurrent();
    const memoryStage = this.exMem.getCurrent();

    const executingHazard = executing ? decodeHazardInfo(executing.instruction) : EMPTY_HAZARD;
    const memoryHazard = memoryStage ? decodeHazardInfo(memoryStage.instruction) : EMPTY_HAZARD;

    const loadUseHazard =
      executingHazard.isLoad &&
      executingHazard.destination !== null &&
      executingHazard.destination !== 0 &&
      decodingHazard.sources.some((source) => source === executingHazard.destination);

    const structuralHazard = memoryHazard.isLoad || memoryHazard.isStore;

    return { loadUseHazard, structuralHazard };
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
