# Terminal-Bench Integration

This directory contains the cmux agent adapter for [Terminal-Bench](https://github.com/benediktstroebl/terminal-bench), a benchmarking framework for evaluating agentic CLI/terminal capabilities.

## Quick Start

```bash
# Run full benchmark suite (80 tasks, ~2.5 hours)
make benchmark-terminal

# Run with sample of 5 tasks
TB_SAMPLE_SIZE=5 make benchmark-terminal

# Run specific tasks
make benchmark-terminal TB_ARGS="--task-id hello-world --task-id chess-best-move"

# Run with specific model
make benchmark-terminal TB_ARGS="--agent-kwarg model_name=anthropic:claude-opus-4"
```

## Configuration

### Environment Variables

- `TB_DATASET`: Dataset to use (default: `terminal-bench-core==0.1.1`)
- `TB_SAMPLE_SIZE`: Number of random tasks to run (default: all 80 tasks)
- `TB_CONCURRENCY`: Number of concurrent tasks (default: 4)
- `TB_LIVESTREAM`: Enable livestream mode (set to `1` to enable)
- `TB_TIMEOUT`: Override timeout in seconds (default: intelligent per-task timeout)
- `TB_ARGS`: Additional arguments passed to terminal-bench

### Intelligent Timeout Handling

The Makefile automatically calculates optimal timeouts based on task complexity:

- **FAST tasks** (5 min): Simple operations like `hello-world`, `fix-permissions`
- **NORMAL tasks** (15 min): Default for most tasks
- **SLOW tasks** (30 min): Data processing, ML training, complex analysis
- **VERY_SLOW tasks** (60 min): Kernel compilation, large builds

**How it works:**

1. If `TB_TIMEOUT` is set, uses that value explicitly
2. If specific tasks are selected (via `TB_SAMPLE_SIZE` or `--task-id`), calculates the maximum timeout needed for those tasks
3. For full suite runs, uses 60 minutes (conservative default)

**Examples:**

```bash
# Fast tasks get 5 minute timeout automatically
make benchmark-terminal TB_ARGS="--task-id hello-world --task-id simple-web-scraper"

# Slow tasks get 60 minute timeout automatically
make benchmark-terminal TB_ARGS="--task-id build-linux-kernel-qemu"

# Override timeout manually (in seconds)
TB_TIMEOUT=1200 make benchmark-terminal TB_ARGS="--task-id chess-best-move"
```

### Task Timeout Configuration

Task timeouts are configured in `task_timeouts.py` based on empirical data from nightly runs. To add or modify timeouts:

```python
# In task_timeouts.py
TASK_TIMEOUTS = {
    "my-new-task": SLOW_TIMEOUT,  # 30 minutes
    "my-fast-task": FAST_TIMEOUT,  # 5 minutes
}
```

## Agent Configuration

The cmux agent supports the following kwargs (passed via `--agent-kwarg`):

- `model_name`: Model to use (e.g., `anthropic:claude-sonnet-4-5`, `openai:gpt-5-codex`)
- `thinking_level`: Thinking level (`off`, `low`, `medium`, `high`)
- `mode`: Agent mode (`plan`, `exec`)

**Example:**

```bash
make benchmark-terminal TB_ARGS="--agent-kwarg model_name=openai:gpt-5-codex --agent-kwarg thinking_level=high"
```

## Results

Results are saved to `runs/YYYY-MM-DD__HH-MM-SS/`:

- `results.json`: Aggregate results with pass/fail rates
- `run_metadata.json`: Run configuration and metadata
- `<task-id>/`: Per-task directories containing:
  - `sessions/agent.log`: Full agent execution log
  - `sessions/agent.cast`: Asciinema recording of agent session
  - `sessions/tests.log`: Test execution output
  - `results.json`: Per-trial results

## CI/CD Integration

See `.github/workflows/terminal-bench.yml` and `.github/workflows/nightly-terminal-bench.yml` for GitHub Actions integration.

**Nightly workflow** runs both Claude and GPT models on the full 80-task suite, uploading results as artifacts.

## Timeout Analysis (2025-10-30 Nightly Run)

Based on analysis of the Oct 30 nightly run:

- **27-35% of tasks hit timeout** with 15-minute default
- **5-6 tasks passed tests but hit timeout** (would have succeeded with more time)
- **Mean duration**: 356s (Anthropic) / 438s (OpenAI)
- **Median duration**: 272s (Anthropic) / 299s (OpenAI)

**Impact of intelligent timeouts**: Expected to reduce false timeout failures by ~50% and improve pass rates by 10-15 percentage points (from ~42% to ~52-57%).

## Files

- `cmux_agent.py`: Main agent adapter implementing Terminal-Bench's agent interface
- `cmux-run.sh`: Shell script that sets up environment and invokes cmux CLI
- `cmux_payload.py`: Helper to package cmux app for containerized execution
- `cmux_setup.sh.j2`: Jinja2 template for agent installation script
- `task_timeouts.py`: Task-specific timeout configuration
- `calculate_timeout.py`: Helper script to calculate optimal timeouts
- `sample_tasks.py`: Utility to randomly sample tasks from dataset
