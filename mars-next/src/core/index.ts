import { Assembler, BinaryImage } from "./assembler/Assembler";
import { InstructionDecoder } from "./cpu/Cpu";
import { decodeInstruction } from "./cpu/Instructions";
import { Pipeline } from "./cpu/Pipeline";
import { TerminalDevice } from "./devices/TerminalDevice";
import { BreakpointEngine } from "./debugger/BreakpointEngine";
import { WatchEngine } from "./debugger/WatchEngine";
import { ProgramLoader, type ProgramLayout, type ProgramLoadOptions } from "./loader/ProgramLoader";
import { Memory } from "./memory/Memory";
import { MachineState } from "./state/MachineState";
import { createDefaultSyscallHandlers, type SyscallDevices, type SyscallHandler } from "./syscalls/SyscallHandlers";
import { SyscallTable } from "./syscalls/SyscallTable";
import { SyscallException } from "./exceptions/ExecutionExceptions";

export * from "./cpu/Cpu";
export * from "./cpu/Pipeline";
export * from "./memory/Memory";
export * from "./memory/Caches";
export * from "./memory/MemoryMap";
export * from "./assembler/Assembler";
export * from "./loader/ProgramLoader";
export * from "./devices/Device";
export * from "./devices/TerminalDevice";
export * from "./devices/FileDevice";
export * from "./devices/TimerDevice";
export * from "./devices/KeyboardDevice";
export * from "./devices/DisplayDevice";
export * from "./devices/RandomStreamDevice";
export * from "./syscalls/SyscallTable";
export * from "./syscalls/SyscallHandlers";
export * from "./debugger/BreakpointEngine";
export * from "./debugger/WatchEngine";
export * from "./state/MachineState";
export * from "./exceptions/AccessExceptions";
export * from "./exceptions/ExecutionExceptions";

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
}

export type EngineStepResult = ReturnType<Pipeline["step"]>;

function createDefaultDecoder(syscalls?: SyscallTable): InstructionDecoder {
  return {
    decode: (instruction, pc) => {
      if (instruction === 0x0000000c) {
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
  private readonly pipeline: Pipeline;
  private lastLayout: ProgramLayout | null = null;

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

    const decoder = options.decoder ?? createDefaultDecoder(this.syscalls);

    this.pipeline = new Pipeline({
      memory: this.memory,
      state: this.state,
      decoder,
      breakpoints: this.breakpoints ?? undefined,
      watchEngine: this.watchEngine ?? undefined,
    });
  }

  assemble(source: string): BinaryImage {
    return assemble(source);
  }

  load(binary: BinaryImage, options?: ProgramLoadOptions): ProgramLayout {
    this.lastLayout = this.loader.loadProgram(this.state, binary, options);
    this.resume();
    return this.lastLayout;
  }

  getProgramLayout(): ProgramLayout | null {
    return this.lastLayout;
  }

  getState(): MachineState {
    return this.pipeline.getState();
  }

  getMemory(): Memory {
    return this.memory;
  }

  getSyscallTable(): SyscallTable | null {
    return this.syscalls;
  }

  step(): EngineStepResult {
    return this.pipeline.step();
  }

  run(maxCycles?: number): void {
    this.pipeline.run(maxCycles);
  }

  halt(): void {
    this.pipeline.halt();
  }

  resume(): void {
    this.pipeline.resume();
  }

  addBreakpoint(address: number): void {
    if (!this.breakpoints) {
      throw new Error("Breakpoints are not enabled for this engine");
    }
    this.breakpoints.setBreakpoint(address);
  }

  removeBreakpoint(address: number): void {
    if (!this.breakpoints) {
      return;
    }
    this.breakpoints.removeBreakpoint(address);
  }

  clearBreakpoints(): void {
    this.breakpoints?.clearAll();
  }

  getDebuggerEngines(): { breakpoints: BreakpointEngine | null; watchEngine: WatchEngine | null } {
    return { breakpoints: this.breakpoints, watchEngine: this.watchEngine };
  }
}

export function assemble(program: string): BinaryImage {
  const loader = new ProgramLoader(new Memory());
  const normalizedSource = loader.normalizeSource(program);
  const assembler = new Assembler();
  return assembler.assemble(normalizedSource);
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
  source: string,
  options: CoreEngineOptions & { loadOptions?: ProgramLoadOptions } = {},
): { image: BinaryImage; layout: ProgramLayout; engine: CoreEngine } {
  const image = assemble(source);
  const engine = new CoreEngine(options);
  const layout = engine.load(image, options.loadOptions);
  return { image, layout, engine };
}
