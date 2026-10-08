import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// Prisma's config loader requires DATABASE_URL even for `generate`, which does not connect.
// Use the local example URL only inside this process when the variable is unset.
// The Next.js server does not inherit this value.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "postgresql://optimizer:optimizer@127.0.0.1:5432/ai_project_optimizer";
}

const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "generate"], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
