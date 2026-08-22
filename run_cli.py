#!/usr/bin/env python3
"""CLI 데모: python run_cli.py https://github.com/owner/repo"""
import sys, json
from src import agent, config

if __name__ == "__main__":
    miss = config.missing()
    if miss:
        print("!! 비어있는 키:", ", ".join(miss))
    repo = sys.argv[1] if len(sys.argv) > 1 else "https://github.com/psf/requests"
    ledger = agent.verify(repo)
    print("\n=== 원장 ===")
    for r in ledger.rows:
        print(f"  {r.kind:8s} {r.label:16s} {r.verdict:6s} exit={r.exit_code} {r.seconds}s")
    print("\n=== 결정적 합성 ===")
    print(json.dumps(ledger.synthesize(), ensure_ascii=False, indent=2))
    print("\n저장:", ledger.save())
