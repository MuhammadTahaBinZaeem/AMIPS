import { MachineState } from "../state/MachineState";

export type WatchKind = "register" | "memory";
export type WatchIdentifier = string | number;

export interface WatchEvent {
  kind: WatchKind;
  identifier: WatchIdentifier;
  oldValue: number;
  newValue: number;
}

interface MemoryReader {
  read(address: number): number;
}

type WatchTarget = {
  key: string;
  kind: WatchKind;
  identifier: WatchIdentifier;
  readValue: () => number;
  lastValue?: number;
};

const REGISTER_ALIASES: Record<string, number> = {
  zero: 0,
  at: 1,
  v0: 2,
  v1: 3,
  a0: 4,
  a1: 5,
  a2: 6,
  a3: 7,
  t0: 8,
  t1: 9,
  t2: 10,
  t3: 11,
  t4: 12,
  t5: 13,
  t6: 14,
  t7: 15,
  s0: 16,
  s1: 17,
  s2: 18,
  s3: 19,
  s4: 20,
  s5: 21,
  s6: 22,
  s7: 23,
  t8: 24,
  t9: 25,
  k0: 26,
  k1: 27,
  gp: 28,
  sp: 29,
  fp: 30,
  s8: 30,
  ra: 31,
};

export class WatchEngine {
  private readonly state: MachineState;
  private readonly memory?: MemoryReader;
  private readonly watches = new Map<string, WatchTarget>();
  private readonly pendingEvents: WatchEvent[] = [];
  private readonly stepSnapshot = new Map<string, number>();

  constructor(state: MachineState, memory?: MemoryReader) {
    this.state = state;
    this.memory = memory;
  }

  addWatch(kind: WatchKind, identifier: WatchIdentifier): void {
    const target = this.createTarget(kind, identifier);
    target.lastValue = target.readValue();
    this.watches.set(target.key, target);
  }

  beginStep(): void {
    this.stepSnapshot.clear();
    for (const watch of this.watches.values()) {
      this.stepSnapshot.set(watch.key, watch.readValue());
    }
  }

  completeStep(): void {
    for (const watch of this.watches.values()) {
      const before = this.stepSnapshot.get(watch.key);
      const current = watch.readValue();

      if (before !== undefined && before !== current) {
        this.pendingEvents.push({
          kind: watch.kind,
          identifier: watch.identifier,
          oldValue: before,
          newValue: current,
        });
      }

      watch.lastValue = current;
    }

    this.stepSnapshot.clear();
  }

  getWatchChanges(): WatchEvent[] {
    const events = [...this.pendingEvents];
    this.pendingEvents.length = 0;
    return events;
  }

  private createTarget(kind: WatchKind, identifier: WatchIdentifier): WatchTarget {
    if (kind === "register") {
      const { index, normalized } = this.normalizeRegister(identifier);
      return {
        key: `${kind}:${index}`,
        kind,
        identifier: normalized,
        readValue: () => this.state.getRegister(index),
      };
    }

    if (!this.memory) {
      throw new Error("Memory watches require a memory instance");
    }

    const address = this.normalizeAddress(identifier);
    return {
      key: `${kind}:${address}`,
      kind,
      identifier: address,
      readValue: () => this.memory!.read(address),
    };
  }

  private normalizeRegister(identifier: WatchIdentifier): { index: number; normalized: string } {
    if (typeof identifier === "number") {
      return this.validateRegisterIndex(identifier);
    }

    const trimmed = identifier.replace(/^\$/g, "").toLowerCase();
    if (/^\d+$/.test(trimmed)) {
      return this.validateRegisterIndex(Number.parseInt(trimmed, 10));
    }

    if (trimmed in REGISTER_ALIASES) {
      return { index: REGISTER_ALIASES[trimmed], normalized: trimmed };
    }

    throw new Error(`Unknown register identifier: ${identifier}`);
  }

  private validateRegisterIndex(index: number): { index: number; normalized: string } {
    if (!Number.isInteger(index) || index < 0 || index > 31) {
      throw new RangeError(`Register index out of bounds: ${index}`);
    }
    return { index, normalized: `${index}` };
  }

  private normalizeAddress(identifier: WatchIdentifier): number {
    if (typeof identifier === "number") {
      return identifier | 0;
    }

    if (/^0x[0-9a-f]+$/i.test(identifier)) {
      return Number.parseInt(identifier, 16) | 0;
    }

    if (/^\d+$/.test(identifier)) {
      return Number.parseInt(identifier, 10) | 0;
    }

    throw new Error(`Unknown memory identifier: ${identifier}`);
  }
}
