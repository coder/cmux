"""
Task-specific timeout recommendations based on terminal-bench nightly results.

Analysis from 2025-10-30 run showed:
- Default timeout appears to be ~15 minutes (900s) per task
- 27-35% of tasks hit timeout (22 for Anthropic, 28 for OpenAI)
- Some tasks that timed out actually passed their tests
- Complex tasks (compilation, data processing) need more time
- Simple tasks (hello-world) need less time

Strategy:
- FAST tasks (< 5 min): Simple file operations, basic commands
- NORMAL tasks (15 min): Default for most tasks  
- SLOW tasks (30 min): Data processing, model training, complex analysis
- VERY_SLOW tasks (60 min): Kernel compilation, large builds
"""

# Timeout in seconds
FAST_TIMEOUT = 300  # 5 minutes
NORMAL_TIMEOUT = 900  # 15 minutes (current default)
SLOW_TIMEOUT = 1800  # 30 minutes
VERY_SLOW_TIMEOUT = 3600  # 60 minutes

# Tasks that need extended timeouts (evidence from 2025-10-30 run)
TASK_TIMEOUTS = {
    # VERY_SLOW: Compilation tasks that legitimately take 30+ minutes
    "build-linux-kernel-qemu": VERY_SLOW_TIMEOUT,  # Failed at 763s
    "build-initramfs-qemu": VERY_SLOW_TIMEOUT,
    "build-tcc-qemu": SLOW_TIMEOUT,
    
    # SLOW: Data processing, ML training, complex analysis
    "count-dataset-tokens": SLOW_TIMEOUT,  # Anthropic timed out at 808s, OpenAI succeeded at 344s
    "train-fasttext": SLOW_TIMEOUT,  # Timed out at 900s
    "cartpole-rl-training": SLOW_TIMEOUT,  # Succeeded but took time
    "hf-model-inference": SLOW_TIMEOUT,  # Timed out at 660s
    "eval-mteb": SLOW_TIMEOUT,
    "eval-mteb.hard": SLOW_TIMEOUT,
    "reshard-c4-data": SLOW_TIMEOUT,
    
    # SLOW: QEMU/emulation tasks
    "qemu-startup": SLOW_TIMEOUT,  # Passed at 838s but hit timeout
    "qemu-alpine-ssh": SLOW_TIMEOUT,
    "run-pdp11-code": SLOW_TIMEOUT,
    
    # SLOW: Complex algorithmic tasks
    "blind-maze-explorer-algorithm": SLOW_TIMEOUT,
    "blind-maze-explorer-algorithm.easy": SLOW_TIMEOUT,
    "blind-maze-explorer-algorithm.hard": SLOW_TIMEOUT,  # Passed at 1200s!
    "path-tracing": SLOW_TIMEOUT,  # Passed at 660s
    "path-tracing-reverse": SLOW_TIMEOUT,  # Timed out at 660s
    
    # SLOW: Security/crypto tasks that may need brute force
    "crack-7z-hash": SLOW_TIMEOUT,
    "crack-7z-hash.hard": SLOW_TIMEOUT,
    "password-recovery": SLOW_TIMEOUT,
    "security-vulhub-minio": SLOW_TIMEOUT,
    
    # SLOW: Complex git/code analysis
    "git-workflow-hack": SLOW_TIMEOUT,  # Passed but hit timeout
    "pytorch-model-cli": SLOW_TIMEOUT,  # Passed at 541s
    "swe-bench-astropy-1": SLOW_TIMEOUT,
    "swe-bench-astropy-2": SLOW_TIMEOUT,
    "swe-bench-fsspec": SLOW_TIMEOUT,
    "swe-bench-langcodes": SLOW_TIMEOUT,
    
    # SLOW: Compilation/code generation
    "gpt2-codegolf": SLOW_TIMEOUT,
    "polyglot-c-py": SLOW_TIMEOUT,
    "polyglot-rust-c": SLOW_TIMEOUT,
    "write-compressor": SLOW_TIMEOUT,
    
    # SLOW: Complex system tasks
    "cron-broken-network": SLOW_TIMEOUT,
    "oom": SLOW_TIMEOUT,
    "fibonacci-server": SLOW_TIMEOUT,
    "incompatible-python-fasttext.base_with_hint": SLOW_TIMEOUT,
    "extract-safely": SLOW_TIMEOUT,
    
    # FAST: Simple tasks that should complete quickly
    "hello-world": FAST_TIMEOUT,
    "fix-permissions": FAST_TIMEOUT,
    "openssl-selfsigned-cert": FAST_TIMEOUT,
    "simple-web-scraper": FAST_TIMEOUT,
    "simple-sheets-put": FAST_TIMEOUT,
    "csv-to-parquet": FAST_TIMEOUT,
    "crack-7z-hash.easy": FAST_TIMEOUT,
}


def get_timeout_for_task(task_id: str) -> int:
    """Get recommended timeout in seconds for a given task."""
    return TASK_TIMEOUTS.get(task_id, NORMAL_TIMEOUT)


def get_max_timeout_for_tasks(task_ids: list[str]) -> int:
    """
    Get the maximum timeout needed for a set of tasks.
    Useful for setting --global-agent-timeout-sec.
    """
    if not task_ids:
        return VERY_SLOW_TIMEOUT  # Conservative default for unknown tasks
    
    return max(get_timeout_for_task(task_id) for task_id in task_ids)
