import { Assembler, type BinaryImage } from "../../../core/assembler/Assembler";
import { ProgramLoader } from "../../../core/loader/ProgramLoader";
import { Linker } from "../../../core/loader/Linker";
import { Memory } from "../../../core/memory/Memory";
import { loadSettings } from "../../settings";
import { FileEntry, getWorkingDirectory, listFiles, readFile } from "../../file-manager";
import { runProgram } from "./executionController";

type RunStatusListener = (status: string) => void;
type RunStateListener = (running: boolean) => void;

let cachedSource = "li $v0, 10\nsyscall";
let isRunning = false;
const statusListeners = new Set<RunStatusListener>();
const runningListeners = new Set<RunStateListener>();

function notifyStatus(status: string): void {
  statusListeners.forEach((listener) => listener(status));
}

function notifyRunning(running: boolean): void {
  runningListeners.forEach((listener) => listener(running));
}

function flatten(entries: FileEntry[]): FileEntry[] {
  return entries.flatMap((entry) => (entry.children ? [entry, ...flatten(entry.children)] : [entry]));
}

async function collectWorkspaceSources(): Promise<string[]> {
  const directory = getWorkingDirectory();
  const tree = await listFiles(directory);
  const files = flatten(tree).filter((entry) => !entry.isDirectory);
  const contents = await Promise.all(files.map((file) => readFile(file.path)));
  return contents.filter((content) => content.trim().length > 0);
}

export function setActiveSource(content: string): void {
  cachedSource = content;
}

export function subscribeToRunStatus(listener: RunStatusListener): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function subscribeToRunState(listener: RunStateListener): () => void {
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

export async function assembleAndLoad(fileList: Array<string | { path: string; content: string }>): Promise<BinaryImage> {
  const settings = loadSettings();
  const assembler = new Assembler({
    enablePseudoInstructions: settings.enablePseudoInstructions,
    delayedBranchingEnabled: settings.delayedBranching,
  });
  const loader = new ProgramLoader(new Memory());

  const sources = settings.assembleAllFiles ? fileList : [fileList[0]];
  const normalized = sources.map((entry) => (typeof entry === "string" ? entry : entry.content));
  if (sources.length === 0 || sources[0].trim().length === 0) {
    throw new Error("No source files available for assembly");
  }

  if (normalized.length === 1) {
    return assembler.assemble(loader.normalizeSource(normalized[0]));
  }

  const linker = new Linker();
  const images = normalized.map((source) => assembler.assemble(loader.normalizeSource(source)));
  return linker.link(images);
}

export async function startRun(fileList?: Array<string | { path: string; content: string }>): Promise<boolean> {
  if (isRunning) return false;

  const sources = fileList ? await Promise.resolve(fileList) : await collectWorkspaceSources();
  if (sources.length === 0) {
    sources.push(cachedSource);
  }

  isRunning = true;
  notifyRunning(true);
  notifyStatus("Assembling...");

  try {
    const image = await assembleAndLoad(sources);
    notifyStatus("Running...");
    await runProgram(image);
    notifyStatus("Finished");
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const prefix = message.toLowerCase().includes("syntax") ? "Assembly failed" : "Run failed";
    notifyStatus(`${prefix}: ${message}`);
    return false;
  } finally {
    isRunning = false;
    notifyRunning(false);
  }
}
