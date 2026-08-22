"""Daytona - 격리 샌드박스에서 실제로 코드를 실행한다. 이 프로젝트의 객관적 게이트."""
import base64
import time
from . import config

_dt = None


def daytona():
    global _dt
    if _dt is None:
        from daytona import Daytona, DaytonaConfig
        _dt = Daytona(DaytonaConfig(api_key=config.DAYTONA_KEY))
    return _dt


def run_script(script: str, timeout: int = 300) -> dict:
    """샌드박스 하나 띄우고 스크립트 실행 -> 영수증 반환. 예외를 밖으로 던지지 않는다."""
    receipt = {"exit_code": None, "stdout": "", "seconds": 0.0,
               "sandbox_id": None, "error": ""}
    t0 = time.time()
    sb = None
    try:
        sb = daytona().create()
        receipt["sandbox_id"] = getattr(sb, "id", None)
        b64 = base64.b64encode(script.encode()).decode()
        # 따옴표/개행 이스케이프 문제를 base64 로 완전히 우회한다.
        cmd = f"echo {b64} | base64 -d > /tmp/run.sh && bash /tmp/run.sh 2>&1"
        res = sb.process.exec(cmd, timeout=timeout)
        receipt["exit_code"] = getattr(res, "exit_code", None)
        receipt["stdout"] = (getattr(res, "result", "") or "")[-8000:]
    except Exception as e:
        receipt["error"] = f"{type(e).__name__}: {str(e)[:400]}"
    finally:
        receipt["seconds"] = round(time.time() - t0, 1)
        if sb is not None:
            try:
                sb.delete()
            except Exception:
                pass
    return receipt


def healthcheck() -> dict:
    r = run_script("set -e\necho SANDBOX_UP\n")
    return {"ok": r["exit_code"] == 0 and "SANDBOX_UP" in r["stdout"],
            "seconds": r["seconds"], "detail": (r["stdout"] or r["error"])[:120]}


ENV_PROBE = r'''
echo "user=$(whoami)"
echo "uid=$(id -u)"
echo "sudo=$(sudo -n true 2>/dev/null && echo passwordless || echo unavailable)"
echo "os=$(. /etc/os-release; echo $PRETTY_NAME)"
echo "python=$(python3 -V 2>&1)"
echo "pip=$(python3 -m pip -V 2>&1 | cut -d' ' -f1-2)"
echo "git=$(git --version 2>&1)"
echo "node=$(node -v 2>/dev/null || echo absent)"
echo "home=$HOME writable=$(touch $HOME/.w 2>/dev/null && echo yes || echo no)"
echo "pypi_reachable=$(curl -sS -o /dev/null -w %{http_code} https://pypi.org/simple/ --max-time 15 2>/dev/null || echo blocked)"
echo "github_reachable=$(curl -sS -o /dev/null -w %{http_code} https://github.com --max-time 15 2>/dev/null || echo blocked)"
echo "arbitrary_http_egress=$(curl -sS -o /dev/null -w %{http_code} https://httpbin.org/get --max-time 15 2>/dev/null || echo blocked)"
'''

_env_cache = None


def probe_env(force: bool = False) -> dict:
    """샌드박스 환경을 추측하지 않고 실제로 측정한다.

    이 프로젝트의 원칙이 그대로 적용되는 지점이다. 드래프트 프롬프트에
    측정값을 주입해야 에이전트가 존재하지 않는 권한을 가정하지 않는다.
    """
    global _env_cache
    if _env_cache is not None and not force:
        return _env_cache
    r = run_script(ENV_PROBE, timeout=120)
    facts = {}
    for line in (r.get("stdout") or "").splitlines():
        if "=" in line:
            k, _, v = line.partition("=")
            facts[k.strip()] = v.strip()
    facts["_ok"] = r.get("exit_code") == 0
    _env_cache = facts
    return facts


def env_brief(facts: dict) -> str:
    """드래프트 프롬프트에 넣을 사실 블록."""
    order = ["os", "user", "uid", "sudo", "python", "pip", "git", "node",
             "home", "writable", "pypi_reachable", "github_reachable",
             "arbitrary_http_egress"]
    lines = [f"- {k}: {facts[k]}" for k in order if k in facts]
    return "\n".join(lines)


from contextlib import contextmanager


@contextmanager
def open_sandbox(clone: str | None = None, root: str = "/tmp/target"):
    """정찰용으로 살아있는 샌드박스를 연다. 필요하면 저장소를 clone 해 둔다."""
    sb = daytona().create()
    try:
        if clone:
            sb.process.exec(
                f"git clone --depth 1 {clone} {root} 2>&1 | tail -2", timeout=300)
        yield sb
    finally:
        try:
            sb.delete()
        except Exception:
            pass
