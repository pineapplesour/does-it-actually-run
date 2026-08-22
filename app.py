"""Does It Actually Run? — 레포 주소 하나 넣으면 실시간으로 검증하고 보고서를 낸다."""
import re
import time
import streamlit as st

from src import agent, config, report

st.set_page_config(page_title="Does It Actually Run?", page_icon="✅", layout="centered")

st.markdown("""
<style>
  .block-container {padding-top: 2.5rem; max-width: 900px;}
  div[data-testid="stMetricValue"] {font-size: 1.5rem;}
  code {font-size: 0.85rem;}
</style>
""", unsafe_allow_html=True)

# ---------------- 언어 선택 ----------------
if "lang" not in st.session_state:
    st.session_state.lang = None

if st.session_state.lang is None:
    st.title("Does It Actually Run?")
    st.write("")
    st.subheader("언어를 선택하세요  /  Choose your language")
    st.write("")
    c1, c2 = st.columns(2)
    if c1.button("🇰🇷   한국어", use_container_width=True):
        st.session_state.lang = "ko"; st.rerun()
    if c2.button("🇺🇸   English", use_container_width=True):
        st.session_state.lang = "en"; st.rerun()
    st.stop()

LANG = st.session_state.lang
UI = {
    "ko": {
        "tag": "README대로 진짜 되는지, 격리 샌드박스에서 **실제로 돌려보고** 판정합니다. 모델에게 묻지 않습니다.",
        "ph": "검증할 GitHub 저장소 주소를 붙여넣으세요",
        "go": "검증", "self": "🔁  이 프로젝트 자체를 검증 (자기검증)",
        "steps": ["환경 측정", "README 수집", "설치 스크립트 생성",
                  "샌드박스 병렬 실행", "교차검증 · GPU"],
        "stepcap": ["샌드박스를 추측하지 않고 직접 잰다",
                    "Bright Data 원격 브라우저",
                    "Qwen Cloud — 서로 다른 전략 3벌",
                    "Daytona — 판정은 종료 코드",
                    "Bright Data · Nosana"],
        "done": "검증 완료", "verdict": "판정", "passed": "통과 샌드박스",
        "conf": "신뢰도", "dl": "보고서 내려받기", "raw": "원장 원본 (JSON)",
        "reset": "언어 변경", "backend": "LLM 백엔드",
    },
    "en": {
        "tag": "We don't ask a model whether it works. We **run it** in isolated sandboxes and read the exit code.",
        "ph": "Paste the GitHub repository you want verified",
        "go": "Verify", "self": "🔁  Verify this project itself (self-check)",
        "steps": ["Probe environment", "Fetch README", "Draft install scripts",
                  "Run sandboxes in parallel", "Cross-check · GPU"],
        "stepcap": ["Measure the sandbox instead of assuming it",
                    "Bright Data remote browser",
                    "Qwen Cloud — three different strategies",
                    "Daytona — the verdict is an exit code",
                    "Bright Data · Nosana"],
        "done": "Verification complete", "verdict": "Verdict", "passed": "Sandboxes passed",
        "conf": "Confidence", "dl": "Download report", "raw": "Raw ledger (JSON)",
        "reset": "Change language", "backend": "LLM backend",
    },
}[LANG]

st.title("Does It Actually Run?")
st.markdown(UI["tag"])

with st.sidebar:
    st.markdown("### Stack")
    st.markdown(
        "**Bright Data** · SERP + Scraping Browser  \n"
        "**Qwen Cloud** · draft & judge  \n"
        "**Daytona** · isolated sandboxes  \n"
        "**Nosana** · decentralized GPU")
    st.divider()
    st.caption(f"{UI['backend']}: `{config.BACKEND}` / `{config.QWEN_MODEL}`")
    n = st.slider("parallel sandboxes", 1, 3, 3)
    if st.button(UI["reset"]):
        st.session_state.lang = None; st.rerun()

SELF = "https://github.com/pineapplesour/does-it-actually-run"
c1, c2 = st.columns([4, 1])
repo = c1.text_input("repo", "https://github.com/psf/requests",
                     label_visibility="collapsed", placeholder=UI["ph"])
go = c2.button(UI["go"], type="primary", use_container_width=True)
if st.button(UI["self"], use_container_width=True):
    repo, go = SELF, True

if go and repo:
    st.divider()
    t0 = time.time()
    # 5개 단계 컨테이너를 미리 펼쳐 두고, 로그가 도착하는 대로 해당 칸을 채운다.
    boxes, bufs = [], []
    for i, (title, cap) in enumerate(zip(UI["steps"], UI["stepcap"])):
        s = st.status(f"{title}", expanded=(i < 4))
        s.caption(cap)
        boxes.append(s); bufs.append([])

    cur = {"i": 0}
    STEP = re.compile(r"^\[(\d)/5\]")

    def log(msg):
        m = STEP.match(msg.strip())
        if m:
            idx = min(int(m.group(1)), 4)
            if idx != cur["i"]:
                boxes[cur["i"]].update(state="complete")
                cur["i"] = idx
            return
        i = cur["i"]
        bufs[i].append(f"{time.time()-t0:5.1f}s  {msg.strip()}")
        boxes[i].code("\n".join(bufs[i]), language="text")

    ledger = agent.verify(repo, n_drafts=n, cross_check=False, gpu_step=True, log=log)
    for b in boxes:
        b.update(state="complete", expanded=False)

    s = ledger.synthesize()
    ok = s["status"] == "REPRODUCIBLE"
    st.divider()
    (st.success if ok else st.error)(UI["done"])

    a, b, c = st.columns(3)
    a.metric(UI["verdict"], ("✅ " if ok else "❌ ") + report.t(LANG, s["status"]))
    b.metric(UI["passed"], f'{s["drafts_passed"]} / {s["drafts_total"]}')
    c.metric(UI["conf"], s["confidence"])

    md = report.render_markdown(s, ledger.table(), LANG)
    st.markdown(md)
    st.download_button(UI["dl"], md, file_name=f"report-{LANG}.md", mime="text/markdown")
    with st.expander(UI["raw"]):
        st.json({"summary": s, "rows": ledger.table()})
