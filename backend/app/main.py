"""FastAPI 진입점 — 라우터 등록만 한다. 로직은 tools/·seed/ 에."""
import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

app = FastAPI(title="KTX 당일배송", docs_url="/api/docs", openapi_url="/api/openapi.json")

# 인증·개인정보 없는 해커톤 프로토타입이라 전 오리진 허용 —
# Vercel(프론트)과 Railway(백엔드)가 도메인이 달라 CORS 가 필요하다
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "demo_mode": os.getenv("DEMO_MODE", "").lower() == "true",
        "iterations": int(os.getenv("MC_ITERATIONS", "10000")),
    }
