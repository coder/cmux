from __future__ import annotations

import io
import tarfile
import tempfile
from pathlib import Path
from typing import Iterable

from terminal_bench.terminal.tmux_session import TmuxSession


def build_app_archive(repo_root: Path, include_paths: Iterable[str]) -> bytes:
    """Pack the cmux workspace into a gzipped tarball."""

    if not repo_root or not repo_root.exists():
        raise FileNotFoundError(f"cmux repo root {repo_root} not found")

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for relative_path in include_paths:
            source = repo_root / relative_path
            if not source.exists():
                raise FileNotFoundError(f"Required file {source} missing")
            archive.add(source, arcname=relative_path, recursive=True)

    buffer.seek(0)
    return buffer.getvalue()


def stage_payload(
    session: TmuxSession,
    archive_bytes: bytes,
    archive_name: str,
    runner_path: Path,
) -> None:
    """Copy the cmux bundle and runner into the task container."""

    if not archive_bytes:
        raise ValueError("archive_bytes must be non-empty")
    if not runner_path or not runner_path.is_file():
        raise FileNotFoundError(f"cmux runner missing at {runner_path}")

    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as temp_file:
        temp_file.write(archive_bytes)
        temp_path = Path(temp_file.name)

    try:
        session.copy_to_container(
            paths=temp_path,
            container_dir="/installed-agent",
            container_filename=archive_name,
        )
    finally:
        temp_path.unlink(missing_ok=True)

    session.copy_to_container(
        paths=runner_path,
        container_dir="/installed-agent",
        container_filename=runner_path.name,
    )
