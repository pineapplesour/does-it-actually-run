"""원장(Ledger) + 결정적 합성.

핵심 원칙: 승자를 LLM 의견으로 뽑지 않는다. 실행 영수증으로 코드가 결정한다.
"""
import json
import os
from dataclasses import dataclass, asdict, field


@dataclass
class Row:
    kind: str            # draft | browser | gpu
    label: str           # 워커 이름
    verdict: str         # PASS | FAIL | ERROR | INFO
    exit_code: int | None = None
    seconds: float = 0.0
    evidence: str = ""   # 로그 꼬리 / 발췌
    meta: dict = field(default_factory=dict)


class Ledger:
    def __init__(self, target: str):
        self.target = target
        self.rows: list[Row] = []

    def add(self, row: Row):
        self.rows.append(row)
        return row

    # ---- 결정적 합성: 여기에 LLM 이 개입하지 않는다 ----
    def synthesize(self) -> dict:
        drafts = [r for r in self.rows if r.kind == "draft"]
        passed = [r for r in drafts if r.verdict == "PASS"]
        checks = [r for r in self.rows if r.kind == "browser"]

        if passed:
            # 동률이면 더 빠른 쪽. 사람 취향 아니고 측정값.
            winner = min(passed, key=lambda r: r.seconds)
            status = "REPRODUCIBLE"
        else:
            winner = None
            status = "BROKEN"

        return {
            "target": self.target,
            "status": status,
            "drafts_total": len(drafts),
            "drafts_passed": len(passed),
            "winner": winner.label if winner else None,
            "winner_seconds": winner.seconds if winner else None,
            "cross_checks": len(checks),
            "cross_check_hits": sum(1 for c in checks if c.verdict == "PASS"),
            # 신뢰도 = 실행 성공 비율. 모델 자기신고 confidence 아님.
            "confidence": round(len(passed) / len(drafts), 2) if drafts else 0.0,
        }

    def table(self) -> list[dict]:
        return [asdict(r) for r in self.rows]

    def save(self, path: str = "runs"):
        os.makedirs(path, exist_ok=True)
        safe = self.target.replace("/", "_").replace(":", "")[-60:]
        fp = os.path.join(path, f"{safe}.json")
        with open(fp, "w") as f:
            json.dump({"summary": self.synthesize(), "rows": self.table()},
                      f, ensure_ascii=False, indent=2)
        return fp
