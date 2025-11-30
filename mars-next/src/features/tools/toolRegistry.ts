import type { MarsTool } from "../../core/tools/MarsTool";
import { BitmapDisplayTool } from "./bitmap-display/BitmapDisplayWindow";
import { DataSegmentTool } from "./data-viewer/DataSegmentWindow";
import { KeyboardTool } from "./keyboard-view/KeyboardWindow";
import { TextSegmentTool } from "./text-viewer/TextSegmentWindow";
import { PipelineStateTool } from "../pipeline-view";

export const TOOL_REGISTRY: MarsTool[] = [
  DataSegmentTool,
  TextSegmentTool,
  BitmapDisplayTool,
  KeyboardTool,
  PipelineStateTool,
];
