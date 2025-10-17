#!/usr/bin/env python3
"""Sample random tasks from Terminal-Bench dataset.

Usage:
    python sample_tasks.py --dataset terminal-bench-core==0.1.1 --sample-size 10

This script lists tasks from a downloaded Terminal-Bench dataset and randomly samples N tasks,
outputting their task IDs as a comma-separated list suitable for --task-id-subset.
"""

from __future__ import annotations

import argparse
import os
import random
import sys
from pathlib import Path


def get_cache_dir() -> Path:
    """Get the Terminal-Bench cache directory."""
    # Use the same default as terminal-bench
    return Path.home() / ".cache" / "terminal-bench"


def sample_tasks(dataset: str, sample_size: int, seed: int | None = None) -> list[str]:
    """Sample random tasks from a Terminal-Bench dataset.

    Args:
        dataset: Dataset identifier (e.g., "terminal-bench-core==0.1.1")
        sample_size: Number of tasks to sample
        seed: Random seed for reproducibility (optional)

    Returns:
        List of task IDs
    """
    # Parse dataset name and version
    dataset_parts = dataset.split("==")
    dataset_name = dataset_parts[0]
    version = dataset_parts[1] if len(dataset_parts) > 1 else "head"

    # Look for the dataset in the cache
    cache_dir = get_cache_dir()
    dataset_path = cache_dir / dataset_name / version

    if not dataset_path.exists():
        print(
            f"Error: Dataset {dataset_name} version {version} not found in cache.",
            file=sys.stderr,
        )
        print(f"Expected location: {dataset_path}", file=sys.stderr)
        print(
            f"Please download it first with: uvx terminal-bench datasets download --dataset {dataset}",
            file=sys.stderr,
        )
        sys.exit(1)

    # List all task directories
    try:
        all_tasks = [
            d.name
            for d in dataset_path.iterdir()
            if d.is_dir() and not d.name.startswith(".")
        ]

        if not all_tasks:
            print(
                f"Error: No tasks found in {dataset_path}",
                file=sys.stderr,
            )
            sys.exit(1)

        # Sample tasks
        if seed is not None:
            random.seed(seed)

        if sample_size >= len(all_tasks):
            print(
                f"Warning: sample_size ({sample_size}) >= total tasks ({len(all_tasks)}), using all tasks",
                file=sys.stderr,
            )
            return all_tasks

        sampled_ids = random.sample(all_tasks, sample_size)
        return sampled_ids

    except Exception as e:
        print(f"Error listing tasks from {dataset_path}: {e}", file=sys.stderr)
        sys.exit(1)


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Sample random tasks from Terminal-Bench dataset"
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Dataset identifier (e.g., terminal-bench-core==0.1.1)",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        required=True,
        help="Number of tasks to sample",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Random seed for reproducibility (optional)",
    )
    parser.add_argument(
        "--format",
        choices=["comma", "space", "newline"],
        default="comma",
        help="Output format for task IDs (default: comma)",
    )

    args = parser.parse_args()

    task_ids = sample_tasks(args.dataset, args.sample_size, args.seed)

    # Output in requested format
    if args.format == "comma":
        print(",".join(task_ids))
    elif args.format == "space":
        print(" ".join(task_ids))
    elif args.format == "newline":
        for task_id in task_ids:
            print(task_id)


if __name__ == "__main__":
    main()
