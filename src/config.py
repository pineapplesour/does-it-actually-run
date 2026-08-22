import os
from dotenv import load_dotenv

load_dotenv()

QWEN_KEY   = os.getenv("DASHSCOPE_API_KEY", "")
QWEN_BASE  = os.getenv("DASHSCOPE_BASE_URL", "https://dashscope-intl.aliyuncs.com/compatible-mode/v1")
QWEN_MODEL = os.getenv("QWEN_MODEL", "qwen3.8-max")
BACKEND    = os.getenv("LLM_BACKEND", "qwen")   # qwen | claude(개발용)

BD_TOKEN = os.getenv("BRIGHTDATA_API_TOKEN", "")
BD_SERP  = os.getenv("BRIGHTDATA_SERP_ZONE", "serp_api1")
BD_CDP   = os.getenv("BRIGHTDATA_CDP_URL", "")

DAYTONA_KEY = os.getenv("DAYTONA_API_KEY", "")
NOSANA_KEY  = os.getenv("NOSANA_API_KEY", "")
NOSANA_URL  = os.getenv("NOSANA_API_URL", "https://dashboard.nosana.com/api")


def missing():
    """어떤 키가 비었는지 알려준다 (UI 에서 표시)."""
    out = []
    if not QWEN_KEY: out.append("DASHSCOPE_API_KEY (Qwen)")
    if not BD_TOKEN: out.append("BRIGHTDATA_API_TOKEN")
    if not BD_CDP:   out.append("BRIGHTDATA_CDP_URL (Scraping Browser)")
    if not DAYTONA_KEY: out.append("DAYTONA_API_KEY")
    if not NOSANA_KEY:  out.append("NOSANA_API_KEY")
    return out
