import { lstat, mkdir, readdir, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { SANDBOX_LIMITS } from "@/lib/sandbox/limits";
import { isInsideRoot, resolveInside, SandboxPathError } from "@/lib/sandbox/paths";

export type SandboxLog = {
  op: string;
  path?: string;
  ok: boolean;
  detail: string;
};

export function createFileTools(root: string, logs: SandboxLog[], options?: { maxSearchFiles?: number }) {
  const maxSearchFiles = options?.maxSearchFiles ?? SANDBOX_LIMITS.maxSearchFiles;
  return {
    logs,
    async readFile(requested: string): Promise<string> {
      return record(logs, "read_file", requested, async () => {
        const file = await resolveInside(root, requested);
        const info = await stat(file);
        if (!info.isFile()) throw new SandboxPathError("That path is not a file.");
        if (info.size > SANDBOX_LIMITS.maxFileBytes) throw new SandboxPathError("That file is too large to read.");
        return readFile(file, "utf8");
      });
    },
    async writeFile(requested: string, content: string): Promise<void> {
      await record(logs, "write_file", requested, async () => {
        assertContent(content);
        const file = await resolveInside(root, requested);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content);
      });
    },
    async createFile(requested: string, content: string): Promise<void> {
      await record(logs, "create_file", requested, async () => {
        assertContent(content);
        const file = await resolveInside(root, requested);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, content, { flag: "wx" });
      });
    },
    async editFile(requested: string, oldText: string, replacement: string): Promise<void> {
      await record(logs, "edit_file", requested, async () => {
        if (!oldText) throw new SandboxPathError("The text to replace is empty.");
        assertContent(replacement);
        const file = await resolveInside(root, requested);
        const current = await readFile(file, "utf8");
        const matches = current.split(oldText).length - 1;
        if (matches !== 1) throw new SandboxPathError(matches === 0 ? "That text was not found." : "That text appears more than once.");
        await writeFile(file, current.replace(oldText, replacement));
      });
    },
    async deleteFile(requested: string): Promise<void> {
      await record(logs, "delete_file", requested, async () => {
        const rootReal = await resolveInside(root, ".");
        const target = await resolveInside(root, requested, { keepFinalSymlink: true });
        if (target === rootReal) throw new SandboxPathError("The workspace root cannot be deleted.");
        const link = await lstat(target);
        if (link.isSymbolicLink()) {
          await unlink(target);
          return;
        }
        if (link.isDirectory()) {
          if (!isInsideRoot(rootReal, target)) throw new SandboxPathError("That path is not allowed.");
          await rm(target, { recursive: true, force: false });
          return;
        }
        await unlink(target);
      });
    },
    async listFiles(requested = "."): Promise<string[]> {
      return record(logs, "list_files", requested, async () => {
        const directory = await resolveInside(root, requested);
        const entries = await readdir(directory, { withFileTypes: true });
        return entries.slice(0, 200).map((entry) => (entry.isSymbolicLink() ? `${entry.name} -> symlink` : entry.name));
      });
    },
    async searchFiles(query: string): Promise<string[]> {
      return record(logs, "search_files", undefined, async () => {
        if (!query.trim() || query.length > 200) throw new SandboxPathError("The search text is not allowed.");
        const rootReal = await resolveInside(root, ".");
        const found: string[] = [];
        await walk(rootReal, rootReal, query, found, { seen: 0, max: maxSearchFiles });
        return found;
      });
    },
  };
}

async function walk(root: string, directory: string, query: string, found: string[], budget: { seen: number; max: number }): Promise<void> {
  if (found.length >= 50 || budget.seen >= budget.max) return;
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (found.length >= 50 || budget.seen >= budget.max) return;
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!isInsideRoot(root, full)) continue;
      await walk(root, full, query, found, budget);
      continue;
    }
    if (!entry.isFile()) continue;
    budget.seen += 1;
    const info = await stat(full);
    if (info.size > SANDBOX_LIMITS.maxFileBytes) continue;
    const text = await readFile(full, "utf8").catch(() => "");
    if (text.includes(query)) found.push(path.relative(root, full));
  }
}

async function record<T>(logs: SandboxLog[], op: string, requested: string | undefined, action: () => Promise<T>): Promise<T> {
  try {
    const value = await action();
    logs.push({ op, ...(requested ? { path: requested } : {}), ok: true, detail: "ok" });
    return value;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "The sandbox operation failed.";
    logs.push({ op, ...(requested ? { path: requested } : {}), ok: false, detail: clip(detail) });
    throw error;
  }
}

function assertContent(content: string): void {
  if (typeof content !== "string" || Buffer.byteLength(content) > SANDBOX_LIMITS.maxFileBytes) {
    throw new SandboxPathError("That file is too large to write.");
  }
}

function clip(value: string): string {
  return value.length > 240 ? `${value.slice(0, 239)}…` : value;
}
