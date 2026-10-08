import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SandboxLimits } from "@/lib/sandbox/limits";

const JOB_ID = /^sb-[a-f0-9]{16}$/;
const FILES = new Set(["memory.max", "cpu.max", "pids.max", "cgroup.procs", "cgroup.kill"]);

export type SandboxCgroup = {
  directory: string;
  place(pid: number): Promise<void>;
  kill(): Promise<void>;
  remove(): Promise<void>;
};

export function sandboxCgroupParent(): string {
  return process.env.SANDBOX_CGROUP_PARENT?.trim() || "/sys/fs/cgroup/apo";
}

export function jobDirectory(parent: string, id: string): string {
  if (!JOB_ID.test(id)) throw new Error("Invalid sandbox cgroup id.");
  const root = path.resolve(parent);
  const job = path.resolve(root, id);
  if (path.dirname(job) !== root) throw new Error("Sandbox cgroup escaped its parent.");
  return job;
}

export async function createSandboxCgroup(parent: string, limits: SandboxLimits): Promise<SandboxCgroup> {
  if (!/^\d+$/.test(String(limits.memoryBytes)) || !/^\d+$/.test(String(limits.pidsMax))) {
    throw new Error("Sandbox limits are not valid.");
  }
  if (!/^\d+ \d+$/.test(limits.cpuMax)) throw new Error("Sandbox CPU limit is not valid.");
  const directory = jobDirectory(parent, `sb-${randomBytes(8).toString("hex")}`);
  await makeDirectory(directory);
  await writeCgroup(directory, "memory.max", String(limits.memoryBytes));
  await writeCgroup(directory, "pids.max", String(limits.pidsMax));
  await writeCgroup(directory, "cpu.max", limits.cpuMax);
  return {
    directory,
    place: (pid) => writeCgroup(directory, "cgroup.procs", String(pid)),
    kill: () => writeCgroup(directory, "cgroup.kill", "1").catch(() => undefined),
    remove: async () => {
      await writeCgroup(directory, "cgroup.kill", "1").catch(() => undefined);
      await rm(directory, { recursive: true, force: true }).catch(async () => {
        await sudo(["rmdir", directory]);
      });
    },
  };
}

async function makeDirectory(directory: string): Promise<void> {
  try {
    await mkdir(directory);
  } catch (error) {
    if (!isAccess(error)) throw error;
    await sudo(["mkdir", "-p", directory]);
  }
}

async function writeCgroup(directory: string, name: string, value: string): Promise<void> {
  if (!FILES.has(name)) throw new Error("Refusing to write an unknown cgroup file.");
  if (name === "cgroup.procs" && !/^\d+$/.test(value)) throw new Error("Refusing to move a non-numeric process id.");
  if ((name === "memory.max" || name === "pids.max" || name === "cgroup.kill") && !/^\d+$/.test(value)) {
    throw new Error("Refusing to write a non-numeric cgroup limit.");
  }
  if (name === "cpu.max" && !/^\d+ \d+$/.test(value)) throw new Error("Refusing to write a non-numeric cgroup limit.");
  const file = path.join(directory, name);
  if (path.dirname(file) !== directory) throw new Error("Refusing to write outside the sandbox cgroup.");
  try {
    await writeFile(file, value);
    return;
  } catch (error) {
    if (!isAccess(error)) throw error;
  }
  await sudoWrite(file, value);
}

function sudo(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-n", ...args], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("sudo could not update the sandbox cgroup."))));
  });
}

function sudoWrite(file: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("sudo", ["-n", "tee", file], { stdio: ["pipe", "ignore", "ignore"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error("sudo could not update the sandbox cgroup."))));
    child.stdin.end(`${value}\n`);
  });
}

function isAccess(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "EACCES" || error.code === "EPERM");
}
