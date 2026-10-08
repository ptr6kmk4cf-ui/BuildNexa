import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { bwrapArguments, sandboxEnvLeaks } from "@/lib/sandbox/bwrap";
import { detectProject } from "@/lib/sandbox/detect";
import { parseToolCall } from "@/lib/sandbox/agent";
import { githubCloneUrl, openLocalRepository, sandboxBranchName } from "@/lib/sandbox/workflow";
import { runIsolated, sandboxRuntime } from "@/lib/sandbox/run";
import { createFileTools } from "@/lib/sandbox/tools";
import type { SandboxLog } from "@/lib/sandbox/tools";

const exec = promisify(execFile);
const cleanups: string[] = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("project detection", () => {
  it("uses the lockfile and does not invent npm", () => {
    expect(detectProject({
      packageJson: { scripts: { test: "vitest" } },
      fileNames: ["package.json", "tsconfig.json"],
    })).toMatchObject({ kind: "typescript", packageManager: null, commands: [] });
  });

  it("detects Next.js and pnpm from the package manager field", () => {
    const profile = detectProject({
      packageJson: { packageManager: "pnpm@9.0.0", dependencies: { next: "15.0.0" }, scripts: { test: "vitest", lint: "eslint ." } },
      fileNames: ["package.json", "next.config.ts"],
    });
    expect(profile.kind).toBe("next");
    expect(profile.packageManager).toBe("pnpm");
    expect(profile.commands.map((command) => [command.command, ...command.args])).toEqual([
      ["pnpm", "run", "test"],
      ["pnpm", "run", "lint"],
    ]);
  });

  it("detects yarn from yarn.lock and node without a framework", () => {
    const profile = detectProject({
      packageJson: { scripts: { build: "node build.js" } },
      fileNames: ["package.json", "yarn.lock"],
    });
    expect(profile).toMatchObject({ kind: "node", packageManager: "yarn" });
    expect(profile.commands[0]).toEqual({ name: "build", command: "yarn", args: ["run", "build"] });
  });
});

describe("tool calls", () => {
  it("rejects shell text and caller-supplied arguments", () => {
    expect(parseToolCall("bash -c 'rm -rf /'").ok).toBe(false);
    expect(parseToolCall('{"tool":"run_command","name":"test","args":["--","bash"]}').ok).toBe(false);
    expect(parseToolCall('{"tool":"run_command","command":"bash","name":"test"}').ok).toBe(false);
    expect(parseToolCall('{"tool":"write_file","path":"../.env","content":"x"}').ok).toBe(true);
  });

  it("accepts one fenced tool call", () => {
    const parsed = parseToolCall('```json\n{"tool":"edit_file","path":"src/a.ts","old":"a","replacement":"b"}\n```');
    expect(parsed).toEqual({ ok: true, call: { tool: "edit_file", path: "src/a.ts", old: "a", replacement: "b" } });
  });
});

describe("workspace paths", () => {
  it("blocks escapes and logs every file operation", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "apo-files-"));
    cleanups.push(root);
    await writeFile(path.join(root, "note.txt"), "hello");
    await symlink("/etc/passwd", path.join(root, "escape"));
    const outside = path.join(tmpdir(), `apo-outside-${Date.now()}`);
    await writeFile(outside, "secret");
    cleanups.push(outside);
    const logs: SandboxLog[] = [];
    const tools = createFileTools(root, logs);
    expect(await tools.readFile("note.txt")).toBe("hello");
    await expect(tools.readFile("../package.json")).rejects.toThrow(/not allowed/);
    await expect(tools.readFile("/etc/passwd")).rejects.toThrow(/not allowed/);
    await expect(tools.readFile("escape")).rejects.toThrow(/not allowed/);
    await expect(tools.writeFile("escape", "owned")).rejects.toThrow(/not allowed/);
    await expect(tools.readFile("a\0b")).rejects.toThrow(/not allowed/);
    await tools.createFile("src/new.txt", "created");
    await tools.editFile("note.txt", "hello", "edited");
    expect(await tools.searchFiles("edited")).toEqual(["note.txt"]);
    await tools.deleteFile("src/new.txt");
    expect(logs.map((entry) => entry.op)).toEqual([
      "read_file",
      "read_file",
      "read_file",
      "read_file",
      "write_file",
      "read_file",
      "create_file",
      "edit_file",
      "search_files",
      "delete_file",
    ]);
    expect(logs.every((entry) => !entry.detail.includes("secret"))).toBe(true);
    expect(await readFile(outside, "utf8")).toBe("secret");
  });
});

describe("sandbox command line", () => {
  it("does not mount the application or put a token in argv", () => {
    const workspace = tmpdir();
    const args = bwrapArguments({
      workspace,
      command: "git",
      args: ["status"],
      network: false,
      extraEnv: { SANDBOX_GIT_TOKEN: "ghp_supersecret", DATABASE_URL: "postgresql://user:pass@localhost/db" },
    });
    expect(args).toContain("--unshare-net");
    expect(args).toContain("--clearenv");
    const sources: string[] = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === "--bind" || args[index] === "--ro-bind") sources.push(args[index + 1] ?? "");
    }
    expect(sources).not.toContain(process.cwd());
    expect(sandboxEnvLeaks(args, "ghp_supersecret")).toBe(false);
    expect(sandboxEnvLeaks(args, "postgresql://user:pass@localhost/db")).toBe(false);
  });

  it("allows the clone token only as an environment value for git clone", () => {
    const args = bwrapArguments({
      workspace: tmpdir(),
      command: "git",
      args: ["clone", "https://github.com/acme/web.git", "."],
      network: true,
      extraEnv: { SANDBOX_GIT_TOKEN: "ghp_supersecret", GIT_ASKPASS: "/askpass.sh" },
    });
    expect(args).not.toContain("--unshare-net");
    expect(args).toContain("ghp_supersecret");
    expect(args.filter((arg) => arg === "ghp_supersecret")).toHaveLength(1);
    expect(args.slice(args.indexOf("--") + 1)).toEqual(["git", "clone", "https://github.com/acme/web.git", "."]);
  });
});

describe("github clone address", () => {
  it("accepts only https github repositories", () => {
    expect(githubCloneUrl("https://github.com/acme/web")).toBe("https://github.com/acme/web.git");
    expect(githubCloneUrl("https://user:token@github.com/acme/web.git")).toBeNull();
    expect(githubCloneUrl("http://github.com/acme/web")).toBeNull();
    expect(githubCloneUrl("https://example.com/acme/web")).toBeNull();
    expect(sandboxBranchName("proj_123")).toMatch(/^apo\/proj123-/);
  });
});

describe("isolated execution", () => {
  it("stops a runaway process and edits a repository only inside the sandbox", async () => {
    const runtime = await sandboxRuntime();
    if (!runtime.ok) {
      const refused = await runIsolated({ command: "/bin/echo", args: ["nope"], workspace: tmpdir(), timeoutMs: 1_000 });
      expect(refused.ok).toBe(false);
      expect(refused.error).toMatch(/not run|not installed|limits/);
      return;
    }

    const runaway = await runIsolated({
      command: "/bin/sleep",
      args: ["30"],
      workspace: await scratch(),
      timeoutMs: 1_000,
      parent: runtime.parent,
      bwrap: runtime.bwrap,
    });
    expect(runaway.timedOut).toBe(true);
    expect(runaway.ok).toBe(false);

    const hidden = path.join(tmpdir(), `apo-hidden-${Date.now()}`);
    await writeFile(hidden, "host-secret");
    cleanups.push(hidden);
    const blocked = await runIsolated({
      command: "/bin/cat",
      args: [hidden],
      workspace: await scratch(),
      timeoutMs: 5_000,
      network: false,
      parent: runtime.parent,
      bwrap: runtime.bwrap,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.output).not.toContain("host-secret");

    const source = await scratch();
    await writeFile(path.join(source, "package.json"), JSON.stringify({
      name: "fixture",
      private: true,
      packageManager: "npm@10.0.0",
      scripts: { test: "node -e \"process.stdout.write('sandbox-test-ok')\"" },
    }));
    await writeFile(path.join(source, "next.config.js"), "module.exports = {}\n");
    await exec("git", ["init", "-b", "main"], { cwd: source });
    await exec("git", ["config", "user.email", "fixture@example.com"], { cwd: source });
    await exec("git", ["config", "user.name", "Fixture"], { cwd: source });
    await exec("git", ["add", "."], { cwd: source });
    await exec("git", ["commit", "-m", "init"], { cwd: source });

    const workspace = await openLocalRepository({ sourcePath: source, branch: "apo/test-branch" });
    expect(workspace.profile.kind).toBe("next");
    expect(workspace.profile.packageManager).toBe("npm");
    await workspace.apply({ tool: "write_file", path: "src/hello.txt", content: "from the sandbox\n" });
    const command = await workspace.apply({ tool: "run_command", name: "test" });
    expect(command).toMatch(/passed/);
    const saved = await workspace.persist();
    expect(saved.branch).toBe("apo/test-branch");
    expect(saved.diff).toContain("src/hello.txt");
    expect(saved.diff).toContain("from the sandbox");
    const verified = await workspace.verify();
    expect(verified.outcome).toBe("pass");
    await workspace.close();
    await expect(readFile(path.join(source, "src/hello.txt"), "utf8")).rejects.toThrow();
    expect(workspace.logs.some((entry) => entry.op === "write_file" && entry.ok)).toBe(true);
  }, 60_000);
});

async function scratch(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "apo-sandbox-"));
  cleanups.push(directory);
  return directory;
}
