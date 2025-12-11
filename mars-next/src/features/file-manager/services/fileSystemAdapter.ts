import path from "path-browserify";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

const ASSEMBLY_EXTENSIONS = new Set([".asm", ".s"]);
const WORKSPACE_ROOT = "workspace";

let workingDirectory = WORKSPACE_ROOT;
const handleCache = new Map<string, FileSystemFileHandle | FileSystemDirectoryHandle>();

function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

function shouldIncludeFile(fileName: string): boolean {
  const extension = path.extname(fileName).toLowerCase();
  return ASSEMBLY_EXTENSIONS.has(extension);
}

async function readDirectory(
  directoryPath: string,
  directoryHandle?: FileSystemDirectoryHandle,
): Promise<FileEntry[]> {
  if (directoryHandle) {
    return readDirectoryFromHandle(directoryHandle, directoryPath);
  }

  console.warn("Cannot read directory without File System Access support", directoryPath);
  return [];
}

async function readDirectoryFromHandle(
  directoryHandle: FileSystemDirectoryHandle,
  currentPath: string,
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  try {
    for await (const entry of directoryHandle.values()) {
      const nextPath = path.join(currentPath, entry.name);
      handleCache.set(nextPath, entry);

      if (entry.kind === "directory") {
        const childEntries = await readDirectoryFromHandle(entry, nextPath);
        entries.push({ name: entry.name, path: nextPath, isDirectory: true, children: childEntries, handle: entry });
        continue;
      }

      if (!shouldIncludeFile(entry.name)) continue;

      entries.push({ name: entry.name, path: nextPath, isDirectory: false, handle: entry });
    }
  } catch (error) {
    console.warn(`Failed to read directory via File System Access API: ${currentPath}`, error);
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveHandleFromPath(targetPath: string): Promise<FileSystemFileHandle | FileSystemDirectoryHandle | null> {
  const cached = handleCache.get(targetPath);
  if (cached) return cached;

  const rootHandle = handleCache.get(workingDirectory);
  if (!rootHandle || rootHandle.kind !== "directory") return null;

  try {
    const segments = path.relative(workingDirectory, targetPath).split(path.sep).filter(Boolean);
    let currentHandle: FileSystemDirectoryHandle | FileSystemFileHandle = rootHandle;

    for (const segment of segments) {
      if (currentHandle.kind === "file") return null;
      const directoryHandle = currentHandle as FileSystemDirectoryHandle;
      try {
        currentHandle = await directoryHandle.getDirectoryHandle(segment);
      } catch (directoryError) {
        currentHandle = await directoryHandle.getFileHandle(segment);
      }
    }

    handleCache.set(targetPath, currentHandle);
    return currentHandle;
  } catch (error) {
    console.warn(`Failed to resolve handle for ${targetPath}`, error);
    return null;
  }
}

export function getWorkingDirectory(): string {
  return workingDirectory;
}

export function setWorkingDirectory(directory: string): void {
  workingDirectory = directory;
}

export async function selectWorkspaceDirectory(): Promise<string | null> {
  if (isFileSystemAccessSupported()) {
    try {
      const handle = await window.showDirectoryPicker({ id: "mars-next-workspace" });
      const selectedPath = handle.name;
      handleCache.clear();
      handleCache.set(selectedPath, handle);
      workingDirectory = selectedPath;
      return selectedPath;
    } catch (error) {
      console.warn("Directory selection was cancelled or failed", error);
      return null;
    }
  }

  // No File System Access support available
  return workingDirectory;
}

export async function listFiles(directory: string = workingDirectory): Promise<FileEntry[]> {
  const rootHandle = handleCache.get(directory);
  return readDirectory(directory, rootHandle?.kind === "directory" ? (rootHandle as FileSystemDirectoryHandle) : undefined);
}

export async function readFile(targetPath: string): Promise<string> {
  if (isFileSystemAccessSupported()) {
    try {
      const handle = (await resolveHandleFromPath(targetPath)) ?? undefined;
      if (handle && handle.kind === "file") {
        const file = await (handle as FileSystemFileHandle).getFile();
        return await file.text();
      }
    } catch (error) {
      console.warn(`Failed to read ${targetPath} via File System Access API`, error);
    }
  }

  console.warn("File System Access API is not available; cannot read file", targetPath);
  return "";
}

export async function writeFile(targetPath: string, content: string): Promise<void> {
  if (isFileSystemAccessSupported()) {
    try {
      const handle = (await resolveHandleFromPath(targetPath)) ?? undefined;
      if (handle && handle.kind === "file") {
        const writable = await (handle as FileSystemFileHandle).createWritable();
        await writable.write(content);
        await writable.close();
        return;
      }
    } catch (error) {
      console.warn(`Failed to write ${targetPath} via File System Access API`, error);
    }
  }

  console.warn("File System Access API is not available; cannot write file", targetPath);
}

export async function renameFile(oldPath: string, newPath: string): Promise<void> {
  if (isFileSystemAccessSupported()) {
    try {
      const handle = await resolveHandleFromPath(oldPath);
      const parentHandle = await resolveHandleFromPath(path.dirname(oldPath));
      if (handle && parentHandle && parentHandle.kind === "directory") {
        const directoryHandle = parentHandle as FileSystemDirectoryHandle;
        const file = await (handle as FileSystemFileHandle).getFile();
        const newFileHandle = await directoryHandle.getFileHandle(path.basename(newPath), { create: true });
        const writable = await newFileHandle.createWritable();
        await writable.write(await file.text());
        await writable.close();
        if (typeof directoryHandle.removeEntry === "function") {
          await directoryHandle.removeEntry(path.basename(oldPath));
        }
        handleCache.delete(oldPath);
        handleCache.set(newPath, newFileHandle);
        return;
      }
    } catch (error) {
      console.warn(`Failed to rename ${oldPath} via File System Access API`, error);
    }
  }

  console.warn("File System Access API is not available; cannot rename file", oldPath, newPath);
}
