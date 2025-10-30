"""Tests for task timeout configuration."""

from task_timeouts import (
    FAST_TIMEOUT,
    NORMAL_TIMEOUT,
    SLOW_TIMEOUT,
    VERY_SLOW_TIMEOUT,
    get_timeout_for_task,
    get_max_timeout_for_tasks,
)


def test_fast_tasks():
    """Fast tasks should get 5 minute timeout."""
    assert get_timeout_for_task("hello-world") == FAST_TIMEOUT
    assert get_timeout_for_task("simple-web-scraper") == FAST_TIMEOUT
    assert get_timeout_for_task("fix-permissions") == FAST_TIMEOUT


def test_normal_tasks():
    """Normal tasks should get default 15 minute timeout."""
    # Unknown tasks default to NORMAL
    assert get_timeout_for_task("unknown-task") == NORMAL_TIMEOUT
    assert get_timeout_for_task("some-random-task") == NORMAL_TIMEOUT


def test_slow_tasks():
    """Slow tasks should get 30 minute timeout."""
    assert get_timeout_for_task("count-dataset-tokens") == SLOW_TIMEOUT
    assert get_timeout_for_task("qemu-startup") == SLOW_TIMEOUT
    assert get_timeout_for_task("path-tracing") == SLOW_TIMEOUT


def test_very_slow_tasks():
    """Very slow tasks should get 60 minute timeout."""
    assert get_timeout_for_task("build-linux-kernel-qemu") == VERY_SLOW_TIMEOUT
    assert get_timeout_for_task("build-initramfs-qemu") == VERY_SLOW_TIMEOUT


def test_max_timeout_for_tasks():
    """Should return maximum timeout needed for a set of tasks."""
    # Mix of fast and slow
    tasks = ["hello-world", "count-dataset-tokens"]
    assert get_max_timeout_for_tasks(tasks) == SLOW_TIMEOUT

    # Mix of fast, slow, and very slow
    tasks = ["hello-world", "count-dataset-tokens", "build-linux-kernel-qemu"]
    assert get_max_timeout_for_tasks(tasks) == VERY_SLOW_TIMEOUT

    # All fast
    tasks = ["hello-world", "simple-web-scraper"]
    assert get_max_timeout_for_tasks(tasks) == FAST_TIMEOUT

    # Empty list should return conservative default
    assert get_max_timeout_for_tasks([]) == VERY_SLOW_TIMEOUT


def test_timeout_values():
    """Verify timeout constants are reasonable."""
    assert FAST_TIMEOUT == 300  # 5 minutes
    assert NORMAL_TIMEOUT == 900  # 15 minutes
    assert SLOW_TIMEOUT == 1800  # 30 minutes
    assert VERY_SLOW_TIMEOUT == 3600  # 60 minutes

    # Ensure proper ordering
    assert FAST_TIMEOUT < NORMAL_TIMEOUT < SLOW_TIMEOUT < VERY_SLOW_TIMEOUT
