import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";

export interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileEntry[];
  handle?: FileSystemFileHandle | FileSystemDirectoryHandle;
}

const ASSEMBLY_EXTENSIONS = new Set([".asm", ".s"]);
const WORKSPACE_ROOT = path.resolve(process.cwd(), "mars-next/src/workspace");

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

  try {
    const entries = await fsPromises.readdir(directoryPath, { withFileTypes: true });
    const resolved: FileEntry[] = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory() || shouldIncludeFile(entry.name))
        .map(async (entry) => {
          const fullPath = path.join(directoryPath, entry.name);
          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: fullPath,
              isDirectory: true,
              children: await readDirectory(fullPath),
            } satisfies FileEntry;
          }

          return {
            name: entry.name,
            path: fullPath,
            isDirectory: false,
          } satisfies FileEntry;
        }),
    );

    return resolved.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.warn(`Failed to read directory ${directoryPath}`, error);
    return [];
  }
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

  // Fallback for Node/Electron environments
  if (fs.existsSync(WORKSPACE_ROOT)) {
    workingDirectory = WORKSPACE_ROOT;
    return WORKSPACE_ROOT;
  }

  workingDirectory = process.cwd();
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

  try {
    return await fsPromises.readFile(targetPath, "utf8");
  } catch (error) {
    console.warn(`Failed to read workspace file: ${targetPath}`, error);
    return "";
  }
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

  try {
    await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
    await fsPromises.writeFile(targetPath, content, "utf8");
  } catch (error) {
    console.warn(`Failed to write workspace file: ${targetPath}`, error);
  }
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

  try {
    await fsPromises.mkdir(path.dirname(newPath), { recursive: true });
    await fsPromises.rename(oldPath, newPath);
  } catch (error) {
    console.warn(`Failed to rename workspace file: ${oldPath} -> ${newPath}`, error);
  }
}
