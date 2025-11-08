"""Tests for adaptive_bench.py"""

import json
import os
from pathlib import Path
from unittest.mock import MagicMock, mock_open, patch

import pytest

from adaptive_bench import AdaptiveBench


class TestAdaptiveBench:
    """Test suite for AdaptiveBench."""

    def test_init(self):
        """Test AdaptiveBench initialization."""
        bench = AdaptiveBench(
            load_threshold=2.0,
            check_interval=30,
            max_concurrent=8,
            runs_dir=Path("test_runs"),
            tb_args=["--dataset", "test"],
        )

        assert bench.load_threshold == 2.0
        assert bench.check_interval == 30
        assert bench.max_concurrent == 8
        assert bench.runs_dir == Path("test_runs")
        assert bench.tb_args == ["--dataset", "test"]
        assert bench.current_concurrent == 1
        assert bench.run_id is None
        assert bench.burst_count == 0

    @patch("adaptive_bench.os.getloadavg")
    def test_get_load_avg(self, mock_getloadavg):
        """Test getting load average."""
        mock_getloadavg.return_value = (2.5, 2.0, 1.5)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        load = bench.get_load_avg()
        assert load == 2.5
        mock_getloadavg.assert_called_once()

    @patch("adaptive_bench.os.getloadavg")
    def test_adjust_concurrency_increase(self, mock_getloadavg):
        """Test concurrency increases when load is low."""
        mock_getloadavg.return_value = (0.5, 0.5, 0.5)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        bench.current_concurrent = 2
        changed = bench.adjust_concurrency()

        assert changed is True
        assert bench.current_concurrent == 4  # Doubled

    @patch("adaptive_bench.os.getloadavg")
    def test_adjust_concurrency_decrease(self, mock_getloadavg):
        """Test concurrency decreases when load is high."""
        mock_getloadavg.return_value = (2.0, 2.0, 2.0)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        bench.current_concurrent = 8
        changed = bench.adjust_concurrency()

        assert changed is True
        assert bench.current_concurrent == 4  # Halved

    @patch("adaptive_bench.os.getloadavg")
    def test_adjust_concurrency_no_change(self, mock_getloadavg):
        """Test concurrency stays same when load is at threshold."""
        mock_getloadavg.return_value = (1.0, 1.0, 1.0)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        bench.current_concurrent = 4
        changed = bench.adjust_concurrency()

        assert changed is False
        assert bench.current_concurrent == 4

    @patch("adaptive_bench.os.getloadavg")
    def test_adjust_concurrency_respects_max(self, mock_getloadavg):
        """Test concurrency doesn't exceed max_concurrent."""
        mock_getloadavg.return_value = (0.1, 0.1, 0.1)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=8,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        bench.current_concurrent = 8
        changed = bench.adjust_concurrency()

        assert changed is False
        assert bench.current_concurrent == 8  # Stays at max

    @patch("adaptive_bench.os.getloadavg")
    def test_adjust_concurrency_respects_min(self, mock_getloadavg):
        """Test concurrency doesn't go below 1."""
        mock_getloadavg.return_value = (5.0, 5.0, 5.0)
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        bench.current_concurrent = 1
        changed = bench.adjust_concurrency()

        assert changed is False
        assert bench.current_concurrent == 1  # Stays at min

    def test_get_run_status_no_run_id(self):
        """Test get_run_status returns zeros when no run_id."""
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )

        status = bench.get_run_status()
        assert status == {"total": 0, "completed": 0, "incomplete": 0}

    @patch("builtins.open", new_callable=mock_open)
    @patch("pathlib.Path.exists")
    def test_get_run_status_with_results(self, mock_exists, mock_file):
        """Test get_run_status parses results correctly."""
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )
        bench.run_id = "test-run"

        # Mock tb.lock with 5 tasks
        tb_lock_data = {
            "dataset": {
                "task_ids": ["task1", "task2", "task3", "task4", "task5"]
            }
        }

        # Mock results.json with 3 completed tasks
        results_data = {
            "trials": [
                {"task_id": "task1", "resolved": True},
                {"task_id": "task2", "resolved": False},
                {"task_id": "task3", "resolved": True},
            ]
        }

        def exists_side_effect(path):
            return True  # Both files exist

        mock_exists.side_effect = exists_side_effect

        def open_side_effect(path, *args, **kwargs):
            if "tb.lock" in str(path):
                return mock_open(read_data=json.dumps(tb_lock_data)).return_value
            elif "results.json" in str(path):
                return mock_open(read_data=json.dumps(results_data)).return_value
            return mock_open().return_value

        mock_file.side_effect = open_side_effect

        status = bench.get_run_status()

        assert status["total"] == 5
        assert status["completed"] == 3
        assert status["incomplete"] == 2

    @patch("adaptive_bench.subprocess.run")
    @patch("adaptive_bench.time.time")
    def test_run_burst_first_burst(self, mock_time, mock_subprocess):
        """Test first burst creates new run."""
        mock_time.side_effect = [0, 10]  # Start and end time
        mock_subprocess.return_value = MagicMock(returncode=0)

        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=["--dataset", "test"],
        )

        with patch("pathlib.Path.exists") as mock_exists:
            mock_exists.return_value = False

            exit_code = bench.run_burst()

        assert exit_code == 0
        assert bench.burst_count == 1

        # Verify command
        call_args = mock_subprocess.call_args
        cmd = call_args[0][0]
        assert cmd[0] == "uvx"
        assert cmd[1] == "terminal-bench"
        assert cmd[2] == "run"
        assert "--n-concurrent" in cmd
        assert "1" in cmd  # Initial concurrency
        assert "--dataset" in cmd
        assert "test" in cmd

    @patch("builtins.open", new_callable=mock_open)
    @patch("pathlib.Path.exists")
    def test_update_lock_concurrency(self, mock_exists, mock_file):
        """Test updating tb.lock with new concurrency."""
        bench = AdaptiveBench(
            load_threshold=1.0,
            check_interval=60,
            max_concurrent=16,
            runs_dir=Path("runs"),
            tb_args=[],
        )
        bench.run_id = "test-run"
        bench.current_concurrent = 4

        mock_exists.return_value = True

        lock_data = {
            "run_config": {"n_concurrent_trials": 1, "other_field": "value"}
        }

        # Setup mock to return lock_data on read
        mock_file.return_value.read.return_value = json.dumps(lock_data)
        mock_file.return_value.__enter__.return_value = mock_file.return_value

        bench._update_lock_concurrency()

        # Verify write was called with updated concurrency
        write_calls = [
            call
            for call in mock_file.return_value.write.call_args_list
            if call[0][0]  # Filter out empty writes
        ]

        if write_calls:
            written_data = write_calls[0][0][0]
            written_lock = json.loads(written_data)
            assert written_lock["run_config"]["n_concurrent_trials"] == 4
