# Does It Actually Run?

**README대로 진짜 되는지, 격리 샌드박스에서 실제로 돌려보고 판정하는 검증 에이전트.**

Agent Forge AI Hackathon Seoul · 2026-08-22

---

## 문제

GitHub 스타 수만 개짜리 저장소도 README대로 따라하면 절반은 안 된다.
의존성이 빠졌고, 명령이 낡았고, 아무도 다시 안 돌려봤다.
개발자는 그걸 **자기 컴퓨터를 망가뜨려 가며** 알아낸다.

기존 AI 도구는 여기서 더 나쁘다. LLM에게 물으면 **"되는 것처럼 보이는 답"** 을 지어낸다.
실행해본 적이 없으니까.

## 해법

의견을 묻지 않는다. **돌려본다.**

```
저장소 URL
   │
   ├─[Bright Data SERP API]      구글에서 "이미 알려진 설치 실패" 정황 수집
   ├─[Bright Data Scraping Browser]  원격 크롬 N개 병렬로 README·이슈·CI 수집
   │
   ├─[Qwen Cloud]                README를 서로 다른 전략 3벌로 해석 → 설치 스크립트 3벌 생성
   │                             (literal / pragmatic / minimal)
   │
   ├─[Daytona]                   격리 샌드박스 3개 동시 기동, 각자 다른 스크립트 실행
   │                             ← 여기가 객관적 게이트. 통과/실패가 의견이 아니라 exit code
   │
   ├─[원장 Ledger]               각 런의 exit code / 소요시간 / 로그를 행으로 기록
   ├─[결정적 합성]                승자를 LLM이 안 고른다. 실행 영수증으로 코드가 고른다
   │                             전멸하면 에러를 되먹여 재드래프트 → 재시도
   │
   └─[Nosana]                    GPU가 필요한 검증 스텝은 탈중앙 GPU로 오프로드
                                 실제 마켓 가격 조회 후 최저가 노드 선택
```

## 핵심 설계 원칙

> **검증이 해결보다 싸고 게이트가 객관적인 곳에서만 분해한다.**

LLM 여러 개를 투표시키는 접근은 상관된 오류를 못 고친다.
그래서 이 시스템은 **판정을 LLM에게 맡기지 않는다.**
`exit_code == 0 && stdout contains REPRO_OK` — 이것만이 PASS다.
신뢰도도 모델 자기신고가 아니라 **실제 통과한 샌드박스 비율**이다.

## 스폰서 통합 (코드 레벨)

| 스폰서 | 사용 제품 | 위치 | 필수성 |
|---|---|---|---|
| **Bright Data** | SERP API + **Scraping Browser (CDP)** | `src/brightdata.py` | 로컬 크롬은 GitHub에 막힌다. 원격 브라우저 N개 병렬이 곧 교차검증 |
| **Qwen Cloud** | Chat Completions (OpenAI 호환) | `src/qwen.py` | README 해석과 에러 되먹임 수정 |
| **Daytona** | Sandbox 생성 / exec / 삭제 | `src/daytona_runner.py` | **없으면 프로젝트가 성립하지 않는다.** 실제 실행이 유일한 진실 |
| **Nosana** | Markets / Jobs / API Keys | `src/nosana.py` | GPU 워커 선택 및 오프로드 |

Bright Data는 **제품 2종**을 쓴다 (SERP + Browser API).

## 실행

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env    # 키 4개 채우기
.venv/bin/python run_cli.py https://github.com/psf/requests   # CLI
.venv/bin/streamlit run app.py                                 # UI
```

## 산출물

판정(`REPRODUCIBLE` / `BROKEN`), 승자 스크립트, 전체 원장이 `runs/<repo>.json`에 남는다.
재현 가능한 영수증이지 요약이 아니다.

---

## 실측 결과 (2026-08-22, 실제 실행)

```
[1/5] Bright Data: README 수집 -> 2,894자 (원격 크롬 CDP)
[2/5] Qwen Cloud:  드래프트 3벌 생성
[3/5] Daytona:     샌드박스 3개 병렬 실행
      literal-r1     PASS  exit=0    3.9s
      pragmatic-r1   FAIL  exit=100  2.6s   <- 판별력
      minimal-r1     PASS  exit=0    3.8s
[5/5] Nosana:      GPU 마켓 실시간 조회 -> nvidia-3060-community $0.033/h 선택

판정: REPRODUCIBLE | 2/3 통과 | 승자 minimal-r1 (3.3s) | 신뢰도 0.67
```

전체 원장: [`evidence/sample-run-psf-requests.json`](evidence/sample-run-psf-requests.json)

**샌드박스 3개가 서로 다른 판정을 냈다.** 이것이 "LLM에게 물어본 답"과의 차이다.

### 검증된 스폰서 호출

| 스폰서 | 실측 |
|---|---|
| Bright Data Scraping Browser | CDP 접속 성공, README 원문 수집 |
| Bright Data SERP API | 구글 검색 671KB 응답 |
| Daytona | 샌드박스 생성 **1.6초**, exec/삭제 정상 |
| Nosana | `/markets` `/jobs` `/api-keys` 200, 키 status `active` |

### 알려진 제약

Qwen Cloud는 대회 당일 계정 바우처 승인 대기로 `AccessDenied.Unpurchased` 상태였다.
통합 코드는 `src/qwen.py`에 완성돼 있으며 `.env`의 `LLM_BACKEND=qwen` 한 줄로 활성화된다.
**외부 LLM이 죽어도 파이프라인이 멈추지 않도록** README에서 명령을 직접 추출하는
결정적 폴백(`src/fallback.py`)을 설계에 포함했다. 위 실측 결과는 그 폴백 경로로 나온 것이다.
