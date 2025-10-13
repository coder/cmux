from __future__ import annotations

from pathlib import Path

import pytest

from .cmux_agent import CmuxAgent


@pytest.fixture(autouse=True)
def _clear_cmux_env(monkeypatch: pytest.MonkeyPatch) -> None:
    keys = [
        "CMUX_AGENT_GIT_URL",
        "CMUX_BUN_INSTALL_URL",
        "CMUX_PROJECT_PATH",
        "CMUX_PROJECT_CANDIDATES",
        "CMUX_TRUNK",
        "CMUX_MODEL",
        "CMUX_TIMEOUT_MS",
        "CMUX_THINKING_LEVEL",
        "CMUX_CONFIG_ROOT",
        "CMUX_APP_ROOT",
        "CMUX_WORKSPACE_ID",
        "CMUX_MODE",
    ]
    for key in keys:
        monkeypatch.delenv(key, raising=False)


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def test_env_defaults_are_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CMUX_AGENT_REPO_ROOT", str(_repo_root()))
    agent = CmuxAgent(model_name="anthropic/claude-sonnet-4-5")

    env = agent._env

    assert env["CMUX_MODEL"] == "anthropic:claude-sonnet-4-5"
    assert env["CMUX_THINKING_LEVEL"] == "high"
    assert env["CMUX_MODE"] == "exec"
    assert env["CMUX_PROJECT_CANDIDATES"] == agent._DEFAULT_PROJECT_CANDIDATES


def test_timeout_must_be_numeric(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CMUX_AGENT_REPO_ROOT", str(_repo_root()))
    monkeypatch.setenv("CMUX_TIMEOUT_MS", "not-a-number")

    agent = CmuxAgent()
    with pytest.raises(ValueError):
        _ = agent._env
