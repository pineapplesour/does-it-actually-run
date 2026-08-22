"""LLM 백엔드.

기본 = Qwen Cloud (Alibaba Model Studio, OpenAI 호환).
LLM_BACKEND=claude 로 두면 로컬 구독 CLI 로 파이프라인만 먼저 디버깅할 수 있다.
Qwen 활성화되면 .env 한 줄 바꿔서 되돌린다.
"""
import json
import subprocess
from openai import OpenAI
from . import config

_client = None


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=config.QWEN_KEY, base_url=config.QWEN_BASE)
    return _client


def _via_qwen(system: str, user: str, temperature: float, model: str | None) -> str:
    r = client().chat.completions.create(
        model=model or config.QWEN_MODEL,
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
        temperature=temperature,
    )
    return r.choices[0].message.content or ""


def _via_claude(system: str, user: str) -> str:
    """개발용 폴백. 제출 데모에서는 쓰지 않는다."""
    p = subprocess.run(
        ["claude", "-p", "--model", "sonnet", "--append-system-prompt", system],
        input=user, capture_output=True, text=True, timeout=300,
    )
    return p.stdout.strip()


def ask(system: str, user: str, temperature: float = 0.7, model: str | None = None) -> str:
    if config.BACKEND == "none":
        raise RuntimeError("LLM 비활성 (Qwen 승인 대기) -> 결정적 추출 경로 사용")
    if config.BACKEND == "claude":
        return _via_claude(system, user)
    return _via_qwen(system, user, temperature, model)


def ask_json(system: str, user: str, temperature: float = 0.7) -> dict:
    raw = ask(system + "\n\nJSON 객체 하나만 출력해라. 설명 금지.", user, temperature)
    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.split("```")[1]
        if txt.startswith("json"):
            txt = txt[4:]
    try:
        return json.loads(txt.strip())
    except Exception:
        s, e = txt.find("{"), txt.rfind("}")
        if s >= 0 and e > s:
            return json.loads(txt[s:e + 1])
        raise


def healthcheck() -> dict:
    """부스에서 상태 보여줄 때 쓴다."""
    if config.BACKEND == "claude":
        return {"backend": "claude(dev)", "ok": True, "detail": "개발용 폴백"}
    try:
        out = _via_qwen("You are terse.", "reply with exactly: OK", 0.0, None)
        return {"backend": f"qwen:{config.QWEN_MODEL}", "ok": True, "detail": out[:40]}
    except Exception as e:
        return {"backend": f"qwen:{config.QWEN_MODEL}", "ok": False,
                "detail": f"{type(e).__name__}: {str(e)[:200]}"}
