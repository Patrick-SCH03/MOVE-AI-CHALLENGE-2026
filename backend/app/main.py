"""FastAPI 진입점 — 라우터 등록만 한다. 로직은 tools/·seed/ 에."""
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

from . import tago  # noqa: E402  (load_dotenv 이후여야 키를 읽는다)
from .clock import service_now, to_hhmm, today_yyyymmdd  # noqa: E402
from .db import init_db  # noqa: E402
from .routers import meta as meta_router  # noqa: E402
from .routers import tools as tools_router  # noqa: E402

init_db()

app = FastAPI(title="KTX 당일배송", docs_url="/api/docs", openapi_url="/api/openapi.json")

# 인증·개인정보 없는 해커톤 프로토타입이라 전 오리진 허용 —
# Vercel(프론트)과 Railway(백엔드)가 도메인이 달라 CORS 가 필요하다
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(tools_router.router)
app.include_router(meta_router.router)


@app.get("/api/health")
def health():
    # 화면에 고정 시각 표시 띠가 없으므로 DEMO_TIME 이 켜졌는지는 여기서만 안다
    return {
        "ok": True,
        "tago_api": tago.status(today_yyyymmdd()),
        "gemini": bool(os.getenv("GEMINI_API_KEY", "").strip()),
        "model": os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        "service_now": to_hhmm(service_now()),
        "demo_time": os.getenv("DEMO_TIME", "") or None,
        "demo_mode": os.getenv("DEMO_MODE", "").lower() == "true",
        "iterations": int(os.getenv("MC_ITERATIONS", "10000")),
    }
