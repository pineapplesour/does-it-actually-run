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
