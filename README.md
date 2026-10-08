# AI Project Optimizer

Phase 2 connects a GitHub account and lets you attach a repository to a project. The workspace still does not call model vendors, route work, push commits, or open pull requests.

## Architecture

Next.js (App Router) renders the workspace. Server Components read PostgreSQL through Prisma. Client Components are limited to navigation, dialogs, and retry actions. Secrets stay in server environment variables and are never passed to the browser.

```text
src/app                routes: dashboard, projects, github, models, costs, activity, settings
src/app/api/health     process health, including database status
src/app/api/github     OAuth start and callback. Tokens never reach the browser.
src/server             request-time queries, project actions, and the GitHub store
src/lib                env, validation, errors, logging, encryption, GitHub API client
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

The data model is `User`, `Project`, `Repository`, `Provider`, `Model`, `Task`, `TaskDependency`, `TaskAttempt`, `ModelDecision`, `Verification`, `TokenUsage`, `CostRecord`, `Budget`, `PullRequest`, `AuditLog`, `GithubAccount`, and `ConnectedRepository`.

GitHub access tokens are encrypted with AES-256-GCM before they are written. Queries that render pages select the public account fields only. The first successful connection attaches to the local operator (`local-operator@localhost.invalid`) when that record has no GitHub account yet. A second GitHub account gets its own user. Repository lists and selection are filtered by that user, including when a store returns another user's row.

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
| `GITHUB_CLIENT_ID` | No | OAuth app client id. Omit, along with the other GitHub variables, to leave GitHub disconnected. |
| `GITHUB_CLIENT_SECRET` | No | OAuth app client secret. Server only. |
| `GITHUB_CALLBACK_URL` | No | Defaults to `http://127.0.0.1:43123/api/github/callback`. |
| `APP_SECRET` | No | Signs the OAuth state cookie and the session cookie. At least 32 characters. |
| `TOKEN_ENCRYPTION_KEY` | No | 32 bytes, base64-encoded. Encrypts the GitHub access token at rest. |

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

Vitest covers database initialization, environment validation, validation utilities, redaction, the health route, GitHub OAuth (including cancelled and forged callbacks), repository retrieval, repository selection, user isolation, token encryption, and disconnect.

```bash
npm test
```
