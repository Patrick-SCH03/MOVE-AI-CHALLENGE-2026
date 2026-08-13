"""운반자 라우터 — 콜 수신·응답, 요청 목록, 보호 장치.

수락 전에는 지역까지만, 수락 후에만 상세가 열리고, 인계가 끝나면 다시 가려진다 —
제3자 제공 대상이 법인이 아니라 개인이기 때문이다.
"""
import json

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import orderflow
from ..clock import utc_naive_now
from ..db import engine
from ..models import Call, Leg, Order

router = APIRouter(prefix="/api")


@router.get("/carriers")
def list_carriers():
    from ..seed.carriers import CARRIERS

    # 시연 팀원 4명이 목록 앞에 온다 — 90초 콜 안에 400명 목록을 뒤질 수 없다
    return {"carriers": [{
        "id": c.id, "name": c.name, "type": c.type, "mode": c.mode,
        "reliability": round(c.reliability, 2), "completed_count": c.completed_count,
    } for c in CARRIERS]}


def _safe_number(order_id: str) -> str:
    """안심번호 — 발급은 모의(통신사 계약 전). 수명(인계 완료 시 회수)은 실제로 동작한다."""
    h = abs(hash(order_id))
    return f"0508-{h % 10000:04d}-{(h // 10000) % 10000:04d}"


def _requests_payload(s: Session, carrier_id: str) -> dict:
    from ..seed.carriers import BY_ID as CARRIER_BY_ID

    c = CARRIER_BY_ID.get(carrier_id)
    if not c:
        raise HTTPException(404, "없는 운반자예요.")
    legs = s.exec(select(Leg).where(Leg.carrier_id == carrier_id)).all()
    rows, pending_reward = [], 0
    for leg in legs:
        order = s.get(Order, leg.order_id)
        if not order or order.status == "CANCELLED":
            continue
        if leg.accepted and not leg.handed_over:
            pending_reward += leg.reward
        has_recipient = bool(order.recipient_name.strip() or order.recipient_phone.strip())
        rows.append({
            "order_id": order.id, "seq": leg.seq, "label": leg.label,
            "from_name": leg.from_name, "to_name": leg.to_name,
            "start_at": leg.start_at, "end_at": leg.end_at,
            "item": order.item or "물품", "reward": leg.reward,
            "accepted": leg.accepted, "handed_over": leg.handed_over,
            "handover_code": leg.handover_code,
            # 수락 후·인계 전에만 연다. 인계가 끝나면 번호가 회수되어 칸 자체가 사라진다
            "recipient_name": (order.recipient_name[:1] + "*" * max(1, len(order.recipient_name) - 1))
                              if has_recipient and leg.accepted and not leg.handed_over else None,
            "recipient_contact": _safe_number(order.id)
                                 if has_recipient and leg.accepted and not leg.handed_over else None,
            "privacy_note": "인계가 끝나면 주소와 연락처는 즉시 가려져요.",
        })
    deposit = min(50_000, c.completed_count * 100)   # 건당 100원 적립 · 상한 5만원
    return {
        "carrier": {
            "id": c.id, "name": c.name, "type": c.type, "mode": c.mode,
            "active_from": c.active_from, "active_to": c.active_to,
            "reliability": round(c.reliability, 2),
            "completed_count": c.completed_count, "ontime_rate": c.ontime_rate,
        },
        "pending_reward": pending_reward,
        "requests": rows,
        "identity": {
            "verified": True, "method": "PASS(모의)",
            "note": "실명과 주민등록번호는 저장하지 않습니다. 연계정보(CI) 해시만 보관합니다.",
        },
        "protection": {
            "deposit": deposit, "recourse_cap": deposit,
            "paid_by": "예치금을 내지 않으셔도 돼요 — 운임에서 적립됩니다.",
            "policy_limit": 3_000_000,
        },
        "external": {
            "identity": {"simulated": True, "provider": "PASS(모의)"},
            "safe_number": {"simulated": True},
        },
    }


class CarrierAcceptBody(BaseModel):
    order_id: str
    seq: int
    carrier_id: str
    accept: bool


@router.post("/carrier/accept")
def carrier_accept(body: CarrierAcceptBody):
    """요청 카드에서의 수락/거절 — 울리는 콜에 응답하는 것과 같은 길이다."""
    with Session(engine) as s:
        call = s.exec(select(Call).where(
            Call.order_id == body.order_id, Call.seq == body.seq,
            Call.carrier_id == body.carrier_id, Call.status == "RINGING")).first()
        if not call:
            raise HTTPException(400, "응답할 수 있는 요청이 없어요.")
        err = orderflow.respond_call(s, call, body.accept)
        if err:
            raise HTTPException(400, err)
        return _requests_payload(s, body.carrier_id)


@router.get("/carrier/{carrier_id}/calls")
def carrier_calls(carrier_id: str):
    with Session(engine) as s:
        # refresh 패턴 — 진행 중 주문의 만료 콜을 조회 시점에 정리한다
        active = s.exec(select(Order).where(Order.status == "ACCEPTED")).all()
        for o in active:
            orderflow.refresh_calls(s, o)
        calls = s.exec(select(Call).where(Call.carrier_id == carrier_id,
                                          Call.status == "RINGING")).all()
        now = utc_naive_now()
        out = []
        for c in calls:
            order = s.get(Order, c.order_id)
            if not order or order.status != "ACCEPTED":
                continue
            plan = json.loads(order.plan_json)
            # 수락 전에는 지역까지만 — 제3자 제공 대상이 개인이라 최소 공개가 원칙이다
            if c.seq == 1:
                from_name, to_name = order.origin, plan["dep_station"]
            else:
                from_name, to_name = plan["arr_station"], order.destination
            out.append({
                "id": c.id, "order_id": c.order_id, "seq": c.seq,
                "carrier_name": c.carrier_name, "reward": c.reward,
                "from_name": from_name, "to_name": to_name,
                "remaining_sec": max(0, int((c.expires_at - now).total_seconds())) if c.expires_at else 0,
                "timeout_sec": orderflow.CALL_TIMEOUT_SEC,
                "match_reason": c.match_reason,
            })
        return {"calls": out}


@router.get("/carrier/{carrier_id}/requests")
def carrier_requests(carrier_id: str):
    """내 운반 요청 — 프로필·보호 장치·수행 구간을 한 번에 내려준다."""
    with Session(engine) as s:
        return _requests_payload(s, carrier_id)


class RespondBody(BaseModel):
    accept: bool


@router.post("/carrier/call/{call_id}/respond")
def respond_call(call_id: str, body: RespondBody):
    with Session(engine) as s:
        call = s.get(Call, call_id)
        if not call:
            raise HTTPException(404, "없는 콜이에요.")
        err = orderflow.respond_call(s, call, body.accept)
        if err:
            raise HTTPException(400, err)
        return {"ok": True, "status": call.status}
