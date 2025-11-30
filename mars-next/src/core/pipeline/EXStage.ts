import type { Cpu, InstructionMemory } from "../cpu/Cpu";
import type { MachineState } from "../state/MachineState";
import type { PipelineRegisterPayload } from "./PipelineTypes";

export interface EXStageParams {
  executing: PipelineRegisterPayload;
  state: MachineState;
  memory: InstructionMemory;
  cpu: Cpu;
}

export interface EXStageResult {
  executed: PipelineRegisterPayload;
  branchRegistered: boolean;
}

export class EXStage {
  run(params: EXStageParams): EXStageResult {
    let branchRegistered = false;
    if (params.executing?.decoded) {
      params.executing.decoded.execute(params.state, params.memory, params.cpu);
      branchRegistered = params.state.isBranchRegistered();
    }

    return { executed: params.executing, branchRegistered };
  }
}
