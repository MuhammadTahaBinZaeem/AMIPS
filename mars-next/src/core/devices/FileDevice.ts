import { Device, DeviceData } from "./Device";

type FileMode = "r" | "w" | "a";

interface FileHandle {
  path: string;
  mode: FileMode;
}

export class FileDevice implements Device {
  private nextDescriptor = 3; // Reserve 0,1,2 for stdin/out/err like Unix
  private readonly files = new Map<string, string>();
  private readonly handles = new Map<number, FileHandle>();

  read(_offset: number): DeviceData {
    throw new Error("Memory-mapped file reads are not supported yet");
  }

  write(_offset: number): void {
    throw new Error("Memory-mapped file writes are not supported yet");
  }

  open(path: string, mode: FileMode): number {
    this.validateMode(mode);

    if (mode === "r" && !this.files.has(path)) {
      throw new Error(`File not found: ${path}`);
    }

    if (mode === "w") {
      this.files.set(path, "");
    }

    if (mode === "a" && !this.files.has(path)) {
      this.files.set(path, "");
    }

    const descriptor = this.nextDescriptor++;
    this.handles.set(descriptor, { path, mode });
    return descriptor;
  }

  writeFile(descriptor: number, content: string): void {
    const handle = this.requireHandle(descriptor);
    if (handle.mode === "r") {
      throw new Error("Cannot write to a read-only file descriptor");
    }

    const existing = this.files.get(handle.path) ?? "";
    this.files.set(handle.path, existing + content);
  }

  readFile(descriptor: number): string {
    const handle = this.requireHandle(descriptor);
    const data = this.files.get(handle.path);
    if (data === undefined) {
      throw new Error(`File not found for descriptor ${descriptor}`);
    }
    return data;
  }

  close(descriptor: number): void {
    this.requireHandle(descriptor); // throws if missing
    this.handles.delete(descriptor);
  }

  getFile(path: string): string | undefined {
    return this.files.get(path);
  }

  private requireHandle(descriptor: number): FileHandle {
    const handle = this.handles.get(descriptor);
    if (!handle) {
      throw new Error(`Unknown file descriptor: ${descriptor}`);
    }
    return handle;
  }

  private validateMode(mode: string): asserts mode is FileMode {
    if (mode !== "r" && mode !== "w" && mode !== "a") {
      throw new Error(`Unsupported file mode: ${mode}`);
    }
  }
}
