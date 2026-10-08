# AI Project Optimizer

Phase 10 is the workspace around that backend: the dashboard, project sections, live task status, task detail, costs, and a six-step project start. Every figure is read from stored projects, runs, and cost records.

Phase 9 spends a project budget on the lowest expected cost per successful result, not the lowest token price. The approved amount reserves shares for retries, debugging, escalation, and verification. A call whose estimate does not fit the remaining share is not sent, unless the run was explicitly allowed to exceed the budget. Actual provider cost, the estimated premium-token baseline, the estimated difference, and measured savings are labeled separately. Measured savings stay unmeasured until a premium run is executed.

Phase 8 verifies a model reply before calling the task complete. After the selected model answers, the workspace runs the JavaScript or TypeScript project's own test, lint, typecheck, and build commands. The result is pass, fail, partial, or unknown. The first failure retries the same model with the check output in the prompt. A later failure asks routing for a stronger model only when the expected cost and success estimate justify it. If routing has no different model and another try still fits the budget, the same model may run again until the attempt limit. An unresolved task reports what failed, which attempts ran, the cost incurred, and why it stopped. The model reply is stored and is not written into the repository.

## Architecture

Next.js (App Router) renders the workspace. Server Components read PostgreSQL through Prisma. Client Components are limited to navigation, dialogs, and retry actions. Secrets stay in server environment variables and are never passed to the browser.

```text
src/app                routes: dashboard, projects, github, models, costs, activity, settings
src/app/projects/new   goal, budget, and optimization mode
src/app/api/health     process health, including database status
src/app/api/github     OAuth start and callback. Tokens never reach the browser.
src/server             request-time queries, plans, GitHub, and provider settings
src/lib/planner        task graph, dependency checks, and context-request hints
src/lib/routing        expected-cost model choice, history blend, and decision factors
src/lib/execution      dependency queue, retries, timeouts, cancellation, and the controlled model environment
src/lib/verification   project checks, pass/fail interpretation, and escalation decisions
src/lib/budget        budget reserves, cost per success, and savings labels
src/lib/ai             provider interface, adapters, registry, and cost calculation
src/lib                env, validation, errors, logging, encryption, GitHub API client
prisma                 schema and migrations
```

| Area | Role |
| --- | --- |
| Environment | `parseServerEnv` checks `DATABASE_URL` and `LOG_LEVEL` on the server. An empty database URL is local mode, not a crash. |
| Database | `getPrisma()` returns a client only when `DATABASE_URL` is set. `initializeDatabase()` runs `SELECT 1` with a short timeout. |
| Validation | Zod parses every server input, including the create-project form and list limits. |
| Errors | `AppError` becomes a public code and message. Unexpected errors are logged and replaced with a generic response. |
| Logging | JSON logs. Connection strings and secret-shaped fields are redacted. |
| UI | Shared shell with dashboard, projects, models, costs, activity, and settings. Data regions show loading, empty, unconfigured, and error states. |

The data model is `User`, `Project`, `Repository`, `Provider`, `Model`, `ProjectPlan`, `Task`, `TaskDependency`, `TaskAttempt`, `ExecutionRun`, `TaskExecution`, `ExecutionLog`, `ModelDecision`, `Verification`, `VerificationCheck`, `TokenUsage`, `CostRecord`, `Budget`, `PullRequest`, `AuditLog`, `GithubAccount`, `ConnectedRepository`, and `ProviderPreference`.

`createPlan` turns a software objective into ordered tasks. Each task has an id, description, type, priority, difficulty, dependencies, expected output, verification criteria, and a complexity from 1 to 5. Savings omits the extra architecture and documentation steps. Balanced follows analysis, architecture, implementation, tests, security when the goal needs it, and final verification. Quality adds planning and documentation. A dependency that would cycle is rejected. Context requests store repository identity and path hints for a later retrieval step. They do not contain file contents.

The new-project screen collects the goal, a USD budget, and Savings, Balanced, or Quality. When GitHub is connected, the selected repository contributes its name, branch, visibility, and description. After the plan is saved, the project page shows the graph and each task can be opened on its own.

`AIProvider` is the only model-call surface. `OpenAIProvider`, `AnthropicProvider`, and `GeminiProvider` adapt vendor HTTP responses into that surface. `routeTask` does not call `execute`. `runExecution` does, through a controlled environment that has no shell and no repository writes.

`runExecution` queues every task, starts work whose dependencies are complete, and keeps a small concurrency limit. A provider error is retried. A call that misses its deadline fails that attempt. Cancellation stops the running call and leaves later tasks unstarted. When verification is attached, a stored reply is not success until the checks pass. The first failed check retries the same model with that failure in the prompt. A later failure asks `routeTask` for a different model, leaving out models that already failed this task, and continues only when the success estimate improves enough and the expected cost stays within the budget and the cost ceiling. A timeout or connection error uses that same limit. A missing API key does not retry that model. With no different model, the same model can be tried again until `VERIFICATION_CONFIG.maxAttempts`. Cancellation stops a running check. The task page shows each check command, output, exit code, duration, and errors.

`runExecution` without a verifier still completes when the model returns a reply. That path remains for provider-only retries. The project page passes a verifier, so a run there does not report success from the reply alone.

`createBudgetLedger` holds an approved USD limit. The first call can use half of it. The rest stays reserved for retries (15%), debugging (10%), escalation (15%), and verification (10%). A call is sent only when its estimate fits the matching share. If it does not, that task is cancelled and later queued tasks stop. The run form checkbox is the explicit authorization to spend past those shares. Each priced call records the provider, model, task, input tokens, output tokens, cached tokens, tool calls, duration, and actual cost, marked initial, retry, debug, escalation, or verification. The Costs page shows actual cost, remaining budget, cost by task, model, and provider, retry cost, and escalation cost. Alerts appear at 50% of the budget, at 80%, and when the budget is used. A premium baseline replays this run's token counts at the highest configured registry price. That total and the difference are labeled estimated. Measured savings stay unmeasured, because a second premium-priced run is not executed for the comparison.

`routeTask` scores each available model for one task. Expected cost is the first run, plus estimated retries, escalation, context, and verification. Savings keeps a quality floor and then prefers the lower expected cost. Balanced does the same and penalizes very slow models. Quality raises the floor and, on important tasks, can pay more for a higher success estimate. Success probabilities are estimates from the configured 0–5 ratings, blended with `TaskAttempt` history when attempts exist. They are not a measured accuracy. A provider that is disabled or has no API key is unavailable. A model below the capability floor, without required tool support, or with no price is not selected. The decision stores the task, candidates, selected model, estimated cost, success estimate, concise factors, and optimization mode. No chain-of-thought is stored.

The registry in `src/lib/ai/registry-data.ts` holds provider, model id, context window, tool support, streaming, and local 0–5 ratings for coding, reasoning, planning, debugging, research, speed, and reliability. Those ratings are workspace configuration, not vendor benchmarks. Prices are not included. Set `MODEL_PRICING` to a JSON object keyed by `provider:modelId` with `inputPerMillion`, `outputPerMillion`, and optional `cachedInputPerMillion`. Amounts are strings with up to six decimal places. Unknown keys are ignored, and a bad document does not crash the app.

Provider API keys are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY`. They stay in the server environment. Settings can enable or disable a provider for the signed-in user, or the local operator when no GitHub session exists. The form reports whether a key is present and never renders the value. Saving that choice requires PostgreSQL.

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
| `OPENAI_API_KEY` | No | Server-only OpenAI key. Omit it to leave OpenAI unconfigured. |
| `ANTHROPIC_API_KEY` | No | Server-only Anthropic key. Omit it to leave Anthropic unconfigured. |
| `GEMINI_API_KEY` | No | Server-only Gemini key. Omit it to leave Gemini unconfigured. |
| `MODEL_PRICING` | No | JSON per-million USD prices for registry models. Omit it to leave every model unpriced. |

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

Vitest covers database initialization, environment validation, validation utilities, redaction, the health route, GitHub OAuth (including cancelled and forged callbacks), repository retrieval, repository selection, user isolation, token encryption, disconnect, provider success and failure, timeouts, malformed responses, cost calculation, model capabilities, simple and complex plans, invalid objectives, dependency links, cycle rejection, task validation, routing for simple coding, complex coding, documentation, testing, debugging, savings versus quality, an unavailable provider, and insufficient capability, plus budget enforcement, cost aggregation, retry cost, escalation cost, provider pricing, an insufficient budget, and cancellation when the budget is exhausted.

```bash
npm test
```
