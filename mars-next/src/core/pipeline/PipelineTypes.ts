import type { DecodedInstruction } from "../cpu/Cpu";

export type PipelineRegisterPayload = { pc: number; instruction: number; decoded?: DecodedInstruction } | null;
