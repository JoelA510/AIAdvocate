"""Shared .env loader for the standalone ops scripts in this directory.

Loads variables from the repo-root .env and supabase/.env without overriding
values already present in the environment. Mirrors scripts/loadEnv.mjs for the
JS scripts, and no-ops gracefully when python-dotenv is not installed.
"""
from pathlib import Path

_ROOT_DIR = Path(__file__).resolve().parent.parent


def load_project_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover
        return
    load_dotenv(_ROOT_DIR / ".env")
    load_dotenv(_ROOT_DIR / "supabase" / ".env")
    load_dotenv()
