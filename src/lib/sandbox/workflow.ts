import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import type { ToolCall } from "@/lib/sandbox/agent";
import { commandFor, detectProject, type ProjectProfile } from "@/lib/sandbox/detect";
import { isInsideRoot } from "@/lib/sandbox/paths";
import { realpath } from "node:fs/promises";
import { runIsolated, sandboxRuntime, type IsolatedResult } from "@/lib/sandbox/run";
import { createFileTools, type SandboxLog } from "@/lib/sandbox/tools";
import { checkFromProcess, interpretChecks, unknownVerification } from "@/lib/verification/interpret";
import type { TaskVerification } from "@/lib/verification/types";

export type RepositoryWorkspace = {
  logs: SandboxLog[];
  profile: ProjectProfile;
  branch: string;
  contextMessage(): Promise<string>;
  apply(call: ToolCall): Promise<string>;
  persist(): Promise<{ summary: string; diff: string; branch: string }>;
  verify(signal?: AbortSignal): Promise<TaskVerification>;
  close(): Promise<void>;
};

export function sandboxBranchName(projectId: string, now = Date.now()): string {
  const slug = projectId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12) || "work";
  return `apo/${slug}-${now.toString(36)}`;
}

export function githubCloneUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hostname !== "github.com") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const name = parts[1]?.replace(/\.git$/, "");
  if (!name || !/^[\w.-]+$/.test(parts[0] ?? "") || !/^[\w.-]+$/.test(name)) return null;
  return `https://github.com/${parts[0]}/${name}.git`;
}

export async function openLocalRepository(input: {
  sourcePath: string;
  branch: string;
  baseBranch?: string;
  sandboxesRoot?: string;
}): Promise<RepositoryWorkspace> {
  const runtime = await sandboxRuntime();
  if (!runtime.ok) throw new Error(runtime.reason);
  const root = input.sandboxesRoot ?? path.join(tmpdir(), "ai-project-optimizer-sandboxes");
  await mkdir(root, { recursive: true });
  const hostRoot = path.join(root, `sb-${randomBytes(8).toString("hex")}`);
  const repoDir = path.join(hostRoot, "repo");
  await mkdir(repoDir, { recursive: true });
  const source = await realpath(input.sourcePath);
  const cloned = await runIsolated({
    command: "git",
    args: ["clone", "--no-local", "/opt/source", "."],
    workspace: repoDir,
    network: false,
    readOnly: [{ from: source, to: "/opt/source" }],
    parent: runtime.parent,
    bwrap: runtime.bwrap,
  });
  if (!cloned.ok) {
    await rm(hostRoot, { recursive: true, force: true });
    throw new Error(cloned.error ?? (cloned.output || "The repository could not be cloned into the sandbox."));
  }
  return finishOpen({ hostRoot, repoDir, branch: input.branch, baseBranch: input.baseBranch, runtime });
}

export async function openGithubRepository(input: {
  cloneUrl: string;
  branch: string;
  baseBranch: string;
  token?: string | null;
  sandboxesRoot?: string;
}): Promise<RepositoryWorkspace> {
  const url = githubCloneUrl(input.cloneUrl);
  if (!url) throw new Error("Only an https://github.com repository can be cloned.");
  const runtime = await sandboxRuntime();
  if (!runtime.ok) throw new Error(runtime.reason);
  const root = input.sandboxesRoot ?? path.join(tmpdir(), "ai-project-optimizer-sandboxes");
  await mkdir(root, { recursive: true });
  const hostRoot = path.join(root, `sb-${randomBytes(8).toString("hex")}`);
  const repoDir = path.join(hostRoot, "repo");
  await mkdir(repoDir, { recursive: true });
  const askpass = path.join(hostRoot, "askpass.sh");
  await writeFile(askpass, "#!/bin/sh\ncase \"$1\" in\n*Username*) printf '%s\\n' x-access-token ;;\n*) printf '%s\\n' \"$SANDBOX_GIT_TOKEN\" ;;\nesac\n", { mode: 0o700 });
  const cloned = await runIsolated({
    command: "git",
    args: ["clone", "--depth", "1", "--branch", input.baseBranch, url, "."],
    workspace: repoDir,
    network: true,
    extraEnv: input.token ? { SANDBOX_GIT_TOKEN: input.token, GIT_ASKPASS: "/askpass.sh" } : undefined,
    readOnly: input.token ? [{ from: askpass, to: "/askpass.sh" }] : undefined,
    parent: runtime.parent,
    bwrap: runtime.bwrap,
  });
  await rm(askpass, { force: true }).catch(() => undefined);
  if (!cloned.ok) {
    await rm(hostRoot, { recursive: true, force: true });
    throw new Error("The GitHub repository could not be cloned into the sandbox.");
  }
  if (input.token && `${cloned.output}${cloned.error ?? ""}`.includes(input.token)) {
    throw new Error("The sandbox output included a credential and was discarded.");
  }
  return finishOpen({ hostRoot, repoDir, branch: input.branch, baseBranch: input.baseBranch, runtime });
}

async function finishOpen(input: {
  hostRoot: string;
  repoDir: string;
  branch: string;
  baseBranch?: string;
  runtime: { bwrap: string; parent: string };
}): Promise<RepositoryWorkspace> {
  const checked = await git(input.repoDir, ["checkout", "-b", input.branch], input.runtime);
  if (!checked.ok) {
    await rm(input.hostRoot, { recursive: true, force: true });
    throw new Error(checked.error ?? "The sandbox could not create a working branch.");
  }
  const logs: SandboxLog[] = [{ op: "branch", path: input.branch, ok: true, detail: "created" }];
  const tools = createFileTools(input.repoDir, logs);
  const profile = await readProfile(input.repoDir);
  return {
    logs,
    profile,
    branch: input.branch,
    async contextMessage() {
      const names = await tools.listFiles(".").catch((): string[] => []);
      const hints = ["README.md", "package.json"].filter((name) => names.includes(name));
      const pieces = [`Branch ${input.branch}. Project kind: ${profile.kind}. Package manager: ${profile.packageManager ?? "not detected"}.`, `Approved commands: ${profile.commands.map((command) => command.name).join(", ") || "none"}.`];
      for (const hint of hints) {
        const text = await tools.readFile(hint).catch(() => "");
        if (text) pieces.push(`File ${hint}:\n${text.slice(0, 2_000)}`);
      }
      return pieces.join("\n");
    },
    async apply(call) {
      try {
        return await applyTool(tools, profile, input.repoDir, input.runtime, call);
      } catch (error) {
        return error instanceof Error ? error.message : "The sandbox tool failed.";
      }
    },
    async persist() {
      await git(input.repoDir, ["add", "-A"], input.runtime);
      const diff = await git(input.repoDir, ["diff", "--cached", "--"], input.runtime);
      const text = diff.output.trim();
      if (!text) return { summary: `No file changes on ${input.branch}.`, diff: "", branch: input.branch };
      const committed = await git(input.repoDir, ["commit", "-m", "Apply sandbox edits"], input.runtime);
      const summary = committed.ok
        ? `Committed sandbox edits on ${input.branch}. The branch is local and no pull request was opened.`
        : `Sandbox edits are staged on ${input.branch}. The commit was not created.`;
      logs.push({ op: "persist", path: input.branch, ok: committed.ok, detail: summary });
      return { summary, diff: text.slice(0, 8_000), branch: input.branch };
    },
    async verify(signal) {
      if (profile.commands.length === 0) return unknownVerification("No approved test, lint, typecheck, or build script was detected.");
      const checks = [];
      for (const command of profile.commands) {
        if (signal?.aborted) break;
        const result = await runIsolated({
          command: command.command,
          args: command.args,
          workspace: input.repoDir,
          network: false,
          signal,
          parent: input.runtime.parent,
          bwrap: input.runtime.bwrap,
        });
        logs.push({ op: "verify", path: command.name, ok: result.ok, detail: result.error ?? `exit ${result.exitCode ?? "none"}` });
        checks.push(checkFromProcess({ kind: command.name, command: command.command, args: [...command.args] }, result));
      }
      return interpretChecks(checks);
    },
    async close() {
      const rootReal = await realpath(path.dirname(input.hostRoot));
      const target = await realpath(input.hostRoot).catch(() => input.hostRoot);
      if (!isInsideRoot(rootReal, target) || target === rootReal) throw new Error("Refusing to clean a directory outside the sandbox root.");
      await rm(target, { recursive: true, force: true });
    },
  };
}

async function applyTool(
  tools: ReturnType<typeof createFileTools>,
  profile: ProjectProfile,
  repoDir: string,
  runtime: { bwrap: string; parent: string },
  call: ToolCall,
): Promise<string> {
  switch (call.tool) {
    case "read_file":
      return (await tools.readFile(call.path)).slice(0, 4_000);
    case "write_file":
      await tools.writeFile(call.path, call.content);
      return `Wrote ${call.path}.`;
    case "create_file":
      await tools.createFile(call.path, call.content);
      return `Created ${call.path}.`;
    case "edit_file":
      await tools.editFile(call.path, call.old, call.replacement);
      return `Edited ${call.path}.`;
    case "delete_file":
      await tools.deleteFile(call.path);
      return `Deleted ${call.path}.`;
    case "list_files":
      return (await tools.listFiles(call.path)).join("\n");
    case "search_files":
      return (await tools.searchFiles(call.query)).join("\n") || "No matches.";
    case "run_command": {
      const command = commandFor(profile, call.name);
      if (!command) return `The command ${call.name} is not approved for this project.`;
      const result = await runIsolated({
        command: command.command,
        args: command.args,
        workspace: repoDir,
        network: false,
        parent: runtime.parent,
        bwrap: runtime.bwrap,
      });
      tools.logs.push({ op: "run_command", path: command.name, ok: result.ok, detail: result.error ?? `exit ${result.exitCode ?? "none"}` });
      return result.ok ? `${command.name} passed.` : `${command.name} failed. ${result.error ?? result.output.slice(0, 500)}`;
    }
    default:
      return "That tool is not available.";
  }
}

async function readProfile(repoDir: string): Promise<ProjectProfile> {
  let packageJson: unknown = null;
  try {
    packageJson = JSON.parse(await readFile(path.join(repoDir, "package.json"), "utf8"));
  } catch {
    packageJson = null;
  }
  const { readdir } = await import("node:fs/promises");
  const fileNames = await readdir(repoDir).catch(() => []);
  return detectProject({ packageJson, fileNames });
}

function git(repoDir: string, args: string[], runtime: { bwrap: string; parent: string }): Promise<IsolatedResult> {
  return runIsolated({
    command: "git",
    args,
    workspace: repoDir,
    network: false,
    parent: runtime.parent,
    bwrap: runtime.bwrap,
  });
}
