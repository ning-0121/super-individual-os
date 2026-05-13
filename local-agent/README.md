# SIO Local Agent — Runner V0.1

A tiny Node.js daemon that pulls **read-only** local-agent tasks from
Super Individual OS cloud and reports results.

> **V0.1 is strictly read-only.** Writes, shell, push, deploy, migration,
> and commit are refused both by the cloud policy gateway and by this
> runner's local policy guard (defence in depth). See `src/policy.ts`.

## Allowed actions

| Verb                 | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `git_status`         | `git status --short --branch` in `SIO_PROJECT_PATH` (fixed argv)     |
| `git_branch`         | `git branch --show-current`                                          |
| `list_files`         | One-level directory listing, hides `.env*`, `node_modules`, `.git`   |
| `npm_test_status`    | Reports whether `package.json` has a `test` script. Does NOT run it. |
| `build_status`       | Reports whether `package.json` has a `build` script. Does NOT run.  |
| `read_project_files` | Reads whitelisted files: `package.json`, `README.md`, `tsconfig.json`, `next.config.*`, `src/app/**`. Refuses `.env*`, `node_modules`, `.git`, `.next`, `.pem`, `id_rsa`, etc. Max 8 files × 64 KB. |

## Setup

```bash
cd local-agent
npm install
```

Required env (`.env` or shell):

```bash
export SIO_API_URL=https://super-individual-os.vercel.app
export SIO_AGENT_TOKEN=la_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # from /tools/autonomy
export SIO_PROJECT_PATH=/Users/you/Projects/your-repo
export SIO_MACHINE_NAME=mbp-2024                              # optional, defaults to hostname()
export SIO_HEARTBEAT_MS=30000                                 # optional
export SIO_POLL_MS=10000                                      # optional
export SIO_DRY_RUN=1                                          # default; "0" enables git commands
```

How to obtain `SIO_AGENT_TOKEN`:

1. Log in to SIO cloud.
2. Open `/tools/autonomy`.
3. POST `/api/local-agent/register` with `{ hostname, os, cursor_version }`.
4. Copy the `agent_token` from the response (starts with `la_`).

## Run

Long-running daemon:

```bash
npm start
```

One-shot (for CI / smoke test):

```bash
npm run once
```

Build to plain JS:

```bash
npm run build && node dist/index.js
```

## What gets executed

| Mode (`SIO_DRY_RUN`) | git_status / git_branch | other reads | shell |
| -------------------- | ----------------------- | ----------- | ----- |
| `1` (default)        | ✅ run                  | ✅ run (pure fs reads) | ❌ never |
| `0`                  | ✅ run                  | ✅ run                  | ❌ never |

`SIO_DRY_RUN` exists as a kill switch; even with it off, the runner
**only** runs the literal git commands listed above. There is no path
in this codebase that forwards user-supplied strings to a shell.

## Security boundaries

- **Token shape** enforced (`la_<hex≥16>`).
- **Path sandbox**: every fs access goes through `safeResolveInsideProject`,
  which rejects absolute paths, `..` traversal, null bytes, and a
  hard-coded deny-list (`.env*`, `node_modules`, `.git`, `.next`, `.pem`,
  `id_rsa`, `credentials.*`, `secrets.*`).
- **Read allow-list**: file reads must additionally match
  `READ_ALLOW_RULES` (basename or `src/app/` prefix).
- **No shell**: `git` is spawned via `child_process.spawn` with
  `shell: false` and a fixed argv. There is **no** code path that
  builds a command from `params`.
- **Per-action timeout**: 10 s.
- **Per-cycle ceiling**: ≤ 20 tasks per `/pending` poll.
- **Per-file ceiling**: 8 files × 64 KB for `read_project_files`.
- **Local policy re-check**: even if the cloud sends a destructive verb,
  the runner refuses it locally (see `classifyAction`).

## Wire protocol

```
POST /api/local-agent/heartbeat            (existing) — keep-alive
GET  /api/local-agent/pending              (V0.1)     — pull pending tool_runs
POST /api/local-agent/result               (V0.1)     — report outcome
```

All authenticate via `Authorization: Bearer <agent_token>`
(also accepted as `x-agent-token` header).

`POST /api/local-agent/result` body:

```json
{
  "tool_run_id": "uuid",
  "status": "success" | "error",
  "result":  { ... },
  "error_message": "...",
  "duration_ms": 123
}
```

The endpoint is **idempotent**: posting twice for the same `tool_run_id`
is a no-op after the first terminal transition.

## Triggering a task from the cloud

```bash
curl -X POST $SIO_API_URL/api/local-agent/request \
  -H 'content-type: application/json' \
  -b "session=...your sb cookies..." \
  -d '{"action":"git_status"}'
```

Or, from the Copilot bar:

> 看一下 git 状态

## Roadmap

| Version | Adds                                                      |
| ------- | --------------------------------------------------------- |
| V0.2    | Optional `npm test` execution behind a per-action gate    |
| V0.3    | Cursor handshake (`cursor_query` — still read-only)       |
| V1.0    | Writes behind a human-in-the-loop approval flow           |

V0.1 is the smallest thing that proves the cloud↔local channel works
without surrendering the keys to the kingdom.
