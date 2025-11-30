import { Assembler, BinaryImage, type AssemblerOptions } from "./assembler/Assembler";
import { Cpu, InstructionDecoder } from "./cpu/Cpu";
import { decodeInstruction } from "./cpu/Instructions";
import { Pipeline, type PerformanceCounters } from "./cpu/Pipeline";
import { TerminalDevice } from "./devices/TerminalDevice";
import { BreakpointEngine } from "./debugger/BreakpointEngine";
import { WatchEngine } from "./debugger/WatchEngine";
import { ProgramLoader, type ProgramLayout, type ProgramLoadOptions } from "./loader/ProgramLoader";
import { Linker } from "./loader/Linker";
import { Memory } from "./memory/Memory";
import { DEFAULT_TEXT_BASE, MachineState } from "./state/MachineState";
import { createDefaultSyscallHandlers, type SyscallDevices, type SyscallHandler } from "./syscalls/SyscallHandlers";
import { SyscallTable } from "./syscalls/SyscallTable";
import { SyscallException } from "./exceptions/ExecutionExceptions";
import { InterruptController, InterruptControllerOptions } from "./interrupts/InterruptController";
import { createEmptyPipelineSnapshot, publishPipelineSnapshot } from "./tools/pipelineEvents";
import { publishRuntimeSnapshot, type RuntimeStatus } from "./tools/runtimeEvents";

export * from "./cpu/Cpu";
export * from "./cpu/Pipeline";
export * from "./memory/Memory";
export * from "./memory/Caches";
export * from "./memory/MemoryMap";
export * from "./assembler/Assembler";
export * from "./assembler/PseudoOps";
export * from "./loader/ProgramLoader";
export * from "./loader/ExecutableParser";
export * from "./loader/Linker";
export * from "./devices/Device";
export * from "./devices/BitmapDisplayDevice";
export * from "./devices/TerminalDevice";
export * from "./devices/FileDevice";
export * from "./devices/TimerDevice";
export * from "./devices/KeyboardDevice";
export * from "./devices/DisplayDevice";
export * from "./devices/RandomStreamDevice";
export * from "./devices/AudioDevice";
export * from "./devices/SevenSegmentDisplayDevice";
export * from "./devices/RealTimeClockDevice";
export * from "./syscalls/SyscallTable";
export * from "./syscalls/SyscallHandlers";
export * from "./debugger/BreakpointEngine";
export * from "./debugger/Disassembler";
export * from "./debugger/WatchEngine";
export * from "./state/MachineState";
export * from "./exceptions/AccessExceptions";
export * from "./exceptions/ExecutionExceptions";
export * from "./interrupts/InterruptController";
export * from "./tools/MarsTool";
export * from "./tools/runtimeEvents";
export * from "./tools/pipelineEvents";

export type ExecutionMode = "pipeline" | "sequential";

export interface CoreEngineOptions {
  decoder?: InstructionDecoder;
  memory?: Memory;
  state?: MachineState;
  devices?: SyscallDevices;
  syscallHandlers?: Record<string, SyscallHandler>;
  enableBreakpoints?: boolean;
  enableWatchEngine?: boolean;
  breakpointEngine?: BreakpointEngine;
  watchEngine?: WatchEngine;
  interruptController?: InterruptController;
  interruptHandlers?: InterruptControllerOptions;
  forwardingEnabled?: boolean;
  hazardDetectionEnabled?: boolean;
  executionMode?: ExecutionMode;
}

export type EngineStepResult = ReturnType<Pipeline["step"]>;

function createDefaultDecoder(syscalls: SyscallTable | null, interrupts?: InterruptController): InstructionDecoder {
  return {
    decode: (instruction, pc) => {
      if (instruction === 0x0000000c) {
        if (interrupts) {
          return {
            name: "syscall",
            execute: (state, memory) => {
              interrupts.requestSyscallInterrupt(state.getRegister(2), pc);
              interrupts.handleNextInterrupt(state, memory, pc);
            },
          };
        }

        if (!syscalls) {
          throw new SyscallException(null, pc, "Encountered syscall instruction but no SyscallTable is wired");
        }

        return {
          name: "syscall",
          execute: (state) => syscalls.handle(state.getRegister(2), state),
        };
      }

      return decodeInstruction(instruction, pc);
    },
  };
}

export class CoreEngine {
  private readonly memory: Memory;
  private readonly state: MachineState;
  private readonly loader: ProgramLoader;
  private readonly breakpoints: BreakpointEngine | null;
  private readonly watchEngine: WatchEngine | null;
  private readonly syscalls: SyscallTable | null;
  private readonly interrupts: InterruptController;
  private readonly decoder: InstructionDecoder;
  private readonly cpu: Cpu;
  private readonly pipeline: Pipeline;
  private executionMode: ExecutionMode;
  private sequentialPerformanceCounters: PerformanceCounters = { cycleCount: 0, instructionCount: 0, stallCount: 0 };
  private sequentialHalted = false;
  private textBase = DEFAULT_TEXT_BASE;
  private lastLayout: ProgramLayout | null = null;
  private symbolTable: Record<string, number> = {};

  constructor(options: CoreEngineOptions = {}) {
    this.memory = options.memory ?? new Memory();
    this.state = options.state ?? new MachineState();
    this.loader = new ProgramLoader(this.memory);

    this.breakpoints = options.enableBreakpoints === false ? null : options.breakpointEngine ?? new BreakpointEngine();
    this.watchEngine =
      options.enableWatchEngine === false ? null : options.watchEngine ?? new WatchEngine(this.state, this.memory);

    const devices: SyscallDevices = options.devices ?? { terminal: new TerminalDevice() };
    const handlerOverrides = options.syscallHandlers ?? createDefaultSyscallHandlers(devices);
    this.syscalls = new SyscallTable(this.memory, devices, handlerOverrides);
    this.interrupts =
      options.interruptController ??
      new InterruptController({
        ...options.interruptHandlers,
        syscallHandler: (state, memory, request) => {
          const code = request.code ?? state.getRegister(2);
          if (!this.syscalls) {
            throw new SyscallException(code, request.pc, "Encountered syscall instruction but no SyscallTable is wired");
          }
          this.syscalls.handle(code, state);
          return options.interruptHandlers?.syscallHandler?.(state, memory, request);
        },
      });

    this.memory.onInterrupt((device) => this.interrupts.requestDeviceInterrupt(device));

    this.decoder = options.decoder ?? createDefaultDecoder(this.syscalls, this.interrupts);
    this.cpu = new Cpu({ memory: this.memory, decoder: this.decoder, state: this.state });

    this.pipeline = new Pipeline({
      cpu: this.cpu,
      breakpoints: this.breakpoints ?? undefined,
      watchEngine: this.watchEngine ?? undefined,
      interrupts: this.interrupts,
      forwardingEnabled: options.forwardingEnabled,
      hazardDetectionEnabled: options.hazardDetectionEnabled,
    });

    this.executionMode = options.executionMode ?? "pipeline";
  }

  assemble(source: string): BinaryImage {
    return assemble(source);
  }

  load(binary: BinaryImage, options?: ProgramLoadOptions): ProgramLayout {
    this.lastLayout = this.loader.loadProgram(this.state, binary, options);
    this.textBase = this.lastLayout.textBase;
    this.pipeline.setTextBase(this.lastLayout.textBase);
    this.symbolTable = this.lastLayout.symbols;
    this.pipeline.resetPerformanceCounters();
    this.sequentialPerformanceCounters = { cycleCount: 0, instructionCount: 0, stallCount: 0 };
    this.sequentialHalted = false;
    this.resume();

    if (this.breakpoints) {
      this.breakpoints.setSymbolTable(this.symbolTable);
    }
    if (this.watchEngine && typeof this.watchEngine.setSymbolTable === "function") {
      this.watchEngine.setSymbolTable(this.symbolTable);
    }

    return this.lastLayout;
  }

  getProgramLayout(): ProgramLayout | null {
    return this.lastLayout;
  }

  getSymbolTable(): Record<string, number> {
    return this.symbolTable;
  }

  getState(): MachineState {
    return this.state;
  }

  getMemory(): Memory {
    return this.memory;
  }

  getSyscallTable(): SyscallTable | null {
    return this.syscalls;
  }

  step(): EngineStepResult {
    return this.executionMode === "pipeline" ? this.pipeline.step() : this.stepSequential();
  }

  run(maxCycles?: number): void {
    if (this.executionMode === "pipeline") {
      this.pipeline.run(maxCycles);
      return;
    }

    let cycles = 0;
    const max = maxCycles ?? Number.MAX_SAFE_INTEGER;
    while (!this.sequentialHalted && cycles < max) {
      const status = this.stepSequential();
      if (status !== "running") break;
      cycles += 1;
    }
  }

  halt(): void {
    if (this.executionMode === "pipeline") {
      this.pipeline.halt();
      return;
    }

    this.sequentialHalted = true;
    this.publishSequentialRuntimeSnapshot("halted");
  }

  resume(): void {
    if (this.executionMode === "pipeline") {
      this.pipeline.resume();
      return;
    }

    this.sequentialHalted = false;
    this.publishSequentialRuntimeSnapshot("running");
  }

  addBreakpoint(address: number): void {
    if (!this.breakpoints) {
      throw new Error("Breakpoints are not enabled for this engine");
    }
    this.breakpoints.setBreakpoint(address);
  }

  addBreakpointByLabel(label: string): number {
    if (!this.breakpoints) {
      throw new Error("Breakpoints are not enabled for this engine");
    }
    return this.breakpoints.setBreakpointByLabel(label);
  }

  removeBreakpoint(address: number): void {
    if (!this.breakpoints) {
      return;
    }
    this.breakpoints.removeBreakpoint(address);
  }

  removeBreakpointByLabel(label: string): void {
    if (!this.breakpoints) return;
    this.breakpoints.removeBreakpointByLabel(label);
  }

  clearBreakpoints(): void {
    this.breakpoints?.clearAll();
  }

  getDebuggerEngines(): { breakpoints: BreakpointEngine | null; watchEngine: WatchEngine | null } {
    return { breakpoints: this.breakpoints, watchEngine: this.watchEngine };
  }

  getPerformanceCounters(): PerformanceCounters {
    return this.executionMode === "pipeline"
      ? this.pipeline.getPerformanceCounters()
      : this.sequentialPerformanceCounters;
  }

  resetPerformanceCounters(): void {
    this.pipeline.resetPerformanceCounters();
    this.sequentialPerformanceCounters = { cycleCount: 0, instructionCount: 0, stallCount: 0 };
  }

  setForwardingEnabled(enabled: boolean): void {
    this.pipeline.setForwardingEnabled(enabled);
  }

  setHazardDetectionEnabled(enabled: boolean): void {
    this.pipeline.setHazardDetectionEnabled(enabled);
  }

  getForwardingEnabled(): boolean {
    return this.pipeline.getForwardingEnabled();
  }

  getHazardDetectionEnabled(): boolean {
    return this.pipeline.getHazardDetectionEnabled();
  }

  setExecutionMode(mode: ExecutionMode): void {
    this.executionMode = mode;
    if (mode === "sequential") {
      this.sequentialHalted = false;
      this.publishSequentialRuntimeSnapshot("running");
    }
  }

  getExecutionMode(): ExecutionMode {
    return this.executionMode;
  }

  private stepSequential(): RuntimeStatus {
    const contextPc = this.state.getProgramCounter();

    if (this.sequentialHalted) {
      return this.publishSequentialRuntimeSnapshot("halted");
    }

    if (this.servicePendingInterrupts(contextPc)) {
      if (this.state.isTerminated()) {
        this.sequentialHalted = true;
        return this.publishSequentialRuntimeSnapshot("terminated");
      }
    }

    const instructionIndex = ((contextPc - this.textBase) / 4) | 0;
    const breakpointHit = this.breakpoints?.checkForHit(contextPc, instructionIndex, this.state) ?? false;
    if (breakpointHit) {
      this.sequentialHalted = true;
      return this.publishSequentialRuntimeSnapshot("breakpoint");
    }

    try {
      this.watchEngine?.beginStep();
      this.cpu.step();
      this.watchEngine?.completeStep();
      this.sequentialPerformanceCounters.cycleCount += 1;
      this.sequentialPerformanceCounters.instructionCount += 1;
    } catch (error) {
      this.watchEngine?.completeStep();
      this.interrupts.requestException(error, contextPc);
      if (this.servicePendingInterrupts(contextPc)) {
        if (this.state.isTerminated()) {
          this.sequentialHalted = true;
          return this.publishSequentialRuntimeSnapshot("terminated");
        }
        return this.publishSequentialRuntimeSnapshot("running");
      }
      throw error;
    }

    if (this.servicePendingInterrupts(this.state.getProgramCounter())) {
      if (this.state.isTerminated()) {
        this.sequentialHalted = true;
        return this.publishSequentialRuntimeSnapshot("terminated");
      }
    }

    if (this.state.isTerminated()) {
      this.sequentialHalted = true;
      return this.publishSequentialRuntimeSnapshot("terminated");
    }

    return this.publishSequentialRuntimeSnapshot("running");
  }

  private publishSequentialRuntimeSnapshot(status: RuntimeStatus): RuntimeStatus {
    publishRuntimeSnapshot({
      status,
      state: this.state,
      memory: this.memory,
    });
    this.publishSequentialPipelineSnapshot();
    return status;
  }

  private publishSequentialPipelineSnapshot(): void {
    publishPipelineSnapshot(
      createEmptyPipelineSnapshot({
        cycle: this.sequentialPerformanceCounters.cycleCount,
        forwardingEnabled: this.pipeline.getForwardingEnabled(),
        hazardDetectionEnabled: this.pipeline.getHazardDetectionEnabled(),
      }),
    );
  }

  private servicePendingInterrupts(contextPc: number): boolean {
    let handled = false;
    while (this.interrupts.hasPendingInterrupt()) {
      this.interrupts.handleNextInterrupt(this.state, this.memory, contextPc);
      handled = true;
    }
    return handled;
  }
}

export function assemble(program: string | string[], assemblerOptions: AssemblerOptions = {}): BinaryImage {
  if (Array.isArray(program)) {
    return assembleFiles(program, assemblerOptions);
  }

  const loader = new ProgramLoader(new Memory());
  const normalizedSource = loader.normalizeSource(program);
  const assembler = new Assembler(assemblerOptions);
  return assembler.assemble(normalizedSource, assemblerOptions);
}

export function assembleFiles(programs: string[], assemblerOptions: AssemblerOptions = {}): BinaryImage {
  if (programs.length === 0) {
    throw new Error("No input files provided for assembly");
  }

  const loader = new ProgramLoader(new Memory());
  const assembler = new Assembler(assemblerOptions);
  const linker = new Linker();

  const images = programs.map((program) => {
    const normalized = loader.normalizeSource(program);
    return assembler.assemble(normalized, assemblerOptions);
  });

  return linker.link(images);
}

export function createEngine(options: CoreEngineOptions = {}): CoreEngine {
  return new CoreEngine(options);
}

export function loadMachineFromBinary(image: BinaryImage, options: CoreEngineOptions = {}): CoreEngine {
  const engine = new CoreEngine(options);
  engine.load(image);
  return engine;
}

export function assembleAndLoad(
  source: string | string[],
  options: CoreEngineOptions & { loadOptions?: ProgramLoadOptions; assemblerOptions?: AssemblerOptions } = {},
): { image: BinaryImage; layout: ProgramLayout; engine: CoreEngine } {
  const { assemblerOptions, loadOptions, ...engineOptions } = options;
  const image = assemble(source, assemblerOptions);
  const engine = new CoreEngine(engineOptions);
  const layout = engine.load(image, loadOptions);
  return { image, layout, engine };
}
