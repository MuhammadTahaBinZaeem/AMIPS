import type { PipelineRegisterPayload } from "./PipelineTypes";

export type HazardInfo = {
  sources: number[];
  destination: number | null;
  isLoad: boolean;
  isStore: boolean;
  isControl: boolean;
};

const HI_REGISTER = 33;
const LO_REGISTER = 34;

export const EMPTY_HAZARD: HazardInfo = {
  sources: [],
  destination: null,
  isLoad: false,
  isStore: false,
  isControl: false,
};

export const decodeHazardInfo = (instruction: number): HazardInfo => {
  const opcode = (instruction >>> 26) & 0x3f;
  const rs = (instruction >>> 21) & 0x1f;
  const rt = (instruction >>> 16) & 0x1f;
  const rd = (instruction >>> 11) & 0x1f;
  const funct = instruction & 0x3f;

  let sources: number[] = [];
  let destination: number | null = null;
  let isLoad = false;
  let isStore = false;
  let isControl = false;

  switch (opcode) {
    case 0x00: {
      switch (funct) {
        case 0x00: // sll
        case 0x02: // srl
        case 0x03: // sra
          sources = [rt];
          destination = rd;
          break;
        case 0x08: // jr
          sources = [rs];
          isControl = true;
          break;
        case 0x09: // jalr
          sources = [rs];
          destination = rd === 0 ? 31 : rd;
          isControl = true;
          break;
        case 0x10: // mfhi
          sources = [HI_REGISTER];
          destination = rd;
          break;
        case 0x12: // mflo
          sources = [LO_REGISTER];
          destination = rd;
          break;
        case 0x11: // mthi
          sources = [rs, HI_REGISTER];
          destination = HI_REGISTER;
          break;
        case 0x13: // mtlo
          sources = [rs, LO_REGISTER];
          destination = LO_REGISTER;
          break;
        case 0x18: // mult
        case 0x19: // multu
        case 0x1a: // div
        case 0x1b: // divu
          sources = [rs, rt];
          destination = null; // writes HI/LO, track via sources
          break;
        case 0x0c: // syscall
        case 0x0d: // break
          sources = [];
          destination = null;
          break;
        default:
          sources = [rs, rt];
          destination = rd;
      }
      break;
    }
    case 0x01: {
      // REGIMM branches
      sources = [rs];
      isControl = true;
      if (rt === 0x10 || rt === 0x11) {
        destination = 31; // bltzal/bgezal link register
      }
      break;
    }
    case 0x02: // j
      isControl = true;
      break;
    case 0x03: // jal
      isControl = true;
      destination = 31;
      break;
    case 0x04: // beq
    case 0x05: // bne
      sources = [rs, rt];
      isControl = true;
      break;
    case 0x06: // blez
    case 0x07: // bgtz
      sources = [rs];
      isControl = true;
      break;
    case 0x08: // addi
    case 0x09: // addiu
    case 0x0a: // slti
    case 0x0b: // sltiu
    case 0x0c: // andi
    case 0x0d: // ori
    case 0x0e: // xori
      sources = [rs];
      destination = rt;
      break;
    case 0x0f: // lui
      destination = rt;
      break;
    case 0x10: // cop0
      if (rs === 0x00) {
        destination = rt; // mfc0
      } else if (rs === 0x04) {
        sources = [rt]; // mtc0
      }
      break;
    case 0x11: // cop1
      if (rs === 0x00) {
        destination = rt; // mfc1
      } else if (rs === 0x04) {
        sources = [rt]; // mtc1
      }
      break;
    case 0x14: // beql (not fully decoded but behaves like beq for hazards)
    case 0x15: // bnel
      sources = [rs, rt];
      isControl = true;
      break;
    case 0x16: // blezl
    case 0x17: // bgtzl
      sources = [rs];
      isControl = true;
      break;
    case 0x20: // lb
    case 0x21: // lh
    case 0x22: // lwl
    case 0x23: // lw
    case 0x24: // lbu
    case 0x25: // lhu
    case 0x26: // lwr
      sources = [rs];
      destination = rt;
      isLoad = true;
      break;
    case 0x28: // sb
    case 0x29: // sh
    case 0x2b: // sw
    case 0x2a: // swl
    case 0x2e: // swr
      sources = [rs, rt];
      isStore = true;
      break;
    case 0x2c: // swc1
    case 0x2d: // sdc1
      sources = [rs];
      isStore = true;
      break;
    case 0x30: // ll
      sources = [rs];
      destination = rt;
      isLoad = true;
      break;
    case 0x31: // lwc1
    case 0x35: // ldc1
      sources = [rs];
      isLoad = true;
      break;
    case 0x38: // sc
      sources = [rs, rt];
      destination = rt;
      isStore = true;
      break;
    default:
      // Default assumption: I-type arithmetic/logic with rs source and rt destination
      if (opcode !== 0) {
        sources = [rs];
        destination = rt;
      }
  }

  return { sources, destination, isLoad, isStore, isControl };
};

export class HazardUnit {
  detect(
    decodingHazard: HazardInfo,
    executing: PipelineRegisterPayload,
    memoryStage: PipelineRegisterPayload,
    options?: { forwardingEnabled?: boolean },
  ): { loadUseHazard: boolean; structuralHazard: boolean } {
    const executingHazard = executing ? decodeHazardInfo(executing.instruction) : EMPTY_HAZARD;
    const memoryHazard = memoryStage ? decodeHazardInfo(memoryStage.instruction) : EMPTY_HAZARD;

    const forwardingEnabled = options?.forwardingEnabled ?? true;

    const executingDependency =
      executingHazard.destination !== null &&
      executingHazard.destination !== 0 &&
      decodingHazard.sources.some((source) => source === executingHazard.destination);

    const memoryDependency =
      memoryHazard.destination !== null &&
      memoryHazard.destination !== 0 &&
      decodingHazard.sources.some((source) => source === memoryHazard.destination);

    const loadUseHazard = forwardingEnabled
      ? executingHazard.isLoad && executingDependency
      : executingDependency || memoryDependency;

    const structuralHazard = memoryHazard.isLoad || memoryHazard.isStore;

    return { loadUseHazard, structuralHazard };
  }
}
