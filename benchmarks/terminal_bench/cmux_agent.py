from __future__ import annotations

import os
import shlex
from pathlib import Path
from typing import Any, Sequence

from terminal_bench.agents.base_agent import AgentResult
from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)
from terminal_bench.terminal.models import TerminalCommand
from terminal_bench.terminal.tmux_session import TmuxSession

from .cmux_payload import build_app_archive, stage_payload


class CmuxAgent(AbstractInstalledAgent):
    """
    Minimal Terminal-Bench adapter that installs cmux into the task container and
    forwards the benchmark instruction to the cmux headless runner.
    """

    _ARCHIVE_NAME = "cmux-app.tar.gz"
    _RUNNER_NAME = "cmux-run.sh"
    _DEFAULT_TRUNK = "main"
    _DEFAULT_MODEL = "anthropic:claude-sonnet-4-5"
    _DEFAULT_PROJECT_CANDIDATES = "/workspace:/app:/workspaces:/root/project"
    _INCLUDE_PATHS: Sequence[str] = (
        "package.json",
        "bun.lock",
        "bunfig.toml",
        "tsconfig.json",
        "tsconfig.main.json",
        "src",
        "dist",
    )

    _PROVIDER_ENV_KEYS: Sequence[str] = (
        "ANTHROPIC_API_KEY",
        "ANTHROPIC_BASE_URL",
        "OPENAI_API_KEY",
        "OPENAI_BASE_URL",
        "OPENAI_API_BASE",
        "OPENAI_ORG_ID",
        "AZURE_OPENAI_API_KEY",
        "AZURE_OPENAI_ENDPOINT",
        "AZURE_OPENAI_DEPLOYMENT",
        "AZURE_OPENAI_API_VERSION",
    )

    _CONFIG_ENV_KEYS: Sequence[str] = (
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
    )

    def __init__(
        self,
        model_name: str = "anthropic:claude-sonnet-4-5",
        mode: str | None = None,
        thinking_level: str | None = None,
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        repo_root_env = os.environ.get("CMUX_AGENT_REPO_ROOT")
        repo_root = (
            Path(repo_root_env).resolve()
            if repo_root_env
            else Path(__file__).resolve().parents[2]
        )
        if not repo_root.exists():
            raise RuntimeError(f"cmux repo root {repo_root} does not exist")

        runner_path = Path(__file__).with_name(self._RUNNER_NAME)
        if not runner_path.is_file():
            raise RuntimeError(f"cmux runner script missing at {runner_path}")

        self._runner_path = runner_path
        self._repo_root = repo_root
        self._archive_bytes: bytes | None = None
        self._staged_container_id: str | None = None
        self._mode = mode.lower() if mode else None
        self._thinking_level = thinking_level.lower() if thinking_level else None
        self._model_name = (model_name or "").strip()

    @staticmethod
    def name() -> str:
        return "cmux"

    @property
    def _env(self) -> dict[str, str]:
        env: dict[str, str] = {}

        for key in (*self._PROVIDER_ENV_KEYS, *self._CONFIG_ENV_KEYS):
            value = os.environ.get(key)
            if value:
                env[key] = value

        env.setdefault("CMUX_TRUNK", self._DEFAULT_TRUNK)
        env.setdefault("CMUX_MODEL", self._DEFAULT_MODEL)
        env.setdefault("CMUX_CONFIG_ROOT", "/root/.cmux")
        env.setdefault("CMUX_APP_ROOT", "/opt/cmux-app")
        env.setdefault("CMUX_WORKSPACE_ID", "cmux-bench")
        env.setdefault("CMUX_THINKING_LEVEL", "high")
        env.setdefault("CMUX_MODE", "exec")
        env.setdefault("CMUX_PROJECT_CANDIDATES", self._DEFAULT_PROJECT_CANDIDATES)

        model_value = self._model_name or env["CMUX_MODEL"]
        model_value = model_value.strip()
        if not model_value:
            raise ValueError("CMUX_MODEL must be a non-empty string")
        if "/" in model_value and ":" not in model_value:
            provider, model_name = model_value.split("/", 1)
            model_value = f"{provider}:{model_name}"
        env["CMUX_MODEL"] = model_value

        thinking_value = self._thinking_level or env["CMUX_THINKING_LEVEL"]
        normalized_thinking = thinking_value.strip().lower()
        if normalized_thinking not in {"off", "low", "medium", "high"}:
            raise ValueError(
                "CMUX_THINKING_LEVEL must be one of off, low, medium, high"
            )
        env["CMUX_THINKING_LEVEL"] = normalized_thinking

        mode_value = self._mode or env["CMUX_MODE"]
        normalized_mode = mode_value.strip().lower()
        if normalized_mode in {"exec", "execute"}:
            env["CMUX_MODE"] = "exec"
        elif normalized_mode == "plan":
            env["CMUX_MODE"] = "plan"
        else:
            raise ValueError("CMUX_MODE must be one of plan, exec, or execute")

        # These env vars are all set with defaults above, no need to validate
        for key in (
            "CMUX_CONFIG_ROOT",
            "CMUX_APP_ROOT",
            "CMUX_WORKSPACE_ID",
            "CMUX_PROJECT_CANDIDATES",
        ):
            env[key] = env[key].strip()

        if timeout_value := env.get("CMUX_TIMEOUT_MS"):
            if not timeout_value.strip().isdigit():
                raise ValueError("CMUX_TIMEOUT_MS must be an integer")

        if project_path := env.get("CMUX_PROJECT_PATH"):
            if not project_path.strip():
                raise ValueError("CMUX_PROJECT_PATH must be non-empty when provided")

        return env

    @property
    def _install_agent_script_path(self) -> Path:
        return self._get_templated_script_path("cmux_setup.sh.j2")

    def perform_task(
        self,
        instruction: str,
        session: TmuxSession,
        logging_dir=None,
    ) -> AgentResult:
        if not instruction.strip():
            raise ValueError("instruction must be a non-empty string")
        self._ensure_payload_staged(session)
        return super().perform_task(instruction, session, logging_dir)

    def _ensure_payload_staged(self, session: TmuxSession) -> None:
        container_id = getattr(session.container, "id", None)
        if container_id == self._staged_container_id:
            return

        if not self._archive_bytes:
            self._archive_bytes = build_app_archive(
                self._repo_root, self._INCLUDE_PATHS
            )

        stage_payload(
            session, self._archive_bytes, self._ARCHIVE_NAME, self._runner_path
        )
        self._staged_container_id = container_id

    def _run_agent_commands(self, instruction: str) -> list[TerminalCommand]:
        escaped = shlex.quote(instruction)
        command = f"bash /installed-agent/{self._RUNNER_NAME} {escaped}"
        return [
            TerminalCommand(
                command=command,
                min_timeout_sec=0.0,
                max_timeout_sec=float("inf"),
                block=True,
                append_enter=True,
            )
        ]
