# Deployment

This application is one Node.js 22 process plus PostgreSQL 16. Execution runs inside the web process. Do not add a worker process; there is no queue for one to consume.

The container build does not make the GitHub sign-in, sandbox edit, branch, and pull-request workflow available. Those steps are not implemented. Read [SECURITY.md](SECURITY.md) before treating a deployment as the production workflow.

## Configuration

Copy `.env.example` to the host environment. Do not bake a `.env` file into the image. `.dockerignore` excludes `.env`.

| Variable | Production |
| --- | --- |
| `DATABASE_URL` | Required. PostgreSQL connection string for the private database. |
| `NODE_ENV` | `production`. The image sets this. |
| `LOG_LEVEL` | Optional. `debug`, `info`, `warn`, or `error`. Default `info`. |
| `GITHUB_CLIENT_ID` | Required to sign in. |
| `GITHUB_CLIENT_SECRET` | Required to sign in. Server only. |
| `GITHUB_CALLBACK_URL` | Required to sign in. `https` URL registered on the OAuth app. |
| `APP_SECRET` | Required to sign in. At least 32 characters. Signs the OAuth state and session cookies. |
| `TOKEN_ENCRYPTION_KEY` | Required to sign in. 32 bytes, base64. Encrypts the GitHub access token. |
| `OPENAI_API_KEY` | Optional. Omit to leave OpenAI unconfigured. |
| `ANTHROPIC_API_KEY` | Optional. Omit to leave Anthropic unconfigured. |
| `GEMINI_API_KEY` | Optional. Omit to leave Gemini unconfigured. |
| `MISTRAL_API_KEY` | Optional. Omit to leave Mistral unconfigured. |
| `DEEPSEEK_API_KEY` | Optional. Omit to leave DeepSeek unconfigured. |
| `XAI_API_KEY` | Optional. Omit to leave Grok unconfigured. Grok calls the xAI API. |
| `MODEL_PRICING` | Optional JSON. Omit to leave models unpriced, which keeps them from being selected. |

No `NEXT_PUBLIC_` variable carries a secret. The browser never receives a provider key or a GitHub token.

Generate the two secrets on the host:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use a different value for `APP_SECRET` than for `TOKEN_ENCRYPTION_KEY`. `APP_SECRET` is a long random string, not necessarily base64.

## Database

Apply committed migrations before starting the new release:

```bash
npx prisma migrate deploy
```

`npm run db:migrate` is the development command (`prisma migrate dev`). Do not use it against production.

The schema is the chain under `prisma/migrations`. A new release that adds a migration needs that command before traffic moves.

## Process

The image is `Dockerfile`. It installs dependencies, runs `npm run build`, and starts `npm start`, which listens on port 43123.

```bash
docker build -t ai-project-optimizer .
docker run --rm -p 43123:43123 --env-file /path/to/production.env ai-project-optimizer
```

The image healthcheck requests `http://127.0.0.1:43123/api/health`. A configured database that cannot be reached returns HTTP 503 and `status: degraded`. An unset database returns HTTP 200 and `checks.database: unconfigured`, which is not a healthy production deployment.

Put TLS in front of the process. The app itself serves HTTP on 43123.

## Sandbox

Repository commands need bubblewrap (`bwrap`) and a cgroup v2 parent with `cpu`, `memory`, and `pids` delegated. Set `SANDBOX_CGROUP_PARENT` if it is not `/sys/fs/cgroup/apo`.

```bash
sudo mkdir -p /sys/fs/cgroup/apo
echo '+cpu +memory +pids' | sudo tee /sys/fs/cgroup/apo/cgroup.subtree_control
sudo chown -R "$(id -u):$(id -g)" /sys/fs/cgroup/apo
```

Moving a process into that cgroup may require root when the server itself is already in another cgroup. The server uses `sudo -n` only to write those cgroup files. It does not pass the model’s text to sudo. Without this setup, a repository run stops instead of executing on the host.

## Workers

There is nothing to configure. A task run blocks the server action that started it. Size the platform request timeout above the model timeout (20 seconds) plus verification (up to 120 seconds per allowlisted check). If the platform cuts the request off, the run stays `RUNNING` until the heartbeat is 45 seconds old. The next execute marks it failed.

Rate limits live in memory in that process: 20 GitHub connect attempts, 8 plans, 12 model choices, 6 executes, and 30 cancellations per 10 minutes. A second instance has its own counters.

## Logging and monitoring

Logs are one JSON object per line on stdout and stderr. `LOG_LEVEL` sets the floor. Connection strings, GitHub token prefixes, provider-key shapes, and fields whose names look like secrets are redacted. Ship stdout to the host log system. Alert on `/api/health` returning 503, and on log lines with `"level":"error"`.

## Backup

Back up PostgreSQL with `pg_dump` on a schedule that matches how much cost and audit history you can lose. The application does not copy the database. Keep dumps somewhere the application process cannot write. Test a restore into an empty database and run `npx prisma migrate deploy` only if that database is behind the migrations.

GitHub tokens in the dump are ciphertext. The restore is readable only with the same `TOKEN_ENCRYPTION_KEY`. Store that key with the secret manager, not in the dump location.

## Rollback

Redeploy the previous image. If the new release added a migration, a rollback of the image does not undo that migration. Restore the database from the dump taken before `migrate deploy`, then start the previous image. Do not hand-edit the `_prisma_migrations` table to fake a downgrade.
