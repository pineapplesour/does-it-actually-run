"""도구를 쓰는 정찰 에이전트.

README 만 보고 추측하는 대신, 저장소를 샌드박스에 실제로 clone 하고
에이전트가 도구(ls / cat / run)로 직접 뒤져서 생태계와 성공 기준을 확정한다.
이 프로젝트의 원칙("추측하지 말고 측정하라")을 드래프트 단계에도 적용한 것.
"""
import json
from . import llm

TOOLS = [
    {"type": "function", "function": {
        "name": "list_dir",
        "description": "저장소 안의 디렉터리 목록을 본다.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string", "description": "저장소 루트 기준 상대경로. 루트는 '.'"}},
            "required": ["path"]}}},
    {"type": "function", "function": {
        "name": "read_file",
        "description": "파일 앞부분을 읽는다. 매니페스트나 CI 설정을 확인할 때 쓴다.",
        "parameters": {"type": "object", "properties": {
            "path": {"type": "string"},
            "max_bytes": {"type": "integer", "description": "기본 4000"}},
            "required": ["path"]}}},
    {"type": "function", "function": {
        "name": "run",
        "description": "저장소 루트에서 읽기 전용 셸 명령을 실행한다 (find, grep, ls, cat, wc 등). 설치나 수정은 금지.",
        "parameters": {"type": "object", "properties": {
            "cmd": {"type": "string"}}, "required": ["cmd"]}}},
]

RECON_SYS = """너는 저장소 정찰 담당이다. 도구로 저장소를 직접 뒤져서
"이 저장소를 어떻게 설치하고, 무엇을 확인하면 동작한다고 말할 수 있는가"를 확정한다.

반드시 확인할 것:
- 어떤 생태계인가 (package.json / pyproject.toml / setup.py / Cargo.toml / go.mod /
  pom.xml / build.gradle / Gemfile / Makefile / Dockerfile 중 무엇이 있는가)
- .github/workflows 안의 CI 가 실제로 어떤 명령으로 설치하고 테스트하는가.
  이것이 가장 신뢰할 만한 근거다.
- 이 저장소에서 "동작한다"의 최소 증거는 무엇인가
  (라이브러리면 import, CLI 면 --help, 서비스면 기동, 컴파일 언어면 빌드 성공)

도구를 최소 3회 이상 쓴 뒤에 결론을 내라. 추측 금지.
탐색이 끝나면 도구를 더 쓰지 말고 아래 JSON 만 출력해라.

{"ecosystem": "python|node|go|rust|java|ruby|c|mixed|unknown",
 "build_files": ["실제로 존재를 확인한 파일 경로"],
 "install_commands": ["CI 나 문서에서 확인한 설치 명령"],
 "success_check": "동작을 증명하는 단 하나의 셸 명령",
 "success_reason": "왜 그 명령이 증거가 되는지 한 문장",
 "notes": "설치를 방해할 수 있는 제약"}"""


def _dispatch(sandbox, name: str, args: dict, root: str) -> str:
    """도구 호출을 샌드박스 안에서 실행한다. 읽기 전용으로 제한한다."""
    if name == "list_dir":
        p = (args.get("path") or ".").lstrip("/")
        cmd = f"cd {root} && ls -la --group-directories-first {p!r} | head -60"
    elif name == "read_file":
        p = (args.get("path") or "").lstrip("/")
        n = int(args.get("max_bytes") or 4000)
        cmd = f"cd {root} && head -c {n} {p!r}"
    elif name == "run":
        raw = args.get("cmd") or ""
        banned = ("rm ", "curl", "wget", "pip install", "npm install", "apt", "sudo",
                  ">", "mv ", "chmod", "git push")
        if any(b in raw for b in banned):
            return f"거부됨: 읽기 전용 명령만 허용된다. ({raw[:60]})"
        cmd = f"cd {root} && {raw}"
    else:
        return f"알 수 없는 도구: {name}"
    r = sandbox.process.exec(cmd, timeout=60)
    out = (getattr(r, "result", "") or "")[:4000]
    return out or "(출력 없음)"


def recon(sandbox, repo_url: str, root: str = "/tmp/target",
          max_steps: int = 8, log=print) -> dict:
    """샌드박스에 clone 된 저장소를 에이전트가 도구로 탐색한다."""
    messages = [
        {"role": "system", "content": RECON_SYS},
        {"role": "user", "content": f"저장소: {repo_url}\n루트 경로: {root}\n탐색을 시작해라."},
    ]
    client = llm.client()

    for step in range(max_steps):
        resp = client.chat.completions.create(
            model=llm.config.QWEN_MODEL, messages=messages,
            tools=TOOLS, tool_choice="auto", temperature=0.3, max_tokens=1200,
        )
        m = resp.choices[0].message
        messages.append(m.model_dump(exclude_none=True))

        if not m.tool_calls:
            txt = llm.strip_fence(m.content or "")
            try:
                return json.loads(txt)
            except Exception:
                s, e = txt.find("{"), txt.rfind("}")
                if s >= 0 and e > s:
                    try:
                        return json.loads(txt[s:e + 1])
                    except Exception:
                        pass
                log(f"      정찰 JSON 파싱 실패, 원문 앞부분: {txt[:120]}")
                return {"ecosystem": "unknown", "raw": txt[:1500]}

        for tc in m.tool_calls:
            try:
                args = json.loads(tc.function.arguments or "{}")
            except Exception:
                args = {}
            out = _dispatch(sandbox, tc.function.name, args, root)
            log(f"      🔍 {tc.function.name}({str(args)[:60]}) -> {len(out)}B")
            messages.append({"role": "tool", "tool_call_id": tc.id, "content": out})

    return {"ecosystem": "unknown", "notes": "탐색 단계 소진"}
