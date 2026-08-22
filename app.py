"""Does It Actually Run? — 레포 주소 하나 넣으면 실시간으로 검증하고 보고서를 낸다."""
import json
import time
import streamlit as st

from src import agent, config, nosana, report

st.set_page_config(page_title="Does It Actually Run?", page_icon="✅", layout="centered")

# ---------- 1) 언어 선택 ----------
if "lang" not in st.session_state:
    st.session_state.lang = None

if st.session_state.lang is None:
    st.title("Does It Actually Run?")
    st.write("")
    st.subheader("언어를 선택하세요 / Choose your language")
    c1, c2 = st.columns(2)
    if c1.button("🇰🇷  한국어", use_container_width=True):
        st.session_state.lang = "ko"; st.rerun()
    if c2.button("🇺🇸  English", use_container_width=True):
        st.session_state.lang = "en"; st.rerun()
    st.stop()

LANG = st.session_state.lang
UI = {
    "ko": {
        "title": "Does It Actually Run?",
        "tag": "README대로 진짜 되는지, 격리 샌드박스에서 실제로 돌려보고 판정합니다.",
        "ph": "검증할 GitHub 저장소 주소",
        "go": "검증 시작", "self": "이 프로젝트 자체를 검증 (자기검증)",
        "running": "샌드박스에서 실행 중…", "live": "실시간 진행",
        "done": "검증 완료", "dl": "보고서 내려받기", "raw": "원장 원본 (JSON)",
        "reset": "언어 다시 선택",
    },
    "en": {
        "title": "Does It Actually Run?",
        "tag": "We don't ask an LLM if it works. We run it in an isolated sandbox and read the exit code.",
        "ph": "GitHub repository URL to verify",
        "go": "Verify", "self": "Verify this project itself (self-check)",
        "running": "Running in sandboxes…", "live": "Live progress",
        "done": "Verification complete", "dl": "Download report", "raw": "Raw ledger (JSON)",
        "reset": "Change language",
    },
}[LANG]

st.title(UI["title"])
st.caption(UI["tag"])

with st.sidebar:
    st.markdown("**Stack**")
    st.markdown(
        "- **Bright Data** — SERP + Scraping Browser\n"
        "- **Qwen Cloud / Codex** — draft & judge\n"
        "- **Daytona** — isolated sandboxes\n"
        "- **Nosana** — decentralized GPU")
    st.divider()
    st.caption(f"LLM backend: `{config.BACKEND}`")
    miss = config.missing()
    if miss:
        st.warning("missing: " + ", ".join(miss))
    n = st.slider("parallel sandboxes", 1, 3, 3)
    if st.button(UI["reset"]):
        st.session_state.lang = None; st.rerun()

SELF = "https://github.com/pineapplesour/does-it-actually-run"
col1, col2 = st.columns([3, 1])
repo = col1.text_input(UI["ph"], "https://github.com/psf/requests",
                       label_visibility="collapsed", placeholder=UI["ph"])
run = col2.button(UI["go"], type="primary", use_container_width=True)
selfrun = st.button(UI["self"], use_container_width=True)

if selfrun:
    repo, run = SELF, True

if run and repo:
    st.divider()
    st.markdown(f"**{UI['live']}**")
    box = st.empty()
    lines = []
    t0 = time.time()

    def log(msg):
        lines.append(f"{time.time()-t0:6.1f}s  {msg}")
        box.code("\n".join(lines), language="text")

    with st.spinner(UI["running"]):
        ledger = agent.verify(repo, n_drafts=n, cross_check=False,
                              gpu_step=True, log=log)

    s = ledger.synthesize()
    st.divider()
    st.success(UI["done"])

    a, b, c = st.columns(3)
    a.metric("Verdict", ("✅ " + report.t(LANG, s["status"])))
    b.metric("Sandboxes passed", f'{s["drafts_passed"]} / {s["drafts_total"]}')
    c.metric("Confidence", s["confidence"])

    md = report.render_markdown(s, ledger.table(), LANG)
    st.markdown(md)

    st.download_button(UI["dl"], md,
                       file_name=f"report-{LANG}.md", mime="text/markdown")
    with st.expander(UI["raw"]):
        st.json({"summary": s, "rows": ledger.table()})
