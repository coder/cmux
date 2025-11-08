#!/usr/bin/env python3
"""
Adaptive concurrency wrapper for terminal-bench using burst-and-resume pattern.

Runs terminal-bench in bursts with adjustable concurrency, using tb's native
resume capability to skip completed tasks between bursts.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


class AdaptiveBench:
    def __init__(
        self,
        load_threshold: float,
        check_interval: int,
        max_concurrent: int,
        runs_dir: Path,
        tb_args: list[str],
    ):
        self.load_threshold = load_threshold
        self.check_interval = check_interval
        self.max_concurrent = max_concurrent
        self.runs_dir = runs_dir
        self.tb_args = tb_args
        self.current_concurrent = 1
        self.run_id: Optional[str] = None
        self.burst_count = 0

    def get_load_avg(self) -> float:
        """Get 1-minute load average."""
        return os.getloadavg()[0]

    def get_run_status(self) -> dict:
        """Get status of current run by parsing results.json and tb.lock."""
        if not self.run_id:
            return {"total": 0, "completed": 0, "incomplete": 0}

        try:
            # Parse tb.lock to get task count
            lock_path = self.runs_dir / self.run_id / "tb.lock"
            if lock_path.exists():
                with open(lock_path) as f:
                    lock_data = json.load(f)
                    total_tasks = len(lock_data.get("dataset", {}).get("task_ids", []))
            else:
                total_tasks = 0

            # Count completed tasks from results.json
            results_path = self.runs_dir / self.run_id / "results.json"
            completed = 0
            if results_path.exists():
                with open(results_path) as f:
                    results_data = json.load(f)
                    # Count unique task_ids in results
                    completed = len(
                        set(r["task_id"] for r in results_data.get("trials", []))
                    )

            return {
                "total": total_tasks,
                "completed": completed,
                "incomplete": max(0, total_tasks - completed),
            }
        except Exception as e:
            print(f"⚠️  Error getting run status: {e}")
            return {"total": 0, "completed": 0, "incomplete": 0}

    def adjust_concurrency(self) -> bool:
        """Check load and adjust concurrency. Returns True if changed."""
        load = self.get_load_avg()
        old_concurrent = self.current_concurrent

        if load < self.load_threshold and self.current_concurrent < self.max_concurrent:
            self.current_concurrent = min(
                self.current_concurrent * 2, self.max_concurrent
            )
        elif load > self.load_threshold and self.current_concurrent > 1:
            self.current_concurrent = max(self.current_concurrent // 2, 1)

        if self.current_concurrent != old_concurrent:
            print(
                f"📊 Load: {load:.2f} (threshold: {self.load_threshold}) → "
                f"Concurrency: {old_concurrent} → {self.current_concurrent}"
            )
            return True

        print(f"📊 Load: {load:.2f} (threshold: {self.load_threshold}) → No change")
        return False

    def run_burst(self) -> int:
        """Run a single burst of terminal-bench. Returns exit code."""
        self.burst_count += 1

        if self.burst_count == 1:
            # First burst - create new run
            cmd = [
                "uvx",
                "terminal-bench",
                "run",
                "--n-concurrent",
                str(self.current_concurrent),
                "--output-path",
                str(self.runs_dir),
                *self.tb_args,
            ]
            print(
                f"🚀 Burst #{self.burst_count}: Starting NEW run with "
                f"concurrency={self.current_concurrent}"
            )
        else:
            # Subsequent bursts - resume existing run
            cmd = [
                "uvx",
                "terminal-bench",
                "runs",
                "resume",
                "--run-id",
                self.run_id,
                "--runs-dir",
                str(self.runs_dir),
            ]
            print(
                f"🔄 Burst #{self.burst_count}: Resuming run {self.run_id} "
                f"with concurrency={self.current_concurrent}"
            )

        print(f"   Command: {' '.join(cmd)}")
        burst_start = time.time()

        # Run terminal-bench
        result = subprocess.run(cmd, env=os.environ.copy())

        burst_duration = time.time() - burst_start

        # Capture run_id from first burst
        if self.burst_count == 1 and result.returncode == 0:
            # Find most recent run directory
            if self.runs_dir.exists():
                run_dirs = [
                    d
                    for d in self.runs_dir.iterdir()
                    if d.is_dir() and (d / "tb.lock").exists()
                ]
                if run_dirs:
                    # Sort by modification time and take most recent
                    self.run_id = sorted(run_dirs, key=lambda p: p.stat().st_mtime)[
                        -1
                    ].name
                    print(f"📝 Captured run_id: {self.run_id}")

        print(f"⏱️  Burst #{self.burst_count} completed in {burst_duration:.1f}s")

        # Update n_concurrent in tb.lock for next resume
        if self.run_id and result.returncode == 0:
            self._update_lock_concurrency()

        return result.returncode

    def _update_lock_concurrency(self):
        """Update n_concurrent_trials in tb.lock for next resume."""
        lock_path = self.runs_dir / self.run_id / "tb.lock"
        if not lock_path.exists():
            return

        try:
            with open(lock_path, "r") as f:
                lock_data = json.load(f)

            # Update concurrency in lock file
            if "run_config" in lock_data:
                lock_data["run_config"][
                    "n_concurrent_trials"
                ] = self.current_concurrent

            with open(lock_path, "w") as f:
                json.dump(lock_data, f, indent=2)

            print(f"   Updated tb.lock with concurrency={self.current_concurrent}")
        except Exception as e:
            print(f"⚠️  Could not update tb.lock: {e}")

    def run(self):
        """Main loop: run bursts with adaptive concurrency."""
        try:
            while True:
                # Run burst with current concurrency
                exit_code = self.run_burst()

                if exit_code != 0:
                    print(f"❌ Terminal-bench exited with code {exit_code}")
                    return exit_code

                # Check if we're done
                status = self.get_run_status()
                print(
                    f"📈 Progress: {status['completed']}/{status['total']} tasks "
                    f"({status['incomplete']} remaining)"
                )

                if status["incomplete"] == 0:
                    print("✅ All tasks completed!")
                    return 0

                # Wait before next burst and potentially adjust concurrency
                print(f"⏸️  Waiting {self.check_interval}s before next burst...")
                time.sleep(self.check_interval)
                self.adjust_concurrency()

        except KeyboardInterrupt:
            print("\n⚠️  Received interrupt, stopping...")
            return 130


def main():
    parser = argparse.ArgumentParser(
        description="Run terminal-bench with adaptive concurrency via burst-and-resume"
    )
    parser.add_argument(
        "--load-threshold",
        type=float,
        default=1.0,
        help="Load average threshold for adjusting concurrency (default: 1.0)",
    )
    parser.add_argument(
        "--check-interval",
        type=int,
        default=60,
        help="Seconds between bursts (default: 60)",
    )
    parser.add_argument(
        "--max-concurrent",
        type=int,
        required=True,
        help="Maximum concurrency limit",
    )
    parser.add_argument(
        "--runs-dir",
        type=Path,
        default=Path("runs"),
        help="Directory for run outputs (default: runs)",
    )
    parser.add_argument(
        "tb_args",
        nargs=argparse.REMAINDER,
        help="Arguments to pass to terminal-bench run",
    )

    args = parser.parse_args()

    # Strip leading '--' from tb_args if present
    tb_args = args.tb_args
    if tb_args and tb_args[0] == "--":
        tb_args = tb_args[1:]

    bench = AdaptiveBench(
        load_threshold=args.load_threshold,
        check_interval=args.check_interval,
        max_concurrent=args.max_concurrent,
        runs_dir=args.runs_dir,
        tb_args=tb_args,
    )

    sys.exit(bench.run())


if __name__ == "__main__":
    main()
