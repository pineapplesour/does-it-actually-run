"""LLM 백엔드 스위치.

qwen  : Qwen Cloud (OpenAI 호환). 계정 쿼터 열리면 이걸 쓴다.
codex : 로컬 Codex 하네스. 에이전트 루트를 실제로 구동하는 현재 기본값.
none  : LLM 없이 결정적 추출 경로만.
"""
import os
import re
import subprocess
from . import config

CODEX_HOME = os.path.expanduser(os.getenv("CODEX_HOME_DIR", "~/.codex-7"))


def _via_codex(system: str, user: str, timeout: int = 600,
                effort: str = "high", model: str = "gpt-5.6-luna") -> str:
    prompt = f"{system}\n\n---\n\n{user}"
    p = subprocess.run(
        ["codex", "exec", "--skip-git-repo-check",
         "-m", model, "-c", f"model_reasoning_effort={effort}", prompt],
        env={**os.environ, "CODEX_HOME": CODEX_HOME},
        capture_output=True, text=True, timeout=timeout,
    )
    return _clean_codex(p.stdout)


def _clean_codex(out: str) -> str:
    """codex exec 는 헤더+트랜스크립트+최종답변을 함께 뱉는다. 최종답변만 뽑는다."""
    lines = out.splitlines()
    # 'tokens used' / 숫자 다음에 오는 블록이 최종 답변이다.
    for i in range(len(lines) - 1, -1, -1):
        if lines[i].strip() == "tokens used":
            tail = lines[i + 2:] if i + 2 <= len(lines) else []
            body = "\n".join(tail).strip()
            if body:
                return body
    # 폴백: 마지막 'codex' 마커 이후 ~ 'tokens used' 이전
    idx = max((i for i, l in enumerate(lines) if l.strip() == "codex"), default=-1)
    if idx >= 0:
        seg = []
        for l in lines[idx + 1:]:
            if l.strip() == "tokens used":
                break
            seg.append(l)
        return "\n".join(seg).strip()
    return out.strip()


def _via_qwen(system: str, user: str, temperature: float, model: str | None) -> str:
    from openai import OpenAI
    c = OpenAI(api_key=config.QWEN_KEY, base_url=config.QWEN_BASE)
    r = c.chat.completions.create(
        model=model or config.QWEN_MODEL,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
    )
    return r.choices[0].message.content or ""


def ask(system: str, user: str, temperature: float = 0.7, model: str | None = None) -> str:
    b = config.BACKEND
    if b == "none":
        raise RuntimeError("LLM 비활성 -> 결정적 추출 경로 사용")
    if b == "codex":
        return _via_codex(system, user,
                          effort=os.getenv("CODEX_EFFORT", "high"),
                          model=os.getenv("CODEX_MODEL", "gpt-5.6-luna"))
    return _via_qwen(system, user, temperature, model)


def strip_fence(text: str, langs=("bash", "sh", "json")) -> str:
    t = text.strip()
    m = re.search(r"```(?:\w+)?\n(.*?)```", t, re.S)
    if m:
        return m.group(1).strip()
    return t


def healthcheck() -> dict:
    b = config.BACKEND
    try:
        if b == "none":
            return {"backend": "none", "ok": True, "detail": "결정적 경로만 사용"}
        out = ask("You are terse.", "Reply with exactly: OK")
        return {"backend": b, "ok": "OK" in out, "detail": out[:60]}
    except Exception as e:
        return {"backend": b, "ok": False, "detail": f"{type(e).__name__}: {str(e)[:150]}"}
