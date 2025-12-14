import { getRendererApi, type PseudoOpsFileSnapshot } from "../../../shared/bridge";

function getFsAndPath(): { fs: typeof import("fs"); path: typeof import("path") } {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  return { fs, path };
}

function resolveUserPseudoOpsPath(fs: typeof import("fs"), path: typeof import("path")): string | null {
  const candidates = [
    path.resolve(process.cwd(), "PseudoOps.txt"),
    path.resolve(process.cwd(), "PseudoOps.json"),
    path.resolve(process.cwd(), "config", "PseudoOps.txt"),
    path.resolve(process.cwd(), "config", "PseudoOps.json"),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveBundledPseudoOpsPath(fs: typeof import("fs"), path: typeof import("path")): string | null {
  const candidates: string[] = [];

  if (typeof __dirname !== "undefined") {
    candidates.push(path.resolve(__dirname, "../../../resources/PseudoOps.txt"));
  }

  candidates.push(path.resolve(process.cwd(), "resources", "PseudoOps.txt"));
  candidates.push(path.resolve(process.cwd(), "resources", "PseudoOps.json"));

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

export function loadPseudoOpsFile(): PseudoOpsFileSnapshot {
  const rendererApi = getRendererApi();
  if (rendererApi?.loadPseudoOpsFile) {
    return rendererApi.loadPseudoOpsFile();
  }

  const { fs, path } = getFsAndPath();

  const existingUserPath = resolveUserPseudoOpsPath(fs, path);
  const bundledPath = resolveBundledPseudoOpsPath(fs, path);
  const sourcePath = existingUserPath ?? bundledPath;

  if (!sourcePath) {
    throw new Error("PseudoOps.txt not found in working directory or bundled resources.");
  }

  const contents = fs.readFileSync(sourcePath, "utf8");
  const defaultSavePath = existingUserPath ?? path.resolve(process.cwd(), "config", "PseudoOps.txt");

  return { contents, sourcePath, savePath: defaultSavePath };
}

export function savePseudoOpsFile(contents: string, destinationPath: string): string {
  const rendererApi = getRendererApi();
  if (rendererApi?.savePseudoOpsFile) {
    return rendererApi.savePseudoOpsFile(contents, destinationPath);
  }

  const { fs, path } = getFsAndPath();

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, contents, "utf8");

  return destinationPath;
}
