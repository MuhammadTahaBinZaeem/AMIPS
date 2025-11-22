import { Assembler, BinaryImage } from "./assembler/Assembler";
import { Cpu, InstructionDecoder } from "./cpu/Cpu";
import { ProgramLoader } from "./loader/ProgramLoader";
import { MachineState } from "./state/MachineState";
import { Memory } from "./memory/Memory";
import { MemoryMap } from "./memory/MemoryMap";

export * from "./cpu/Cpu";
export * from "./cpu/Pipeline";
export * from "./memory/Memory";
export * from "./memory/MemoryMap";
export * from "./assembler/Assembler";
export * from "./loader/ProgramLoader";
export * from "./devices/TerminalDevice";
export * from "./devices/FileDevice";
export * from "./devices/TimerDevice";
export * from "./syscalls/SyscallTable";
export * from "./syscalls/SyscallHandlers";
export * from "./debugger/BreakpointEngine";
export * from "./debugger/WatchEngine";
export * from "./state/MachineState";

class NoopDecoder implements InstructionDecoder {
  constructor(private readonly instructions: number[], private readonly baseAddress: number) {}

  decode(_instruction: number, programCounter: number) {
    const index = (programCounter - this.baseAddress) / 4;
    const word = this.instructions[index];
    if (word === undefined) return null;

    return {
      name: `word_${index}`,
      execute: (state, memory, cpu) => {
        void state;
        void memory;
        void cpu;
        /* placeholder no-op until a real decoder is wired */
      },
    };
  }
}

const cpuRegistry = new WeakMap<MachineState, Cpu>();

export function assemble(program: string): BinaryImage {
  const loader = new ProgramLoader();
  const normalizedSource = loader.load(program);
  const assembler = new Assembler();
  return assembler.assemble(normalizedSource);
}

export function loadMachineFromBinary(image: BinaryImage): MachineState {
  const state = new MachineState();
  state.setProgramCounter(image.textBase);
  const memoryMap = new MemoryMap({ textBase: image.textBase, dataBase: image.dataBase });
  const memory = new Memory({ map: memoryMap });
  memory.loadImage(image);
  const decoder = new NoopDecoder(image.text, image.textBase);
  cpuRegistry.set(state, new Cpu({ memory, decoder, state }));
  return state;
}

export function step(state: MachineState): void {
  const cpu = cpuRegistry.get(state);
  if (!cpu) {
    throw new Error("No CPU registered for the provided state. Did you call assemble()?");
  }
  cpu.step();
}
