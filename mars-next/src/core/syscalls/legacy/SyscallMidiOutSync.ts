import { SyscallDevices, SyscallHandler } from "../SyscallHandlers";
import { SyscallImplementation } from "../SyscallTable";

type HandlerMap = Record<string, SyscallHandler>;

const PITCH_MIN = 0;
const PITCH_MAX = 127;
const DEFAULT_PITCH = 60;
const DEFAULT_DURATION = 1000;
const DEFAULT_INSTRUMENT = 0;
const DEFAULT_VOLUME = 100;

/**
 * Synchronous MIDI output (syscall 33). Behaviour mirrors SyscallMidiOut but
 * optionally waits using the timer device to simulate the blocking duration.
 */
export function createMidiOutSyncSyscall(devices: SyscallDevices, handlers: HandlerMap): SyscallImplementation {
  return (state): void => {
    const rawPitch = state.getRegister(4);
    const rawDuration = state.getRegister(5);
    const rawInstrument = state.getRegister(6);
    const rawVolume = state.getRegister(7);

    const pitch = clampByte(rawPitch, DEFAULT_PITCH);
    const duration = rawDuration < 0 ? DEFAULT_DURATION : rawDuration;
    const instrument = clampByte(rawInstrument, DEFAULT_INSTRUMENT);
    const volume = clampByte(rawVolume, DEFAULT_VOLUME);

    if (!tryHandler("midi_out_sync", handlers, pitch, duration, instrument, volume)) {
      devices.terminal?.printString?.(
        `MIDI OUT SYNC pitch=${pitch} duration=${duration} instrument=${instrument} volume=${volume}\n`,
      );
      devices.timer?.tick(duration);
    }

    state.setRegister(2, 0);
  };
}

function tryHandler(name: string, handlers: HandlerMap, ...args: unknown[]): boolean {
  const handler = handlers[name];
  if (!handler) return false;
  try {
    handler(...args);
    return true;
  } catch {
    return false;
  }
}

function clampByte(value: number, fallback: number): number {
  if (Number.isNaN(value) || value < PITCH_MIN || value > PITCH_MAX) {
    return fallback;
  }
  return value;
}
