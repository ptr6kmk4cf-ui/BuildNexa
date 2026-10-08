# AI Project Optimizer

Phase 1 is the application foundation for a workspace that will later plan a development objective, choose a model per task, and track cost per successful result.

This phase stores that structure and serves the product shells. It does not call model vendors, route work, run an agent, or open GitHub pull requests.

## Architecture

Next.js (App Router) renders the workspace. Server Components read PostgreSQL through Prisma. Client Components are limited to navigation, dialogs, and retry actions. Secrets stay in server environment variables and are never passed to the browser.

```text
src/app                routes: dashboard, projects, models, costs, activity, settings
src/app/api/health     process health, including database status
src/server             request-time queries and the create-project server action
src/lib                env, validation, errors, logging, database client
prisma                 schema and the initial migration
```

| Area | Role |
| --- | --- |
| Environment | `parseServerEnv` checks `DATABASE_URL` and `LOG_LEVEL` on the server. An empty database URL is local mode, not a crash. |
| Database | `getPrisma()` returns a client only when `DATABASE_URL` is set. `initializeDatabase()` runs `SELECT 1` with a short timeout. |
| Validation | Zod parses every server input, including the create-project form and list limits. |
| Errors | `AppError` becomes a public code and message. Unexpected errors are logged and replaced with a generic response. |
| Logging | JSON logs. Connection strings and secret-shaped fields are redacted. |
| UI | Shared shell with dashboard, projects, models, costs, activity, and settings. Data regions show loading, empty, unconfigured, and error states. |

The data model is `User`, `Project`, `Repository`, `Provider`, `Model`, `Task`, `TaskDependency`, `TaskAttempt`, `ModelDecision`, `Verification`, `TokenUsage`, `CostRecord`, `Budget`, `PullRequest`, and `AuditLog`.

There is no authentication in this phase. New projects are owned by a local operator record (`local-operator@localhost.invalid`) created on first write.

`GET /api/health` returns the process status. `checks.database` is `unconfigured`, `ok`, or `unavailable`. The HTTP status is 200 unless the database is configured and cannot be reached, in which case it is 503 and `status` is `degraded`.

## Local setup

Requirements: Node.js 22+, npm, and PostgreSQL 16 when you want to persist records. Docker is optional and only used to run Postgres.

```bash
npm install
cp .env.example .env
npm run dev
```

The dev server listens on [http://127.0.0.1:43123](http://127.0.0.1:43123). `next.config.ts` allows that host for the development socket. Opening the app at `127.0.0.1` while the process is bound to `0.0.0.0` otherwise fails the cross-site check, the hot-reload socket never connects, and the page stays static.

The app boots with `DATABASE_URL` unset. Pages render in local mode and explain how to connect a database. No cloud credentials are required.

## Environment variables

Copy `.env.example` to `.env`. Do not commit `.env`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | PostgreSQL connection string. Omit it to run in local mode. |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, or `error`. Defaults to `info`. |

`NODE_ENV` is set by Next.js. Do not put secrets in `NEXT_PUBLIC_*` variables. This app does not define any.

`npm run db:generate` can run without `DATABASE_URL`. The generator process uses the local example URL only so Prisma's config loader can start. That value is not passed to the Next.js server.

## Database setup

Start Postgres:

```bash
docker compose up -d
```

The compose file creates database `ai_project_optimizer` with user and password `optimizer` on port 5432. Those values match `.env.example` and are for local development only.

Apply the schema:

```bash
npx prisma migrate dev
```

Other database commands:

```bash
npm run db:generate   # generate the Prisma client
npm run db:migrate    # create and apply a migration in development
npm run db:push       # push the schema without a migration
```

The generated client is written to `src/generated/prisma` and is gitignored.

## Development commands

```bash
npm run dev         # Next.js on port 43123
npm run typecheck   # prisma generate, next typegen, tsc --noEmit
npm run lint        # eslint .
npm test            # prisma generate, vitest run
npm run build       # prisma generate, next build
npm start           # production server on port 43123
```

## Tests

Vitest covers database initialization (schema, migration, client fallback, unreachable database), environment validation, validation and formatting utilities, redaction, public error responses, and `GET /api/health`.

```bash
npm test
```
