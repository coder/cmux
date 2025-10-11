from __future__ import annotations

import io
import os
import shlex
import tarfile
import tempfile
from pathlib import Path
from typing import Any

from terminal_bench.agents.base_agent import AgentResult
from terminal_bench.agents.installed_agents.abstract_installed_agent import (
    AbstractInstalledAgent,
)
from terminal_bench.terminal.models import TerminalCommand
from terminal_bench.terminal.tmux_session import TmuxSession


class CmuxAgent(AbstractInstalledAgent):
    """
    Minimal Terminal-Bench adapter that installs cmux into the task container and
    forwards the benchmark instruction to the cmux headless runner.
    """

    _ARCHIVE_NAME = "cmux-app.tar.gz"
    _RUNNER_NAME = "cmux-run.sh"
    _DEFAULT_TRUNK = "main"
    _DEFAULT_MODEL = "anthropic/claude-sonnet-4-5"

    def __init__(
        self, mode: str | None = None, thinking_level: str | None = None, **kwargs: Any
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

        self._repo_root = repo_root
        self._archive_bytes: bytes | None = None
        self._prepared_container_id: str | None = None
        self._mode = mode.lower() if mode else None
        self._thinking_level = thinking_level.lower() if thinking_level else None

    @staticmethod
    def name() -> str:
        return "cmux"

    @property
    def _env(self) -> dict[str, str]:
        keys = [
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
            "MISTRAL_API_KEY",
            "GOOGLE_API_KEY",
            "OPENROUTER_API_KEY",
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
        ]

        env: dict[str, str] = {}
        for key in keys:
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

        model_value = env.get("CMUX_MODEL")
        if model_value and "/" in model_value and ":" not in model_value:
            provider, model_name = model_value.split("/", 1)
            env["CMUX_MODEL"] = f"{provider}:{model_name}"

        thinking_value = self._thinking_level or env.get("CMUX_THINKING_LEVEL")
        if thinking_value:
            normalized = thinking_value.strip().lower()
            if normalized not in {"off", "low", "medium", "high"}:
                raise ValueError(
                    "CMUX_THINKING_LEVEL must be one of off, low, medium, high"
                )
            env["CMUX_THINKING_LEVEL"] = normalized

        mode_value = self._mode or env.get("CMUX_MODE")
        if mode_value:
            normalized_mode = mode_value.strip().lower()
            if normalized_mode in {"exec", "execute"}:
                env["CMUX_MODE"] = "exec"
            elif normalized_mode == "plan":
                env["CMUX_MODE"] = "plan"
            else:
                raise ValueError("CMUX_MODE must be one of plan, exec, or execute")

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
        if not instruction or not instruction.strip():
            raise ValueError("instruction must be a non-empty string")

        self._prepare_payloads(session)
        return super().perform_task(
            instruction=instruction, session=session, logging_dir=logging_dir
        )

    def _prepare_payloads(self, session: TmuxSession) -> None:
        container_id = getattr(session.container, "id", None)
        if container_id and container_id == self._prepared_container_id:
            return

        archive = self._build_archive()
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                suffix=".tar.gz", delete=False
            ) as temp_file:
                temp_file.write(archive)
                temp_path = Path(temp_file.name)
        except Exception as error:
            raise RuntimeError(
                f"failed to materialize cmux archive: {error}"
            ) from error

        try:
            assert temp_path is not None, "temporary archive path missing"
            session.copy_to_container(
                paths=temp_path,
                container_dir="/installed-agent",
                container_filename=self._ARCHIVE_NAME,
            )
        finally:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)

        runner_path = Path(__file__).with_name(self._RUNNER_NAME)
        if not runner_path.exists():
            raise RuntimeError(f"cmux runner script missing at {runner_path}")

        session.copy_to_container(
            paths=runner_path,
            container_dir="/installed-agent",
            container_filename=self._RUNNER_NAME,
        )

        if container_id:
            self._prepared_container_id = container_id

    def _build_archive(self) -> bytes:
        if self._archive_bytes is not None:
            return self._archive_bytes

        include_paths = [
            "package.json",
            "bun.lock",
            "bunfig.toml",
            "tsconfig.json",
            "tsconfig.main.json",
            "src",
        ]

        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
            for relative in include_paths:
                source_path = self._repo_root / relative
                if not source_path.exists():
                    raise FileNotFoundError(f"Required file {source_path} not found")
                tar.add(
                    source_path,
                    arcname=relative,
                    recursive=True,
                )
        buffer.seek(0)
        self._archive_bytes = buffer.getvalue()
        return self._archive_bytes

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
