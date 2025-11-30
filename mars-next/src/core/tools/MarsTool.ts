import React from "react";
import type { BinaryImage } from "../loader/ProgramLoader";
import type { SourceMapEntry } from "../loader/Linker";
import type { KeyboardDevice } from "../devices/KeyboardDevice";
import type { DirtyRegion } from "../devices/BitmapDisplayDevice";

export interface BitmapDisplayState {
  width: number;
  height: number;
  buffer: Uint8Array;
  dirtyRegions: DirtyRegion[];
}

export interface MarsToolContext {
  program?: BinaryImage | null;
  sourceMap?: SourceMapEntry[] | undefined;
  memoryEntries?: Array<{ address: number; value: number }>;
  memoryConfiguration?: unknown;
  bitmapDisplay?: BitmapDisplayState | null;
  keyboardDevice?: KeyboardDevice | null;
}

export interface MarsToolLaunchProps<Context extends MarsToolContext = MarsToolContext> {
  context: Context;
  onClose: () => void;
}

export interface MarsTool<Context extends MarsToolContext = MarsToolContext> {
  /**
   * Tool display name shown in the UI menu.
   */
  getName(): string;

  /**
   * Identifier for the tool. In the legacy interface this mapped to the class file name.
   */
  getFile(): string;

  /**
   * Whether the tool can run given the current context.
   */
  isAvailable?(context: Context): boolean;

  /**
   * Launch the tool UI.
   */
  go(props: MarsToolLaunchProps<Context>): React.JSX.Element | null;
}
