import type { PipelineRegisterPayload } from "./PipelineTypes";

export class MEMStage {
  run(executed: PipelineRegisterPayload): PipelineRegisterPayload {
    return executed;
  }
}
