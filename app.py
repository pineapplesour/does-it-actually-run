"""Does It Actually Run? - 데모 UI"""
import streamlit as st
from src import agent, config

st.set_page_config(page_title="Does It Actually Run?", page_icon="✅", layout="wide")
st.title("✅ Does It Actually Run?")
st.caption("README 대로 진짜 되는지, 격리 샌드박스 N개에서 실제로 돌려보고 영수증으로 판정한다.")

with st.sidebar:
    st.subheader("스택")
    st.markdown("""
- **Bright Data** — README 수집 + 원격 크롬 교차검증
- **Qwen Cloud** — 드래프트 N벌 생성 / 에러 되먹임
- **Daytona** — 격리 샌드박스 실제 실행 ← 객관적 게이트
- **Nosana** — GPU 스텝 오프로드
""")
    miss = config.missing()
    if miss:
        st.error("키 없음: " + ", ".join(miss))
    else:
        st.success("키 4개 전부 준비됨")
    n = st.slider("병렬 드래프트 수", 1, 3, 3)
    cc = st.checkbox("원격 브라우저 교차검증", value=True)
    gpu = st.checkbox("Nosana GPU 스텝", value=True)

repo = st.text_input("GitHub 저장소", "https://github.com/psf/requests")

if st.button("검증 시작", type="primary"):
    box = st.empty()
    lines = []

    def log(msg):
        lines.append(str(msg))
        box.code("\n".join(lines))

    with st.spinner("샌드박스 돌리는 중..."):
        ledger = agent.verify(repo, n_drafts=n, cross_check=cc, gpu_step=gpu, log=log)

    s = ledger.synthesize()
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("판정", "✅ 재현됨" if s["status"] == "REPRODUCIBLE" else "❌ 깨짐")
    c2.metric("통과 / 전체", f'{s["drafts_passed"]} / {s["drafts_total"]}')
    c3.metric("신뢰도", s["confidence"])
    c4.metric("승자", s["winner"] or "-")

    st.subheader("원장 (Ledger)")
    st.dataframe([{k: v for k, v in r.items() if k != "meta"} for r in ledger.table()],
                 use_container_width=True)

    for r in ledger.rows:
        if r.kind == "draft":
            with st.expander(f"{r.label} — {r.verdict}"):
                st.code(r.meta.get("script", ""), language="bash")
                st.text(r.evidence)
    st.caption(f"저장: {ledger.save()}")
