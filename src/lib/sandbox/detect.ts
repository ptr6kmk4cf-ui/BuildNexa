export type PackageManager = "npm" | "pnpm" | "yarn";
export type ProjectKind = "next" | "typescript" | "node" | "unknown";

export type ApprovedCommand = {
  name: "test" | "lint" | "typecheck" | "build";
  command: string;
  args: string[];
};

export type ProjectProfile = {
  kind: ProjectKind;
  packageManager: PackageManager | null;
  commands: ApprovedCommand[];
};

const COMMAND_NAMES = ["test", "lint", "typecheck", "build"] as const;

export function detectProject(input: {
  packageJson: unknown;
  fileNames: readonly string[];
}): ProjectProfile {
  const names = new Set(input.fileNames.map((name) => name.replace(/\\/g, "/")));
  const packageJson = isRecord(input.packageJson) ? input.packageJson : null;
  if (!packageJson) return { kind: "unknown", packageManager: null, commands: [] };

  const packageManager = detectManager(packageJson, names);
  const kind = detectKind(packageJson, names);
  if (!packageManager) return { kind, packageManager: null, commands: [] };

  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : {};
  const commands: ApprovedCommand[] = [];
  for (const name of COMMAND_NAMES) {
    const script = scripts[name];
    if (typeof script !== "string" || script.trim().length === 0) continue;
    commands.push({ name, command: packageManager, args: ["run", name] });
  }
  return { kind, packageManager, commands };
}

export function commandFor(profile: ProjectProfile, name: string): ApprovedCommand | null {
  return profile.commands.find((command) => command.name === name) ?? null;
}

function detectManager(packageJson: Record<string, unknown>, names: ReadonlySet<string>): PackageManager | null {
  const field = packageJson.packageManager;
  if (typeof field === "string") {
    const manager = field.trim().toLowerCase();
    if (manager.startsWith("pnpm@")) return "pnpm";
    if (manager.startsWith("yarn@")) return "yarn";
    if (manager.startsWith("npm@")) return "npm";
    return null;
  }
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("package-lock.json") || names.has("npm-shrinkwrap.json")) return "npm";
  return null;
}

function detectKind(packageJson: Record<string, unknown>, names: ReadonlySet<string>): ProjectKind {
  const deps = { ...record(packageJson.dependencies), ...record(packageJson.devDependencies) };
  const nextFile = [...names].some((name) => /^next\.config\.(js|mjs|ts|cjs)$/.test(name));
  if (nextFile || typeof deps.next === "string") return "next";
  if (names.has("tsconfig.json") || typeof deps.typescript === "string") return "typescript";
  return "node";
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
