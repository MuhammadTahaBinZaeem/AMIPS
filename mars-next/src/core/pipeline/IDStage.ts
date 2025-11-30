import type { InstructionDecoder } from "../cpu/Cpu";
import { InvalidInstruction } from "../exceptions/ExecutionExceptions";
import type { PipelineRegisterPayload } from "./PipelineTypes";

export interface IDStageParams {
  decoding: PipelineRegisterPayload;
  loadUseHazard: boolean;
  decoder: InstructionDecoder;
}

export class IDStage {
  run(params: IDStageParams): PipelineRegisterPayload {
    if (params.loadUseHazard || !params.decoding) {
      return null;
    }

    const decoded = params.decoder.decode(params.decoding.instruction, params.decoding.pc);
    if (!decoded) {
      throw new InvalidInstruction(params.decoding.instruction);
    }

    return { ...params.decoding, decoded };
  }
}
