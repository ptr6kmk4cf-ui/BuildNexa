# Architecture

AI Project Optimizer is one Next.js process. PostgreSQL stores projects, plans, routing decisions, executions, verification checks, costs, budgets, and audit rows. There is no separate worker, queue, or sandbox container.

## Request path

Server Components read the database through Prisma. Client Components cover the project wizard, confirmations, and the live refresh while a run is active. Server actions save plans, choose models, start runs, and cancel runs. Those actions run in the web process until they finish, including any allowlisted `npm` check.

`GET /api/health` reports the process and the database. `GET /api/github/connect` and `GET /api/github/callback` handle GitHub OAuth. Tokens stay on the server.

## Who can see a project

`viewerFromSession` picks the account for a request:

- A valid GitHub session selects that user.
- Production with no session selects nobody. Lists render the signed-out state and do not return another user's rows.
- Development and test, with no session, select the local operator `local-operator@localhost.invalid` when that user already exists.

Project, cost, activity, and pull-request queries filter on that user id. A task run, model choice, cancellation, or repository attach checks the same owner before it reads logs or writes. Provider on/off is one workspace setting stored on the local operator, not a per-user preference. The API keys behind it are process environment variables.

## What a run does

`createPlan` builds a task graph from the objective. It does not call a model or edit files. `routeTask` stores a model choice and an estimated cost. `runExecution` calls the selected model through `createControlledEnvironment`, which has no shell and no repository client. The reply is stored.

Verification, when attached, runs `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, or one fixed `tsc --noEmit` invocation. The command list is allowlisted, `shell` is off, the child gets a timeout, and environment variables whose names look like secrets are omitted. The working directory is this application's `process.cwd()`, not a checkout of the user's repository.

A budget ledger reserves shares for the first call, retries, debugging, escalation, and verification. A call whose estimate does not fit is not sent unless the run was explicitly allowed to exceed the budget. Measured savings stay unmeasured. The dashboard says so.

## What this process does not do

- It does not clone the selected repository into a sandbox.
- It does not apply the model reply to files.
- It does not create a GitHub branch.
- It does not open a pull request. The pull-request table only shows rows already stored.
- It does not share rate-limit counters across more than one instance.
- It does not cap CPU or memory with a cgroup. The model call has a timeout. The check process has a timeout. The host still owns the machine limits.

A platform request timeout can leave an `ExecutionRun` in `RUNNING` until its heartbeat is older than 45 seconds. The next execute marks that row failed before starting another run.

## Data

Prisma migrations live in `prisma/migrations`. The client is generated into `src/generated/prisma` and is not committed. Local Postgres is `docker-compose.yml`. Production applies the same migrations with `npx prisma migrate deploy`.
