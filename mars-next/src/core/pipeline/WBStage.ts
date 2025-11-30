import type { PipelineRegisterPayload } from "./PipelineTypes";

export class WBStage {
  run(memoryStage: PipelineRegisterPayload): PipelineRegisterPayload {
    return memoryStage;
  }
}
