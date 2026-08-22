"""Nosana - 탈중앙 GPU. 검증 워커를 어느 GPU 위에서 돌릴지 고르고 잡을 건다."""
import httpx
from . import config

H = lambda: {"Authorization": f"Bearer {config.NOSANA_KEY}",
             "Content-Type": "application/json"}


def _get(path: str, timeout: float = 30.0):
    r = httpx.get(f"{config.NOSANA_URL}{path}", headers=H(), timeout=timeout)
    r.raise_for_status()
    return r.json()


def available() -> bool:
    return bool(config.NOSANA_KEY)


def key_status() -> dict:
    try:
        d = _get("/api-keys")
        k = (d.get("keys") or [{}])[0]
        return {"ok": k.get("status") == "active", "status": k.get("status"),
                "last_used": k.get("lastUsedAt")}
    except Exception as e:
        return {"ok": False, "status": f"{type(e).__name__}: {str(e)[:150]}"}


def markets(limit: int = 5) -> list[dict]:
    """가용 GPU 마켓. 검증 워커를 어디에 태울지 실제로 고른다."""
    try:
        rows = _get("/markets")
    except Exception:
        return []
    out = []
    for m in rows:
        out.append({
            "slug": m.get("slug"),
            "name": m.get("name"),
            "type": m.get("type"),
            "usd_per_hour": m.get("usd_reward_per_hour"),
            "address": m.get("address"),
        })
    out.sort(key=lambda x: (x["usd_per_hour"] or 999))
    return out[:limit]


def pick_market(prefer: str = "nvidia") -> dict | None:
    ms = markets(limit=50)
    for m in ms:
        if prefer in (m["slug"] or ""):
            return m
    return ms[0] if ms else None


def recent_jobs(n: int = 3) -> list[dict]:
    try:
        d = _get("/jobs")
        return [{"id": j.get("id"), "market": (j.get("market") or "")[:12],
                 "state": j.get("state")} for j in (d.get("jobs") or [])[:n]]
    except Exception:
        return []


def post_job(ipfs_hash: str, market: str, timeout_sec: int = 600) -> dict:
    """크레딧으로 잡 생성. ipfs_hash 는 잡 정의(JSON)를 올린 해시."""
    try:
        r = httpx.post(f"{config.NOSANA_URL}/jobs/create-with-credits",
                       headers=H(),
                       json={"ipfsHash": ipfs_hash, "market": market,
                             "timeout": timeout_sec},
                       timeout=60.0)
        return {"ok": r.status_code < 400, "status": r.status_code,
                "body": r.text[:1000]}
    except Exception as e:
        return {"ok": False, "status": 0, "body": f"{type(e).__name__}: {str(e)[:200]}"}


def gpu_plan() -> dict:
    """데모용: GPU 백엔드 실상태를 원장에 남긴다."""
    ks = key_status()
    m = pick_market()
    return {"key_active": ks["ok"], "market": m, "recent_jobs": recent_jobs()}
