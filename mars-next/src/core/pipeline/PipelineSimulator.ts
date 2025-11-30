import { decodeInstruction } from "../cpu/Instructions";
import { Cpu, type DecodedInstruction, type InstructionDecoder, type InstructionMemory } from "../cpu/Cpu";
import { SyscallException, normalizeCpuException } from "../exceptions/ExecutionExceptions";
import { DEFAULT_TEXT_BASE, MachineState } from "../state/MachineState";
import { BreakpointEngine } from "../debugger/BreakpointEngine";
import { WatchEngine } from "../debugger/WatchEngine";
import { InterruptController } from "../interrupts/InterruptController";
import { Memory } from "../memory/Memory";
import { publishPipelineSnapshot, type PipelineSnapshot, type PipelineStageState } from "../tools/pipelineEvents";
import { publishRuntimeSnapshot, type RuntimeStatus } from "../tools/runtimeEvents";
import { PipelineRegister } from "./PipelineRegister";
import { HazardUnit, decodeHazardInfo, EMPTY_HAZARD } from "./HazardUnit";
import { IFStage } from "./IFStage";
import { IDStage } from "./IDStage";
import { EXStage } from "./EXStage";
import { MEMStage } from "./MEMStage";
import { WBStage } from "./WBStage";
import type { PipelineRegisterPayload } from "./PipelineTypes";

export interface PerformanceCounters {
  cycleCount: number;
  instructionCount: number;
  stallCount: number;
}

export interface PipelineOptions {
  memory?: InstructionMemory;
  state?: MachineState;
  decoder?: InstructionDecoder;
  cpu?: Cpu;
  breakpoints?: BreakpointEngine;
  watchEngine?: WatchEngine;
  interrupts?: InterruptController;
  forwardingEnabled?: boolean;
  hazardDetectionEnabled?: boolean;
}

interface PipelineSnapshotContext {
  loadUseHazard?: boolean;
  structuralHazard?: boolean;
  branchRegistered?: boolean;
  stalledStages?: Partial<Record<keyof PipelineSnapshot["registers"], boolean>>;
  pipelineCleared?: boolean;
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

export class PipelineSimulator {
  private readonly cpu: Cpu;
  private readonly interrupts: InterruptController;
  private readonly breakpoints: BreakpointEngine | null;
  private readonly watchEngine: WatchEngine | null;
  private readonly ifId: PipelineRegister<PipelineRegisterPayload>;
  private readonly idEx: PipelineRegister<PipelineRegisterPayload>;
  private readonly exMem: PipelineRegister<PipelineRegisterPayload>;
  private readonly memWb: PipelineRegister<PipelineRegisterPayload>;
  private readonly hazardUnit = new HazardUnit();
  private readonly ifStage = new IFStage();
  private readonly idStage = new IDStage();
  private readonly exStage = new EXStage();
  private readonly memStage = new MEMStage();
  private readonly wbStage = new WBStage();
  private forwardingEnabled: boolean;
  private hazardDetectionEnabled: boolean;
  private halted = false;
  private textBase = DEFAULT_TEXT_BASE;

  private cycleCount = 0;
  private instructionCount = 0;
  private stallCount = 0;

  constructor(options: PipelineOptions) {
    const decoder = options.decoder ?? ({
      decode: (instruction: number, pc: number): DecodedInstruction | null => decodeInstruction(instruction, pc),
    } as InstructionDecoder);

    if (!options.cpu && !options.memory) {
      throw new Error("Pipeline requires either a CPU instance or instruction memory");
    }

    this.cpu = options.cpu ?? new Cpu({ memory: options.memory!, decoder, state: options.state });
    this.interrupts = options.interrupts ?? new InterruptController();
    this.breakpoints = options.breakpoints ?? null;
    this.watchEngine = options.watchEngine ?? null;
    this.ifId = new PipelineRegister<PipelineRegisterPayload>(null);
    this.idEx = new PipelineRegister<PipelineRegisterPayload>(null);
    this.exMem = new PipelineRegister<PipelineRegisterPayload>(null);
    this.memWb = new PipelineRegister<PipelineRegisterPayload>(null);
    this.forwardingEnabled = options.forwardingEnabled ?? true;
    this.hazardDetectionEnabled = options.hazardDetectionEnabled ?? true;

    this.publishPipelineState();
  }

  setTextBase(address: number): void {
    this.textBase = address | 0;
  }

  getState(): MachineState {
    return this.cpu.getState();
  }

  getPerformanceCounters(): PerformanceCounters {
    return {
      cycleCount: this.cycleCount,
      instructionCount: this.instructionCount,
      stallCount: this.stallCount,
    };
  }

  resetPerformanceCounters(): void {
    this.cycleCount = 0;
    this.instructionCount = 0;
    this.stallCount = 0;
  }

  setForwardingEnabled(enabled: boolean): void {
    this.forwardingEnabled = enabled;
    this.publishPipelineState();
  }

  setHazardDetectionEnabled(enabled: boolean): void {
    this.hazardDetectionEnabled = enabled;
    this.publishPipelineState();
  }

  getForwardingEnabled(): boolean {
    return this.forwardingEnabled;
  }

  getHazardDetectionEnabled(): boolean {
    return this.hazardDetectionEnabled;
  }

  isHalted(): boolean {
    return this.halted;
  }

  halt(): void {
    this.halted = true;
    this.publishRuntimeState("halted", this.cpu.getState(), this.cpu.getMemory());
  }

  resume(): void {
    this.halted = false;
    this.publishRuntimeState("running", this.cpu.getState(), this.cpu.getMemory());
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

  executeCycle(): RuntimeStatus {
    return this.step();
  }

  step(): RuntimeStatus {
    const state = this.cpu.getState();
    const memory = this.cpu.getMemory();

    const snapshotContext: PipelineSnapshotContext = {
      loadUseHazard: false,
      structuralHazard: false,
      branchRegistered: false,
      stalledStages: {},
      pipelineCleared: false,
    };

    const finalize = (status: RuntimeStatus): RuntimeStatus => {
      this.publishPipelineState(snapshotContext);
      return this.publishRuntimeState(status, state, memory);
    };

    const clearPipelineWithContext = (): void => {
      snapshotContext.pipelineCleared = true;
      this.clearPipeline();
    };

    if (this.halted) return finalize("halted");

    const decoder = this.cpu.getDecoder();

    let contextPc = state.getProgramCounter();

    this.cycleCount += 1;

    if (this.memWb.getCurrent()) {
      this.instructionCount += 1;
    }

    try {
      this.watchEngine?.beginStep();

      if (this.servicePendingInterrupts(state, memory, contextPc)) {
        this.watchEngine?.completeStep();
        clearPipelineWithContext();
        if (state.isTerminated()) {
          this.halted = true;
          return finalize("terminated");
        }
        return finalize("running");
      }

      const decoding = this.ifId.getCurrent();
      const decodingHazard =
        this.hazardDetectionEnabled && decoding ? decodeHazardInfo(decoding.instruction) : EMPTY_HAZARD;
      const { loadUseHazard, structuralHazard } = this.hazardDetectionEnabled
        ? this.hazardUnit.detect(decodingHazard, this.idEx.getCurrent(), this.exMem.getCurrent(), {
            forwardingEnabled: this.forwardingEnabled,
          })
        : { loadUseHazard: false, structuralHazard: false };

      snapshotContext.loadUseHazard = loadUseHazard;
      snapshotContext.structuralHazard = structuralHazard;

      if (loadUseHazard || structuralHazard) {
        snapshotContext.stalledStages = { ...snapshotContext.stalledStages, ifId: true };
        this.stallCount += 1;
      }

      const wbPayload = this.wbStage.run(this.exMem.getCurrent());
      this.memWb.setNext(wbPayload);

      const executing = this.idEx.getCurrent();
      if (executing?.decoded) {
        contextPc = executing.pc;
      }
      const { executed, branchRegistered } = this.exStage.run({ executing, state, memory, cpu: this.cpu });
      snapshotContext.branchRegistered = branchRegistered;
      this.exMem.setNext(this.memStage.run(executed));

      state.finalizeDelayedBranch();

      const decoded = this.idStage.run({ decoding, loadUseHazard, decoder });
      if (decoding?.pc) {
        contextPc = decoding.pc;
      }
      this.idEx.setNext(decoded);

      const fetchPc = state.getProgramCounter();
      const instructionIndex = ((fetchPc - this.textBase) / 4) | 0;
      const breakpointHit = this.breakpoints?.checkForHit(fetchPc, instructionIndex, state) ?? false;

      const canFetch =
        !breakpointHit && !state.isTerminated() && !branchRegistered && !structuralHazard && this.canFetchInstruction(fetchPc);

      const fetched = this.ifStage.run({
        fetchPc,
        state,
        memory,
        loadUseHazard,
        canFetch,
        previousDecoding: decoding,
      });
      if (canFetch) {
        contextPc = fetchPc;
      }
      this.ifId.setNext(fetched);

      this.advancePipeline();

      this.watchEngine?.completeStep();

      if (this.servicePendingInterrupts(state, memory, contextPc)) {
        clearPipelineWithContext();
        if (state.isTerminated()) {
          this.halted = true;
          return finalize("terminated");
        }
        return finalize("running");
      }

      if (state.isTerminated()) {
        this.halted = true;
        clearPipelineWithContext();
        return finalize("terminated");
      }

      if (breakpointHit) {
        this.halted = true;
        return finalize("breakpoint");
      }

      if (this.isPipelineEmpty() && !this.canFetchInstruction(state.getProgramCounter())) {
        this.halted = true;
        return finalize("halted");
      }

      return finalize("running");
    } catch (error) {
      if (error instanceof SyscallException) {
        this.interrupts.requestSyscallInterrupt(error.code, contextPc);
        this.servicePendingInterrupts(state, memory, contextPc);
        this.watchEngine?.completeStep();
        clearPipelineWithContext();
        if (state.isTerminated()) {
          this.halted = true;
          return finalize("terminated");
        }
        return finalize("running");
      }

      this.interrupts.requestException(error, contextPc);
      if (this.servicePendingInterrupts(state, memory, contextPc)) {
        this.watchEngine?.completeStep();
        clearPipelineWithContext();
        if (state.isTerminated()) {
          this.halted = true;
          return finalize("terminated");
        }
        return finalize("running");
      }

      this.publishPipelineState(snapshotContext);
      throw normalizeCpuException(error, contextPc);
    }
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

  private publishPipelineState(context: PipelineSnapshotContext = {}): void {
    const flushed = context.pipelineCleared ?? false;
    const stalledStages = context.stalledStages ?? {};

    const toStageState = (payload: PipelineRegisterPayload, stalled?: boolean): PipelineStageState => ({
      pc: payload?.pc ?? null,
      instruction: payload?.instruction ?? null,
      decodedName: payload?.decoded?.name ?? null,
      bubble: payload === null,
      stalled: stalled ?? false,
      flushed,
    });

    publishPipelineSnapshot({
      cycle: this.cycleCount,
      registers: {
        ifId: toStageState(this.ifId.getCurrent(), stalledStages.ifId),
        idEx: toStageState(this.idEx.getCurrent(), stalledStages.idEx),
        exMem: toStageState(this.exMem.getCurrent(), stalledStages.exMem),
        memWb: toStageState(this.memWb.getCurrent(), stalledStages.memWb),
      },
      loadUseHazard: context.loadUseHazard ?? false,
      structuralHazard: context.structuralHazard ?? false,
      branchRegistered: context.branchRegistered ?? false,
      forwardingEnabled: this.forwardingEnabled,
      hazardDetectionEnabled: this.hazardDetectionEnabled,
    });
  }

  private publishRuntimeState(status: RuntimeStatus, state: MachineState, memory: InstructionMemory): RuntimeStatus {
    publishRuntimeSnapshot({
      status,
      state,
      memory: memory instanceof Memory ? memory : undefined,
    });

    return status;
  }

  private servicePendingInterrupts(state: MachineState, memory: InstructionMemory, contextPc: number): boolean {
    let handled = false;
    while (this.interrupts.hasPendingInterrupt()) {
      this.interrupts.handleNextInterrupt(state, memory, contextPc);
      handled = true;
    }
    return handled;
  }
}
