"""검증 에이전트 오케스트레이터.

분해 -> 독립검증(N 병렬) -> 원장 -> 결정적 합성 -> 재시도 게이트
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor

from . import brightdata, daytona_runner, fallback, llm, nosana
from .ledger import Ledger, Row

DRAFT_SYS = """너는 리눅스 재현 엔지니어다. 주어진 README 만 보고 이 저장소를 처음부터 설치하고
동작을 확인하는 bash 스크립트를 쓴다.

규칙:
- 실행 환경은 아래 "측정된 환경"에 적힌 그대로다. 추측하지 마라.
  root 가 아닐 수 있다. 그 경우 시스템 패키지 설치는 sudo 를 붙여라
  (sudo 가 passwordless 로 표시된 경우에만). sudo 가 unavailable 이면
  apt 를 쓰지 말고 pip / venv / 사용자 홈 경로로 우회해라.
- 비root 라는 이유로 중단하지 마라. 주어진 권한 안에서 끝까지 시도해라.
- 대화형 프롬프트 금지 (-y, DEBIAN_FRONTEND=noninteractive).
- 마지막에 반드시 실제 동작 확인 한 줄을 넣어라 (import, --help, 테스트 등).
- 검증에 외부 네트워크를 쓰지 마라. arbitrary_http_egress 가 blocked 이거나
  200 이 아니면 httpbin.org 같은 외부 엔드포인트 호출은 반드시 실패한다.
  설치 자체(pypi/github)는 되더라도 임의 HTTP 는 막혀 있다. 검증은 폐쇄적으로,
  즉 import / --version / 로컬 실행으로 끝내라.
- set -e 로 시작해서 실패하면 즉시 죽게 해라. 조용히 성공한 척하면 안 된다.
- 성공 시 마지막 줄에 정확히 REPRO_OK 를 출력해라.
- 설명·마크다운 금지. 순수 bash 만.
"""

STRATEGIES = [
    ("literal",  "README 에 적힌 명령을 문자 그대로, 순서대로 따라라. 창의성 금지."),
    ("pragmatic","README 가 빠뜨린 시스템 의존성(git, build-essential, python3-pip 등)을 보충해서 실용적으로 짜라."),
    ("minimal",  "가장 짧은 경로로 핵심 기능 하나만 돌려서 증명해라. 선택적 단계는 전부 건너뛰어라."),
]


def _draft(readme: str, repo: str, name: str, hint: str, feedback: str = "",
           env_facts: str = "") -> str:
    user = f"저장소: {repo}\n\n전략: {hint}\n"
    if env_facts:
        user += f"\n측정된 환경 (실제 샌드박스에서 관측한 값):\n{env_facts}\n"
    if feedback:
        user += f"\n이전 시도가 실패했다. 에러 로그:\n---\n{feedback[-3000:]}\n---\n이걸 고쳐라.\n"
    user += f"\nREADME:\n---\n{readme[:12000]}\n---"
    script = llm.ask(DRAFT_SYS, user, temperature=0.8)
    return llm.strip_fence(script)


def _verdict(receipt: dict) -> str:
    if receipt.get("error"):
        return "ERROR"
    if receipt.get("exit_code") == 0 and "REPRO_OK" in (receipt.get("stdout") or ""):
        return "PASS"
    return "FAIL"


async def _cross_check(repo: str, ledger: Ledger):
    """Scraping Browser 로 원격 크롬 여러 개를 동시에 띄워 정황 증거를 모은다."""
    slug = repo.replace("https://github.com/", "").strip("/")
    targets = [
        ("issues",  f"https://github.com/{slug}/issues?q=is%3Aissue+install+error"),
        ("actions", f"https://github.com/{slug}/actions"),
        ("repo",    f"https://github.com/{slug}"),
    ]
    results = await asyncio.gather(*[brightdata.browse(u) for _, u in targets])
    for (label, url), res in zip(targets, results):
        ledger.add(Row(
            kind="browser", label=label,
            verdict="PASS" if res["ok"] else "ERROR",
            evidence=(res["text"][:600] if res["ok"] else res["error"]),
            meta={"url": url, "title": res.get("title", "")},
        ))


def verify(repo: str, n_drafts: int = 3, rounds: int = 2,
           cross_check: bool = True, gpu_step: bool = True, log=print) -> Ledger:
    ledger = Ledger(repo)

    log("[0/5] Daytona: 샌드박스 환경 측정 (추측하지 않는다)")
    env = daytona_runner.probe_env()
    env_facts = daytona_runner.env_brief(env)
    log(f"      user={env.get('user')} uid={env.get('uid')} sudo={env.get('sudo')} "
        f"python={env.get('python')}")
    log(f"      egress: pypi={env.get('pypi_reachable')} "
        f"github={env.get('github_reachable')} "
        f"arbitrary={env.get('arbitrary_http_egress')}")

    log(f"[1/5] Bright Data: README 수집 -> {repo}")
    readme = brightdata.github_readme(repo)
    log(f"      {len(readme):,}자 확보")

    feedback = ""
    for rnd in range(1, rounds + 1):
        log(f"[2/5] Qwen: 드래프트 {n_drafts}벌 생성 (라운드 {rnd})")
        slug = brightdata.slug_of(repo)
        try:
            with ThreadPoolExecutor(max_workers=n_drafts) as ex:
                scripts = list(ex.map(
                    lambda s: _draft(readme, repo, s[0], s[1], feedback, env_facts),
                    STRATEGIES[:n_drafts]))
            source = "qwen"
        except Exception as e:
            log(f"      LLM 사용불가({type(e).__name__}) -> 결정적 추출 폴백")
            scripts = [sc for _, sc in fallback.drafts(readme, slug)][:n_drafts]
            source = "extract"
        log(f"      드래프트 출처: {source}")

        log(f"[3/5] Daytona: 샌드박스 {n_drafts}개 병렬 실행")
        with ThreadPoolExecutor(max_workers=n_drafts) as ex:
            receipts = list(ex.map(daytona_runner.run_script, scripts))

        for (name, _), script, rec in zip(STRATEGIES, scripts, receipts):
            v = _verdict(rec)
            label = f"{name}-r{rnd}"
            ledger.add(Row(
                kind="draft", label=label, verdict=v,
                exit_code=rec.get("exit_code"), seconds=rec.get("seconds", 0.0),
                evidence=(rec.get("stdout") or rec.get("error") or "")[-1500:],
                meta={"script": script},
            ))
            log(f"      {label:16s} {v}  exit={rec.get('exit_code')}  {rec.get('seconds')}s")

        if any(r.verdict == "PASS" for r in ledger.rows if r.kind == "draft"):
            break
        feedback = "\n\n".join(
            (r.evidence or "") for r in ledger.rows if r.kind == "draft")[-4000:]
        log("      전멸. 에러를 되먹여 재시도한다.")

    if cross_check and brightdata.config.BD_CDP:
        log("[4/5] Bright Data Scraping Browser: 원격 크롬 병렬 교차검증")
        try:
            asyncio.run(_cross_check(repo, ledger))
        except Exception as e:
            log(f"      교차검증 스킵: {e}")

    if gpu_step and nosana.available():
        log("[5/5] Nosana: GPU 워커 확인")
        plan = nosana.gpu_plan()
        mk = plan.get("market") or {}
        ledger.add(Row(kind="gpu", label="nosana-gpu",
                       verdict="PASS" if plan.get("key_active") else "ERROR",
                       evidence=f"market={mk.get('slug')} ${mk.get('usd_per_hour')}/h "
                                f"| recent_jobs={len(plan.get('recent_jobs') or [])}",
                       meta=plan))
        log(f"      GPU 마켓 선택: {mk.get('slug')} (${mk.get('usd_per_hour')}/h)")

    return ledger
