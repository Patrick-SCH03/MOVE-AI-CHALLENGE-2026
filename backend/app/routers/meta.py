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

    done_all = [o for o in orders if o.status == "COMPLETED"]
    return {
        "today_orders": len(today),
        "today_count": len(today),   # 홈 화면 표기용 별칭
        "in_transit": len(in_transit),
        "week_completed": len(week_done),
        "ontime_rate": round(len(ontime) / len(week_done), 4) if week_done else None,
        "channel_share": channel_share,
        # MY 화면 합계 — 화면이 직접 세면 집계 기준이 화면마다 어긋난다
        "total_orders": len(orders),
        "total_completed": len(done_all),
        "total_fare": sum(o.fare for o in orders if o.status != "CANCELLED"),
    }


@router.get("/tariff")
def tariff_table():
    """요금 안내 카드용 — 숫자는 tariff·channels 단일 출처에서만 나온다."""
    from ..seed.tariff import DECLARED_MAX, TIERS, WEIGHT_MAX_KG
    from ..tools.channels import NAMES, PICKUP_AFTER, SURCHARGE

    return {
        "tiers": [{"name": n, "max_side_cm": s, "sum_cm": t, "fare": f}
                  for n, s, t, f in TIERS],
        "channels": [{
            "id": ch, "name": NAMES[ch], "surcharge": SURCHARGE[ch],
            "door_to_door": PICKUP_AFTER[ch] == 15,
        } for ch in ("desk", "locker", "relay", "fullmile")],
        "notes": [
            "할증 — 10kg 초과 5kg당 2,000원 · 장거리 구간 1,000원 · 신고가액 50만원 초과 5,000~10,000원",
            f"세변합 200cm · 최장변 180cm · {WEIGHT_MAX_KG}kg · {DECLARED_MAX // 10000}만원을 넘으면 접수되지 않습니다",
            "SRT 편성(동탄 출도착)은 소형 화물만, KTX 51·126은 초소형 화물만 실을 수 있어요",
        ],
        "disclaimer": "기본 운임·할증은 KTX특송 공시 요율입니다. 추가 운임은 제안값이에요.",
    }
