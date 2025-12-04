import fs from "fs";
import path from "path";

const WORKSPACE_ROOT = path.resolve(process.cwd(), "mars-next/src/workspace");

export function listFiles(): string[] {
  if (!fs.existsSync(WORKSPACE_ROOT)) return [];

  try {
    return fs
      .readdirSync(WORKSPACE_ROOT)
      .filter((entry) => entry.endsWith(".asm"))
      .map((entry) => path.join(WORKSPACE_ROOT, entry));
  } catch (error) {
    console.warn("Failed to enumerate workspace files", error);
    return [];
  }
}

export function readFileContent(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    console.warn(`Failed to read workspace file: ${filePath}`, error);
    return "";
  }
}
