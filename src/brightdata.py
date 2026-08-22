"""Bright Data 통합 - 제품 2개를 쓴다.

1) SERP API      : 구글 검색으로 "이미 알려진 설치 실패" 정황을 찾는다.
2) Scraping Browser : 원격 크롬 N개 병렬. README/이슈 수집 + 교차검증.
"""
import asyncio
import re
import httpx
from . import config

REQ = "https://api.brightdata.com/request"


# ---------- 1) SERP API ----------
def serp(query: str, timeout: float = 60.0) -> str:
    r = httpx.post(
        REQ,
        headers={"Authorization": f"Bearer {config.BD_TOKEN}",
                 "Content-Type": "application/json"},
        json={"zone": config.BD_SERP,
              "url": f"https://www.google.com/search?q={httpx.QueryParams({'q': query})['q']}",
              "format": "raw", "data_format": "html"},
        timeout=timeout,
    )
    r.raise_for_status()
    return r.text


def known_issues(repo_slug: str) -> list[str]:
    """검색 결과에서 제목만 추려 '알려진 고장' 정황으로 쓴다."""
    try:
        html = serp(f'"{repo_slug}" installation error OR "does not work" OR ImportError')
    except Exception:
        return []
    titles = re.findall(r"<h3[^>]*>(.*?)</h3>", html, re.S)
    out = []
    for t in titles[:8]:
        clean = re.sub(r"<[^>]+>", "", t).strip()
        if clean:
            out.append(clean[:140])
    return out


# ---------- 2) Scraping Browser (CDP) ----------
async def browse(url: str, selector: str | None = None) -> dict:
    from playwright.async_api import async_playwright
    out = {"url": url, "ok": False, "title": "", "text": "", "error": ""}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.connect_over_cdp(config.BD_CDP, timeout=120_000)
            page = await (browser.contexts[0] if browser.contexts else await browser.new_context()).new_page()
            await page.goto(url, timeout=120_000, wait_until="domcontentloaded")
            out["title"] = await page.title()
            body = await page.inner_text(selector or "body")
            out["text"] = body[:20000]
            out["ok"] = True
            await browser.close()
    except Exception as e:
        out["error"] = f"{type(e).__name__}: {str(e)[:300]}"
    return out


async def browse_many(urls: list[str]) -> list[dict]:
    """원격 크롬 N개 동시 기동. 이게 '브라우저 4개로 씹고 뜯는' 그 부분."""
    return await asyncio.gather(*[browse(u) for u in urls])


def slug_of(repo_url: str) -> str:
    s = repo_url.rstrip("/").replace("https://", "").replace("http://", "")
    s = s.replace("github.com/", "").strip("/")
    parts = s.split("/")
    if len(parts) < 2:
        raise ValueError(f"레포 주소가 이상하다: {repo_url}")
    return f"{parts[0]}/{parts[1]}"


def github_readme(repo_url: str) -> str:
    """Scraping Browser 로 README 원문 확보."""
    slug = slug_of(repo_url)
    for branch in ("main", "master"):
        for name in ("README.md", "readme.md"):
            res = asyncio.run(browse(
                f"https://raw.githubusercontent.com/{slug}/{branch}/{name}"))
            if res["ok"] and len(res["text"]) > 200 and "404" not in res["text"][:60]:
                return res["text"]
    res = asyncio.run(browse(f"https://github.com/{slug}"))
    if res["ok"]:
        return res["text"]
    raise RuntimeError(f"README 수집 실패: {res['error']}")
