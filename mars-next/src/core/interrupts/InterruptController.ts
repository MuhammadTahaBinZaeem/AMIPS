import { Device } from "../devices/Device";
import { TimerDevice } from "../devices/TimerDevice";
import { SyscallException } from "../exceptions/ExecutionExceptions";
import { InstructionMemory } from "../cpu/Cpu";
import { MachineState } from "../state/MachineState";

export type InterruptType = "timer" | "io" | "syscall";

export interface InterruptRequest {
  type: InterruptType;
  source?: Device;
  code?: number | null;
  pc?: number;
}

export type InterruptRoutine = (
  state: MachineState,
  memory: InstructionMemory,
  request: InterruptRequest,
) => number | void;

export interface InterruptControllerOptions {
  timerHandler?: InterruptRoutine;
  ioHandler?: InterruptRoutine;
  syscallHandler?: InterruptRoutine;
}

export class InterruptController {
  private readonly handlers: Partial<Record<InterruptType, InterruptRoutine>>;
  private readonly pending: InterruptRequest[] = [];

  constructor(options: InterruptControllerOptions = {}) {
    this.handlers = {
      timer: options.timerHandler,
      io: options.ioHandler,
      syscall: options.syscallHandler,
    };
  }

  hasPendingInterrupt(): boolean {
    return this.pending.length > 0;
  }

  requestDeviceInterrupt(device?: Device): void {
    const type: InterruptType = device instanceof TimerDevice ? "timer" : "io";
    this.enqueue({ type, source: device });
  }

  requestSyscallInterrupt(code: number | null, pc: number): void {
    this.enqueue({ type: "syscall", code, pc });
  }

  requestException(error: unknown, pc: number): void {
    if (error instanceof SyscallException) {
      this.requestSyscallInterrupt(error.code, pc);
    }
  }

  handleNextInterrupt(state: MachineState, memory: InstructionMemory, currentPc: number): boolean {
    const request = this.pending.shift();
    if (!request) return false;

    const epc = request.pc ?? currentPc;
    state.setCop0Epc(epc);
    state.setKernelMode(true);

    const handler = this.handlers[request.type];
    const nextPc = handler?.(state, memory, request);
    if (typeof nextPc === "number") {
      state.setProgramCounter(nextPc);
    }

    return true;
  }

  private enqueue(request: InterruptRequest): void {
    this.pending.push(request);
  }
}
