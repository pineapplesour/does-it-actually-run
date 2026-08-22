"""LLM 이 없을 때 쓰는 결정적 드래프트 생성기.

README 에서 설치/실행 명령을 정규식으로 추출한다. 추론이 아니라 추출이다.
LLM(Qwen) 이 살아있으면 이 경로는 쓰이지 않는다.
"""
import re

FENCE = re.compile(r"```(?:bash|sh|shell|console|text)?\n(.*?)```", re.S)
CMD = re.compile(
    r"^\s*\$?\s*((?:pip3?|python3?|uv|poetry|npm|yarn|pnpm|apt-get|conda|make|git)\s+[^\n]+)",
    re.M)

NOISE = ("--help", "your_", "<", "sudo rm", "docker run -it")


def commands(readme: str) -> list[str]:
    blocks = FENCE.findall(readme) or [readme]
    out, seen = [], set()
    for b in blocks:
        for m in CMD.findall(b):
            c = m.strip().rstrip("\\").strip()
            if any(n in c for n in NOISE) or len(c) > 200:
                continue
            if c not in seen:
                seen.add(c)
                out.append(c)
    return out


def pkg_guess(repo_slug: str, readme: str) -> str:
    m = re.search(r"pip3?\s+install\s+(?:-U\s+)?([A-Za-z0-9_.\-\[\]]+)", readme)
    if m and not m.group(1).startswith("-"):
        return m.group(1).split("[")[0]
    return repo_slug.split("/")[-1].replace("-", "_")


HEAD = "set -e\nexport DEBIAN_FRONTEND=noninteractive\n"
TAIL = "echo REPRO_OK\n"


def drafts(readme: str, repo_slug: str) -> list[tuple[str, str]]:
    cmds = commands(readme)
    pkg = pkg_guess(repo_slug, readme)
    installs = [c for c in cmds if re.match(r"(pip3?|uv|poetry|npm|yarn|conda)", c)]

    literal = HEAD + "\n".join(installs[:6] or [f"pip3 install {pkg}"]) + \
        f"\npython3 -c 'import {pkg}; print({pkg}.__name__)'\n" + TAIL

    pragmatic = HEAD + (
        "apt-get update -qq\n"
        "apt-get install -y -qq git build-essential python3-pip >/dev/null\n"
        f"git clone --depth 1 https://github.com/{repo_slug}.git /src\n"
        "cd /src\n"
        "pip3 install --break-system-packages -q . 2>/dev/null || pip3 install -q .\n"
        f"python3 -c 'import {pkg}; print({pkg}.__name__)'\n") + TAIL

    minimal = HEAD + (
        f"pip3 install --break-system-packages -q {pkg} 2>/dev/null || pip3 install -q {pkg}\n"
        f"python3 -c 'import {pkg}; print(\"imported\", {pkg}.__name__)'\n") + TAIL

    return [("literal", literal), ("pragmatic", pragmatic), ("minimal", minimal)]
