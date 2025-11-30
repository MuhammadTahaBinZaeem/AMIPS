import type { InstructionMemory } from "../cpu/Cpu";
import type { MachineState } from "../state/MachineState";
import type { PipelineRegisterPayload } from "./PipelineTypes";

export interface IFStageParams {
  fetchPc: number;
  state: MachineState;
  memory: InstructionMemory;
  loadUseHazard: boolean;
  canFetch: boolean;
  previousDecoding: PipelineRegisterPayload;
}

export class IFStage {
  run(params: IFStageParams): PipelineRegisterPayload {
    if (params.loadUseHazard) {
      return params.previousDecoding;
    }

    if (!params.canFetch) {
      return null;
    }

    const rawInstruction = params.memory.loadWord(params.fetchPc);
    params.state.incrementProgramCounter();
    return { pc: params.fetchPc, instruction: rawInstruction };
  }
}
