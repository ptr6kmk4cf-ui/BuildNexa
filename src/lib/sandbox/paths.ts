import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export class SandboxPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxPathError";
  }
}

export function isInsideRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function resolveInside(root: string, requested: string, options?: { keepFinalSymlink?: boolean }): Promise<string> {
  if (typeof requested !== "string" || requested.length === 0 || requested.length > 500) {
    throw new SandboxPathError("That path is not allowed.");
  }
  if (requested.includes("\0")) throw new SandboxPathError("That path is not allowed.");
  if (path.isAbsolute(requested) || path.win32.isAbsolute(requested)) {
    throw new SandboxPathError("That path is not allowed.");
  }
  const rootReal = await realpath(root);
  const parts = requested.split(/[\\/]+/).filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0) return rootReal;
  if (parts.some((part) => part === "..")) throw new SandboxPathError("That path is not allowed.");

  let current = rootReal;
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index] ?? "";
    const next = path.join(current, part);
    const finalPart = index === parts.length - 1;
    let linked = false;
    try {
      const stat = await lstat(next);
      linked = stat.isSymbolicLink();
    } catch (error) {
      if (!isNotFound(error)) throw error;
      current = next;
      if (!isInsideRoot(rootReal, current)) throw new SandboxPathError("That path is not allowed.");
      continue;
    }
    if (linked && finalPart && options?.keepFinalSymlink) {
      if (!isInsideRoot(rootReal, next)) throw new SandboxPathError("That path is not allowed.");
      return next;
    }
    if (linked) {
      let target: string;
      try {
        target = await realpath(next);
      } catch (error) {
        if (isNotFound(error)) throw new SandboxPathError("That path is not allowed.");
        throw error;
      }
      if (!isInsideRoot(rootReal, target)) throw new SandboxPathError("That path is not allowed.");
      current = target;
      continue;
    }
    current = next;
    if (!isInsideRoot(rootReal, current)) throw new SandboxPathError("That path is not allowed.");
  }
  return current;
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
