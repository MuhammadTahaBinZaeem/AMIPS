import { Assembler } from "./assembler/Assembler";
import { Cpu, InstructionDecoder, InstructionMemory } from "./cpu/Cpu";
import { ProgramLoader } from "./loader/ProgramLoader";
import { MachineState } from "./state/MachineState";

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

type ParsedAssembly = { tokens?: string[] };

class TokenMemory implements InstructionMemory {
  constructor(private readonly instructions: string[], private readonly baseAddress: number) {}

  loadWord(address: number): number {
    const offset = address - this.baseAddress;
    if (offset < 0 || offset % 4 !== 0) {
      throw new Error(`Invalid instruction address: 0x${address.toString(16)}`);
    }

    const index = offset / 4;
    if (index < 0 || index >= this.instructions.length) {
      throw new Error(`Instruction address out of range: 0x${address.toString(16)}`);
    }

    return index;
  }
}

class TokenDecoder implements InstructionDecoder {
  constructor(private readonly instructions: string[], private readonly baseAddress: number) {}

  decode(_instruction: number, programCounter: number) {
    const index = (programCounter - this.baseAddress) / 4;
    const token = this.instructions[index];
    if (token === undefined) return null;

    return {
      name: token,
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

export function assemble(program: string): MachineState {
  const loader = new ProgramLoader();
  const normalizedSource = loader.load(program);

  const assembler = new Assembler();
  const parsed = assembler.assemble(normalizedSource) as ParsedAssembly;
  const instructions = parsed.tokens ?? [];

  const state = new MachineState();
  const memory = new TokenMemory(instructions, state.getProgramCounter());
  const decoder = new TokenDecoder(instructions, state.getProgramCounter());

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
