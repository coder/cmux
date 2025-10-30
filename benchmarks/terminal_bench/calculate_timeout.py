#!/usr/bin/env python3
"""
Calculate optimal global timeout for terminal-bench runs.

Usage:
    python calculate_timeout.py [--task-ids task1 task2 ...] [--multiplier 1.0]
"""

import argparse
import sys
from pathlib import Path

# Add parent directory to path to import task_timeouts
sys.path.insert(0, str(Path(__file__).parent))

from task_timeouts import get_max_timeout_for_tasks, VERY_SLOW_TIMEOUT


def main():
    parser = argparse.ArgumentParser(description="Calculate timeout for terminal-bench")
    parser.add_argument(
        "--task-ids",
        nargs="*",
        help="List of task IDs to calculate timeout for",
    )
    parser.add_argument(
        "--multiplier",
        type=float,
        default=1.0,
        help="Multiplier for the timeout (default: 1.0)",
    )
    parser.add_argument(
        "--format",
        choices=["seconds", "flag"],
        default="flag",
        help="Output format: 'seconds' (just the number) or 'flag' (--global-agent-timeout-sec VALUE)",
    )

    args = parser.parse_args()

    if args.task_ids:
        timeout = get_max_timeout_for_tasks(args.task_ids)
    else:
        # No specific tasks - use conservative default for full suite
        timeout = VERY_SLOW_TIMEOUT

    # Apply multiplier
    timeout = int(timeout * args.multiplier)

    if args.format == "seconds":
        print(timeout)
    else:
        print(f"--global-agent-timeout-sec {timeout}")


if __name__ == "__main__":
    main()
