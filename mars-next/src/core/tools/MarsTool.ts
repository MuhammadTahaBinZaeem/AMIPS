import React from "react";
import type { Assembler, BinaryImage } from "../assembler/Assembler";
import type { SourceMapEntry } from "../loader/Linker";
import type { KeyboardDevice } from "../devices/KeyboardDevice";
import type { DirtyRegion } from "../devices/BitmapDisplayDevice";
import type { MachineState } from "../state/MachineState";
import type { Memory } from "../memory/Memory";
import type { getLatestPipelineSnapshot, subscribeToPipelineSnapshots } from "./pipelineEvents";
import type { RuntimeSnapshot, RuntimeStatus, subscribeToRuntimeSnapshots } from "./runtimeEvents";

export interface BitmapDisplayState {
  width: number;
  height: number;
  buffer: Uint8Array;
  dirtyRegions: DirtyRegion[];
}

export interface RuntimeController {
  step(): RuntimeStatus;
  run(maxCycles?: number): void;
  halt(): void;
  resume(): void;
  setForwardingEnabled?(enabled: boolean): void;
  setHazardDetectionEnabled?(enabled: boolean): void;
  getForwardingEnabled?(): boolean;
  getHazardDetectionEnabled?(): boolean;
}

export interface ToolEventEmitters {
  runtime: {
    subscribe: typeof subscribeToRuntimeSnapshots;
    latest: () => RuntimeSnapshot;
  };
  pipeline: {
    subscribe: typeof subscribeToPipelineSnapshots;
    latest: typeof getLatestPipelineSnapshot;
  };
}

export interface AppContext {
  machineState: MachineState;
  memory: Memory;
  assembler: Assembler;
  events: ToolEventEmitters;
  program?: BinaryImage | null;
  sourceMap?: SourceMapEntry[] | undefined;
  memoryEntries?: Array<{ address: number; value: number }>;
  memoryConfiguration?: unknown;
  bitmapDisplay?: BitmapDisplayState | null;
  keyboardDevice?: KeyboardDevice | null;
  runtime?: RuntimeController | null;
}

export interface MarsToolComponentProps {
  appContext: AppContext;
  onClose: () => void;
}

export interface MarsTool {
  /** Unique identifier for the tool. */
  id: string;
  /** Tool display name shown in the UI menu. */
  name: string;
  /** Short description of the tool. */
  description: string;
  /**
   * Optional availability guard. Returning false will disable the menu entry.
   */
  isAvailable?(context: AppContext): boolean;
  /**
   * Start the tool. This should perform any wiring or side effects needed to observe the app state.
   */
  run(appContext: AppContext): void;
  /**
   * Optional React component used to render the tool UI.
   */
  Component?: React.ComponentType<MarsToolComponentProps> | null;
}

// Legacy compatibility alias used throughout the codebase.
export type MarsToolContext = AppContext;
