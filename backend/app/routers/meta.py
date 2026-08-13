"""집계 라우터 — 화면의 모든 통계는 실제 주문 행 집계에서 나온다. 상수 금지 —
상수로 두면 화면끼리 어긋난다."""
from datetime import timedelta

from fastapi import APIRouter
from sqlmodel import Session, select

from ..clock import KST, now_kst
from ..db import engine
from ..models import Order

router = APIRouter(prefix="/api")


def _kst_day_start_utc():
    """KST 자정을 UTC naive 로 — UTC 자정으로 '오늘'을 세면 한국 오전 9시에 하루가 바뀐다."""
    k = now_kst().replace(hour=0, minute=0, second=0, microsecond=0)
    return k.astimezone(KST).replace(tzinfo=None) - timedelta(hours=9)


@router.get("/live")
def live():
    day_start = _kst_day_start_utc()
    week_start = day_start - timedelta(days=7)
    with Session(engine) as s:
        orders = s.exec(select(Order)).all()

    today = [o for o in orders if o.created_at and o.created_at >= day_start]
    week = [o for o in orders if o.created_at and o.created_at >= week_start]
    in_transit = [o for o in orders if o.status in ("PICKED_UP", "ON_TRAIN")]
    week_done = [o for o in week if o.status == "COMPLETED"]
    # 정시율 = 완료 건 중 eta ≤ deadline — 완료 이력 집계이지 약속이 아니다
    ontime = [o for o in week_done if o.eta <= o.deadline]

    total = len(week) or 1
    channel_share = {}
    for ch in ("desk", "locker", "relay", "fullmile"):
        channel_share[ch] = round(sum(1 for o in week if o.channel == ch) / total, 3)

    return {
        "today_orders": len(today),
        "in_transit": len(in_transit),
        "week_completed": len(week_done),
        "ontime_rate": round(len(ontime) / len(week_done), 4) if week_done else None,
        "channel_share": channel_share,
    }
