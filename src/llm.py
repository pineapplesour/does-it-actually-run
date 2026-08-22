"""LLM backend — Qwen Cloud (Alibaba Model Studio, OpenAI-compatible).

The workspace-scoped host is preferred: it gives higher concurrency and network
isolation, which matters because we fan out N drafts at once.
"""
import re
from openai import OpenAI
from . import config

_client = None


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.QWEN_KEY, base_url=config.QWEN_BASE)
    return _client


def _qwen(system: str, user: str, temperature: float, model: str | None) -> str:
    r = client().chat.completions.create(
        model=model or config.QWEN_MODEL,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
    )
    return r.choices[0].message.content or ""


# Optional local-only backup backend. Absent in this repository; when a
# `_fallback.py` module is present it is used only if Qwen itself errors.
try:  # pragma: no cover
    from ._fallback import ask as _backup
except Exception:  # pragma: no cover
    _backup = None


def ask(system: str, user: str, temperature: float = 0.7, model: str | None = None) -> str:
    if config.BACKEND == "none":
        raise RuntimeError("LLM disabled -> deterministic extraction path")
    try:
        return _qwen(system, user, temperature, model)
    except Exception:
        if _backup is None:
            raise
        return _backup(system, user)


def strip_fence(text: str) -> str:
    t = text.strip()
    m = re.search(r"```(?:\w+)?\n(.*?)```", t, re.S)
    return m.group(1).strip() if m else t


def healthcheck() -> dict:
    try:
        out = ask("You are terse.", "Reply with exactly: OK")
        return {"backend": config.BACKEND, "model": config.QWEN_MODEL,
                "ok": "OK" in out, "detail": out[:60]}
    except Exception as e:
        return {"backend": config.BACKEND, "ok": False,
                "detail": f"{type(e).__name__}: {str(e)[:150]}"}
