# Security

This note records the boundaries that are enforced in code, and the ones that are not. It is not a claim that the full sign-in, sandbox, branch, and pull-request workflow has been exercised.

## Enforced

- Server environment is read only on the server. `getServerEnv` throws in the browser. Provider keys and GitHub credentials are not `NEXT_PUBLIC_` variables.
- Logs redact connection strings, GitHub token prefixes, `sk-` and `AIza` key shapes, OAuth query secrets, and object fields whose names look like secrets.
- GitHub OAuth state is a signed, short-lived cookie. The session cookie is `httpOnly` and `SameSite=Lax`. The access token is encrypted with AES-256-GCM before it is stored. Page queries do not select the token.
- Repository lists and repository selection are filtered by the session user.
- Project, cost, activity, task, and pull-request reads use the viewer from `viewerFromSession`. Production without a session gets no rows. A mutation checks `canAccessProject` before it reads that project's logs.
- Production without a session cannot create a project as the shared local operator.
- Verification commands are an allowlist. `spawn` uses `shell: false`. The child timeout comes from `VERIFICATION_CONFIG.commandTimeoutMs`. Secret-like environment variables are omitted.
- A GitHub repository is cloned into bubblewrap. File tools cannot leave that directory. Commands get memory, CPU, and process limits, no network, and a timeout. The model cannot supply command arguments. The application tree is not mounted.
- Model calls use `AbortSignal.timeout`. A stale run is not treated as active after 45 seconds.
- Zod parses plan, project, and pagination input. Unknown GitHub notice codes are not reflected into the page.
- Responses send `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, and a locked-down `Permissions-Policy`.
- Connect, plan, route, execute, and cancel are limited per process.

## Not enforced

- There is no general password sign-in. The only account is GitHub OAuth, and local development can act as the local operator.
- Pull-request creation is not implemented. A sandbox run can commit on a local branch and then deletes the workspace after keeping the diff in the task result.
- Repository commands need a delegated cgroup. On this host that write may use `sudo -n` only for cgroup files under `SANDBOX_CGROUP_PARENT`. The command itself runs as the user inside bubblewrap. If that cgroup cannot be limited, the command is refused.
- Rate limits reset when the process restarts and are not shared by a second instance.
- Provider on/off is one workspace row on the local operator. Any signed-in user who can open Settings can change it. The provider API keys are still process-wide.
- A production callback URL on `http` is rejected only by the operator's GitHub app settings. This code accepts `http` and `https`.
- Dependencies reported by `npm audit` were not upgraded. See below.

## Dependency audit

`npm audit` reported 12 high advisories and no critical advisories. They are in the toolchain, not in the request path:

- `braces` stack exhaustion through `micromatch` and `fast-glob`, reached from `eslint-config-next`, `shadcn`, and `ts-morph`.
- `deepmerge-ts` stack exhaustion through `@prisma/config` and the Prisma CLI.

Upgrading those packages would mean replacing the Next.js, shadcn, or Prisma toolchain. That was not done, because a blind upgrade can break the build. They are not imported by a route handler. Re-run `npm audit` when those tools publish a fix that stays on the current Next.js 16 and Prisma 6 lines.

## Isolation checks that still need a deployed environment

User isolation in the database was not executed here. This environment had no `DATABASE_URL`, no GitHub OAuth app, and no provider keys. The viewer rule, command allowlist, and log redaction have unit tests. A live test that signs in as two GitHub users and proves one cannot read the other still has to be run where those credentials exist.
