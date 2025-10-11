# Terminal Benchmarking

cmux ships with a headless adapter for [Terminal-Bench](https://www.tbench.ai/). The adapter runs the Electron backend without opening a window and exercises it through the same IPC paths we use in integration tests. This page documents how to launch benchmarks from the repository tree.

## Prerequisites

- Docker must be installed and running. Terminal-Bench executes each task inside a dedicated Docker container.
- `uv` is available in the nix `devShell` (provided via `flake.nix`), or install it manually from <https://docs.astral.sh/uv/>.
- Standard provider API keys (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) should be exported so cmux can stream responses.

Optional environment overrides:

| Variable               | Purpose                                                   | Default                                |
| ---------------------- | --------------------------------------------------------- | -------------------------------------- |
| `CMUX_AGENT_REPO_ROOT` | Path copied into each task container                      | repo root inferred from the agent file |
| `CMUX_TRUNK`           | Branch checked out when preparing the project             | `main`                                 |
| `CMUX_WORKSPACE_ID`    | Workspace identifier used inside cmux                     | `cmux-bench`                           |
| `CMUX_MODEL`           | Preferred model (supports `provider/model` syntax)        | `anthropic/claude-sonnet-4-5`          |
| `CMUX_THINKING_LEVEL`  | Optional reasoning level (`off`, `low`, `medium`, `high`) | `high`                                 |
| `CMUX_MODE`            | Starting mode (`plan` or `exec`)                          | `exec`                                 |
| `CMUX_TIMEOUT_MS`      | Optional stream timeout in milliseconds                   | no timeout                             |
| `CMUX_CONFIG_ROOT`     | Location for cmux session data inside the container       | `/root/.cmux`                          |
| `CMUX_APP_ROOT`        | Path where the cmux sources are staged                    | `/opt/cmux-app`                        |
| `CMUX_PROJECT_PATH`    | Explicit project directory inside the task container      | auto-detected from common paths        |

## Running Terminal-Bench

All commands below should be run from the repository root.

### Quick smoke test (single task)

```bash
uvx terminal-bench run \
  --dataset terminal-bench-core==0.1.1 \
  --agent-import-path benchmarks.terminal_bench.cmux_agent:CmuxAgent \
  --n-tasks 1
```

This downloads the Terminal-Bench runner, copies the cmux sources into the container, and validates the adapter against the first task only. Use this before attempting a full sweep.

### Full dataset

```bash
uvx terminal-bench run \
  --dataset terminal-bench-core==0.1.1 \
  --agent-import-path benchmarks.terminal_bench.cmux_agent:CmuxAgent
```

Results (pass/fail, token usage, wall-clock) are printed at the end of the run. Terminal-Bench also writes per-task logs under the current working directory; review them when diagnosing failures.

You can also use `make`:

```bash
TB_CONCURRENCY=6 TB_LIVESTREAM=1 \
make benchmark-terminal TB_ARGS="--n-tasks 3 --model anthropic/claude-sonnet-4-20250514 --agent-kwarg mode=plan --agent-kwarg thinking_level=medium"
```

`TB_DATASET` defaults to `terminal-bench-core==0.1.1`, but can be overridden (e.g. `make benchmark-terminal TB_DATASET=terminal-bench-core==head`).
Use `--agent-kwarg mode=plan` to exercise the plan/execute workflow—the CLI will gather a plan first, then automatically approve it and switch to execution. Leaving the flag off (or setting `mode=exec`) skips the planning phase.
Use `TB_CONCURRENCY=<n>` to control `--n-concurrent` (number of concurrently running tasks) and `TB_LIVESTREAM=1` to stream log output live instead of waiting for the run to finish. These map to Terminal-Bench’s `--n-concurrent` and `--livestream` flags.

## How the Adapter Works

The adapter lives in `benchmarks/terminal_bench/cmux_agent.py`. For each task it:

1. Copies the cmux repository (package manifests + `src/`) into `/tmp/cmux-app` inside the container.
2. Ensures Bun exists, then runs `bun install --frozen-lockfile`.
3. Launches `src/debug/agentSessionCli.ts` to prepare workspace metadata and stream the instruction, storing state under `CMUX_CONFIG_ROOT` (default `/root/.cmux`).

`CMUX_MODEL` accepts either the cmux colon form (`anthropic:claude-sonnet-4-5`) or the Terminal-Bench slash form (`anthropic/claude-sonnet-4-5`); the adapter normalises whichever you provide.

## Troubleshooting

- **`command not found: bun`** – ensure the container can reach Bun’s install script, or pre-install Bun in your base image. The adapter aborts if the install step fails.
- **Workspace creation errors** – set `CMUX_PROJECT_PATH` to the project directory inside the task container if auto-discovery misses it.
- **Streaming timeouts** – pass `--n-tasks 1` while iterating on fixes, or set `CMUX_TIMEOUT_MS=180000` to reinstate a timeout if needed.
