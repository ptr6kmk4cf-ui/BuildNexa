import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

export type RuntimeBind = { from: string; to: string };

const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|DATABASE_URL|CIPHER|CREDENTIAL)/i;

export function applicationRealPath(cwd = process.cwd()): string {
  return realpathSync(/*turbopackIgnore: true*/ cwd);
}

export function nodeRuntimeBinds(cwd = process.cwd()): RuntimeBind[] {
  const application = applicationRealPath(cwd);
  const prefixes = new Set<string>();
  const executables = [process.execPath, ...pathEntries("node"), ...pathEntries("npm")];
  for (const executable of executables) {
    if (!executable || !existsSync(/*turbopackIgnore: true*/ executable)) continue;
    const prefix = nodePrefix(executable);
    if (!prefix) continue;
    const real = realpathSync(/*turbopackIgnore: true*/ prefix);
    if (real === application || real.startsWith(`${application}${path.sep}`)) continue;
    prefixes.add(real);
  }
  return [...prefixes].map((from) => ({ from, to: from }));
}

export function bwrapArguments(input: {
  workspace: string;
  command: string;
  args: readonly string[];
  network: boolean;
  binds?: readonly RuntimeBind[];
  extraEnv?: Readonly<Record<string, string>>;
  readOnly?: readonly RuntimeBind[];
}): string[] {
  const workspace = realpathSync(/*turbopackIgnore: true*/ input.workspace);
  const application = applicationRealPath();
  if (workspace === application || workspace.startsWith(`${application}${path.sep}`)) {
    throw new Error("The sandbox cannot mount the application directory.");
  }
  const args = [
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--die-with-parent",
    "--new-session",
  ];
  if (!input.network) args.push("--unshare-net");
  for (const dir of ["/usr", "/lib", "/bin"]) {
    if (existsSync(/*turbopackIgnore: true*/ dir)) args.push("--ro-bind", dir, dir);
  }
  if (existsSync(/*turbopackIgnore: true*/ "/lib64")) args.push("--ro-bind", "/lib64", "/lib64");
  if (input.network && existsSync(/*turbopackIgnore: true*/ "/etc/ssl")) args.push("--ro-bind", "/etc/ssl", "/etc/ssl");
  for (const bind of nodeRuntimeBinds()) args.push("--ro-bind", bind.from, bind.to);
  for (const bind of input.readOnly ?? []) {
    const from = realpathSync(/*turbopackIgnore: true*/ bind.from);
    if (from === application || from.startsWith(`${application}${path.sep}`)) {
      throw new Error("The sandbox cannot mount the application directory.");
    }
    args.push("--ro-bind", from, bind.to);
  }
  args.push("--proc", "/proc", "--dev", "/dev", "--tmpfs", "/tmp", "--bind", workspace, "/workspace", "--chdir", "/workspace");
  args.push("--clearenv");
  const pathValue = [nodeRuntimeBinds().map((bind) => path.join(bind.to, "bin")).find((entry) => existsSync(/*turbopackIgnore: true*/ entry)), "/usr/bin", "/bin"]
    .filter((entry): entry is string => Boolean(entry))
    .join(":");
  const env: Record<string, string> = {
    PATH: pathValue,
    HOME: "/tmp",
    LANG: "C.UTF-8",
    GIT_AUTHOR_NAME: "AI Project Optimizer",
    GIT_AUTHOR_EMAIL: "sandbox@localhost.invalid",
    GIT_COMMITTER_NAME: "AI Project Optimizer",
    GIT_COMMITTER_EMAIL: "sandbox@localhost.invalid",
    GIT_TERMINAL_PROMPT: "0",
  };
  for (const [key, value] of Object.entries(input.extraEnv ?? {})) {
    if (!/^[A-Z0-9_]+$/.test(key) || SECRET_ENV.test(key)) continue;
    env[key] = value;
  }
  if (input.extraEnv?.SANDBOX_GIT_TOKEN && input.command === "git" && input.args[0] === "clone") {
    env.SANDBOX_GIT_TOKEN = input.extraEnv.SANDBOX_GIT_TOKEN;
    env.GIT_ASKPASS = input.extraEnv.GIT_ASKPASS ?? "";
  }
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    args.push("--setenv", key, value);
  }
  args.push("--", input.command, ...input.args);
  return args;
}

export function sandboxEnvLeaks(args: readonly string[], secret: string): boolean {
  return args.some((arg) => arg.includes(secret));
}

function nodePrefix(executable: string): string | null {
  const real = realpathSync(/*turbopackIgnore: true*/ executable);
  const directory = path.dirname(real);
  if (path.basename(directory) !== "bin") return null;
  const prefix = path.dirname(directory);
  if (!existsSync(/*turbopackIgnore: true*/ path.join(prefix, "bin", "node"))) return null;
  return prefix;
}

function pathEntries(name: string): string[] {
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter((entry) => entry.length > 0 && entry !== ".")
    .map((entry) => path.join(entry, name));
}
