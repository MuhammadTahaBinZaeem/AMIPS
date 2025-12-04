import { decodeInstruction } from "../../../core/cpu/Instructions";
import { Cpu, type InstructionDecoder } from "../../../core/cpu/Cpu";
import { PipelineSimulator } from "../../../core/pipeline/PipelineSimulator";
import { BreakpointEngine } from "../../../core/debugger/BreakpointEngine";
import { WatchEngine } from "../../../core/debugger/WatchEngine";
import { ProgramLoader } from "../../../core/loader/ProgramLoader";
import { Memory } from "../../../core/memory/Memory";
import { type BinaryImage } from "../../../core/assembler/Assembler";
import { MachineState } from "../../../core/state/MachineState";
import { publishCpuState } from "../../tools/register-viewer";
import { loadSettings } from "../../settings";
import type { RuntimeStatus } from "../../../core";

function publishStateSnapshot(state: MachineState): void {
  publishCpuState({
    registers: Array.from({ length: MachineState.REGISTER_COUNT }, (_, index) => state.getRegister(index)),
    hi: state.getHi(),
    lo: state.getLo(),
    pc: state.getProgramCounter(),
  });
}

export async function runProgram(binaryImage: BinaryImage): Promise<void> {
  const settings = loadSettings();
  const machineState = new MachineState();
  const memory = new Memory();
  const loader = new ProgramLoader(memory);
  const layout = loader.loadProgram(machineState, binaryImage);

  const decoder: InstructionDecoder = {
    decode: (instruction, pc) => decodeInstruction(instruction, pc),
  };

  if (settings.executionMode === "pipeline") {
    const cpu = new Cpu({ memory, decoder, state: machineState });
    const pipeline = new PipelineSimulator({
      cpu,
      breakpoints: new BreakpointEngine(),
      watchEngine: new WatchEngine(machineState, memory),
      forwardingEnabled: settings.forwardingEnabled,
      hazardDetectionEnabled: settings.hazardDetectionEnabled,
    });
    pipeline.setTextBase(layout.textBase);

    let status: RuntimeStatus = "running";
    while (status === "running") {
      status = pipeline.step();
      publishStateSnapshot(machineState);
      await Promise.resolve();
    }

    return;
  }

  const cpu = new Cpu({ memory, decoder, state: machineState });
  machineState.setProgramCounter(layout.textBase);

  while (!machineState.isTerminated()) {
    cpu.step();
    publishStateSnapshot(machineState);
    await Promise.resolve();
  }
}
