"""보고서 렌더러 - 한국어/영어. 결정적 템플릿(LLM 의존 없음)."""

T = {
    "ko": {
        "title": "재현성 검증 보고서",
        "target": "대상", "verdict": "판정", "confidence": "신뢰도",
        "REPRODUCIBLE": "재현됨", "BROKEN": "재현 실패",
        "install": "1단계 · 설치 검증", "ui": "2단계 · 동작 검증",
        "winner": "승자 스크립트", "elapsed": "소요",
        "route": "루트", "status": "상태", "note": "비고",
        "passed": "통과", "of": "중",
        "PASS": "통과", "FAIL": "실패", "ERROR": "오류", "INFO": "정보",
        "Verified": "검증됨", "Failed": "실패", "Not exercised": "미실행", "Blocked": "차단됨",
        "gpu": "GPU 워커", "evidence": "증거", "sandbox": "샌드박스",
        "summary_ok": "설치 스크립트 {p}/{t}벌이 격리 샌드박스에서 실제로 통과했다. 판정은 모델 의견이 아니라 종료 코드다.",
        "summary_no": "어떤 설치 경로도 격리 샌드박스에서 통과하지 못했다. 이 저장소는 README대로 재현되지 않는다.",
        "honest": "미실행 루트는 통과로 세지 않는다. 아래 상태는 실제 수집된 증거만 반영한다.",
    },
    "en": {
        "title": "Reproducibility Verification Report",
        "target": "Target", "verdict": "Verdict", "confidence": "Confidence",
        "REPRODUCIBLE": "Reproducible", "BROKEN": "Not reproducible",
        "install": "Stage 1 · Install verification", "ui": "Stage 2 · Runtime verification",
        "winner": "Winning script", "elapsed": "Elapsed",
        "route": "Route", "status": "Status", "note": "Note",
        "passed": "passed", "of": "of",
        "PASS": "PASS", "FAIL": "FAIL", "ERROR": "ERROR", "INFO": "INFO",
        "Verified": "Verified", "Failed": "Failed", "Not exercised": "Not exercised", "Blocked": "Blocked",
        "gpu": "GPU worker", "evidence": "Evidence", "sandbox": "Sandbox",
        "summary_ok": "{p} of {t} install scripts actually passed inside isolated sandboxes. The verdict is an exit code, not a model's opinion.",
        "summary_no": "No install path passed inside an isolated sandbox. This repository does not reproduce from its README.",
        "honest": "Routes that did not run are not counted as passing. The states below reflect only evidence actually collected.",
    },
}


def t(lang: str, key: str) -> str:
    return T.get(lang, T["en"]).get(key, key)


def render_markdown(ledger_summary: dict, rows: list[dict], lang: str = "ko",
                    routes: dict | None = None) -> str:
    L = T.get(lang, T["en"])
    s = ledger_summary
    ok = s["status"] == "REPRODUCIBLE"

    out = [f"# {L['title']}", ""]
    out.append(f"**{L['target']}**: `{s['target']}`  ")
    badge = "✅" if ok else "❌"
    out.append(f"**{L['verdict']}**: {badge} {L[s['status']]}  ")
    out.append(f"**{L['confidence']}**: {s['confidence']}")
    out.append("")
    out.append(L["summary_ok"].format(p=s["drafts_passed"], t=s["drafts_total"])
               if ok else L["summary_no"])
    out.append("")

    out.append(f"## {L['install']}")
    out.append("")
    out.append(f"| {L['sandbox']} | {L['status']} | exit | {L['elapsed']} |")
    out.append("|---|---|---|---|")
    for r in rows:
        if r["kind"] != "draft":
            continue
        out.append(f"| `{r['label']}` | {L.get(r['verdict'], r['verdict'])} "
                   f"| {r['exit_code']} | {r['seconds']}s |")
    out.append("")
    if s.get("winner"):
        out.append(f"**{L['winner']}**: `{s['winner']}` ({s['winner_seconds']}s)")
        out.append("")

    gpu = [r for r in rows if r["kind"] == "gpu"]
    if gpu:
        out.append(f"**{L['gpu']}**: {gpu[0]['evidence']}")
        out.append("")

    if routes:
        out.append(f"## {L['ui']}")
        out.append("")
        out.append(f"| {L['route']} | {L['status']} |")
        out.append("|---|---|")
        for name, st in routes.items():
            out.append(f"| `{name}` | {L.get(st, st)} |")
        out.append("")
        out.append(f"> {L['honest']}")
        out.append("")

    return "\n".join(out)
