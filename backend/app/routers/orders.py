"""주문·배차·인계·증명 라우터 — 규칙은 orderflow 에, 여기는 입출력만."""
import json
from datetime import timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from .. import orderflow
from ..clock import utc_naive_now
from ..db import engine
from ..models import CHANNEL_LABELS, STATUS_LABELS, Call, Leg, Order, ProofAccess, ProofEvent
from ..seed import tariff
from ..tools import route as route_tool
from ..tools.channels import SURCHARGE

router = APIRouter(prefix="/api")


class OrderCreate(BaseModel):
    origin: str
    destination: str
    deadline: str
    item: str | None = None
    declared_value: int | None = None
    channel: str
    recipient_name: str = ""
    recipient_phone: str = ""
    notice_consent: bool = False
    recipient_consent: bool = False
    relay_consent: bool = False
    now: str | None = None
    force_carriers: dict[str, str] | None = None


def _order_payload(s: Session, order: Order) -> dict:
    legs = s.exec(select(Leg).where(Leg.order_id == order.id).order_by(Leg.seq)).all()
    calls = s.exec(select(Call).where(Call.order_id == order.id)).all()
    now = utc_naive_now()
    ringing = [{
        "id": c.id, "seq": c.seq, "carrier_id": c.carrier_id, "carrier_name": c.carrier_name,
        "rank": c.rank, "reward": c.reward, "match_reason": c.match_reason,
        "remaining_sec": max(0, int((c.expires_at - now).total_seconds())) if c.expires_at else 0,
        "timeout_sec": orderflow.CALL_TIMEOUT_SEC,
    } for c in calls if c.status == "RINGING"]
    return {
        "order": {
            "id": order.id, "status": order.status,
            "status_label": STATUS_LABELS.get(order.status, order.status),
            "product": CHANNEL_LABELS.get(order.channel, order.channel),
            "origin": order.origin, "destination": order.destination,
            "item": order.item, "declared_value": order.declared_value,
            "fare": order.fare, "probability": order.probability,
            "eta": order.eta, "deadline": order.deadline, "train_no": order.train_no,
            "liability_cap": tariff.liability_cap(order.declared_value),
            "pickup_mode": order.pickup_mode, "delay_min": order.delay_min,
            # 탑재 후에는 물리적으로 되돌릴 수 없다 — 취소 버튼 자체를 접는다
            "can_cancel": order.status in ("ACCEPTED", "PICKED_UP"),
            "cancelled_reason": order.cancelled_reason or "이용자 요청",
            "consents": {"notice": order.notice_consent, "recipient": order.recipient_consent,
                         "relay": order.relay_consent},
            "dispatch": {"ringing": ringing,
                         "accepted": [c.carrier_name for c in calls if c.status == "ACCEPTED"],
                         "attempts": len(calls)},
        },
        "legs": [{
            "seq": leg.seq, "label": leg.label, "from_name": leg.from_name, "to_name": leg.to_name,
            "carrier_id": leg.carrier_id, "carrier_name": leg.carrier_name,
            "train_no": leg.train_no, "start_at": leg.start_at, "end_at": leg.end_at,
            "probability": leg.probability, "handover_code": leg.handover_code,
            "accepted": leg.accepted, "handed_over": leg.handed_over,
            "handed_over_at": leg.handed_over_at, "reward": leg.reward,
            "fallback": leg.fallback, "fallback_note": leg.fallback_note,
        } for leg in legs],
        "plan": json.loads(order.plan_json),
    }


@router.post("/orders")
def create_order(body: OrderCreate):
    # 동의는 서버가 막는다 — 체크박스만 두면 API 를 직접 부르는 순간 뚫린다.
    # 항목을 나누는 이유: 고지 확인(면책 요건)·수령인 정보 제공(법인)·운반자 제공(개인)은
    # 성격이 다른 동의라 하나로 묶을 수 없다
    if not body.notice_consent:
        raise HTTPException(400, "확률·배상 고지 확인이 필요해요.")
    # 수령인 동의는 수령인 정보를 적었을 때만 — 안 적으면 제공할 정보 자체가 없다
    if (body.recipient_name.strip() or body.recipient_phone.strip()) \
            and not body.recipient_consent:
        raise HTTPException(400, "수령인에게 알리고 동의를 받았는지 확인이 필요해요.")
    if body.channel == "relay" and not body.relay_consent:
        raise HTTPException(400, "시민 운반은 운반자(개인)에게 정보가 제공돼요. 동의가 필요해요.")
    if body.channel not in SURCHARGE:
        raise HTTPException(400, "알 수 없는 채널이에요.")
    if body.declared_value and body.declared_value > tariff.DECLARED_MAX:
        raise HTTPException(400, "신고가액 300만원 초과 물품은 수탁할 수 없어요.")
    if body.channel == "relay" and body.declared_value \
            and body.declared_value > tariff.RELAY_VALUE_MAX:
        raise HTTPException(400, "신고가액 200만원 초과 물품은 시민 운반으로 보낼 수 없어요.")

    plan = route_tool.build(body.origin, body.destination, body.deadline,
                            now=body.now, force_carriers=body.force_carriers)
    if not plan.get("feasible"):
        raise HTTPException(400, plan.get("reason", "지금은 경로를 만들 수 없어요."))

    base, _ = tariff.base_fare(body.item, plan["dep_code"], plan["arr_code"],
                               body.declared_value)
    fare = base + SURCHARGE[body.channel]

    with Session(engine) as s:
        order, _legs = orderflow.create_order(s, plan, body.model_dump(), fare)
        return _order_payload(s, order)


@router.get("/orders")
def list_orders():
    with Session(engine) as s:
        orders = s.exec(select(Order).order_by(Order.created_at.desc())).all()
        # 표시 필드는 상세와 같은 이름으로 — 목록에서 빠지면 내역 화면의
        # 상태 칩·운임이 빈 채로 그려진다 (실제로 그랬다)
        return {"orders": [{
            "id": o.id, "origin": o.origin, "destination": o.destination,
            "item": o.item, "status": o.status, "channel": o.channel,
            "status_label": STATUS_LABELS.get(o.status, o.status),
            "product": CHANNEL_LABELS.get(o.channel, o.channel),
            "fare": o.fare, "recipient_name": o.recipient_name,
            "eta": o.eta, "deadline": o.deadline, "probability": o.probability,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        } for o in orders]}


def _get_order(s: Session, order_id: str) -> Order:
    order = s.get(Order, order_id)
    if not order:
        raise HTTPException(404, "없는 접수번호예요.")
    return order


@router.get("/orders/{order_id}")
def get_order(order_id: str):
    with Session(engine) as s:
        order = _get_order(s, order_id)
        orderflow.refresh_calls(s, order)   # 조회 시점 만료 정리 — 백그라운드 작업 금지
        return _order_payload(s, order)


@router.get("/orders/{order_id}/notifications")
def get_notifications(order_id: str):
    with Session(engine) as s:
        order = _get_order(s, order_id)
        orderflow.refresh_calls(s, order)
        return orderflow.notifications(s, order)


class DelayBody(BaseModel):
    delay_min: int


@router.post("/orders/{order_id}/delay")
def set_delay(order_id: str, body: DelayBody):
    with Session(engine) as s:
        order = _get_order(s, order_id)
        order.delay_min = max(0, body.delay_min)
        s.add(order)
        s.commit()
        return orderflow.notifications(s, order)


class PickupBody(BaseModel):
    mode: str


@router.post("/orders/{order_id}/pickup-mode")
def set_pickup_mode(order_id: str, body: PickupBody):
    if body.mode not in ("door", "station"):
        raise HTTPException(400, "수령 방식은 door 또는 station 이에요.")
    with Session(engine) as s:
        order = _get_order(s, order_id)
        if order.status == "COMPLETED":
            raise HTTPException(400, "이미 배송이 완료됐어요.")
        order.pickup_mode = body.mode
        s.add(order)
        s.commit()
        return orderflow.notifications(s, order)


class CancelBody(BaseModel):
    reason: str | None = None


@router.post("/orders/{order_id}/cancel")
def cancel_order(order_id: str, body: CancelBody | None = None):
    with Session(engine) as s:
        order = _get_order(s, order_id)
        if order.status in ("ON_TRAIN", "COMPLETED"):
            # 이미 열차에 실렸다 — 물리적으로 되돌릴 수 없다
            raise HTTPException(400, "이미 열차에 실려 취소할 수 없어요. 도착역 수령으로 바꿀 수는 있어요.")
        order.status = "CANCELLED"
        order.cancelled_reason = (body.reason if body and body.reason else "이용자 요청")
        s.add(order)
        s.commit()
        return {"ok": True, "status": order.status}


class HandoverBody(BaseModel):
    order_id: str
    seq: int
    code: str


@router.post("/handover")
def post_handover(body: HandoverBody):
    with Session(engine) as s:
        order = _get_order(s, body.order_id)
        if order.status == "CANCELLED":
            raise HTTPException(400, "취소된 접수예요.")
        err = orderflow.handover(s, order, body.seq, body.code)
        if err:
            raise HTTPException(400, err)
        return _order_payload(s, order)


@router.get("/proof/{order_id}")
def get_proof(order_id: str, client: str = "외부조회"):
    with Session(engine) as s:
        _get_order(s, order_id)   # 존재 확인 — 없는 접수번호는 404
        events = s.exec(select(ProofEvent).where(ProofEvent.order_id == order_id)
                        .order_by(ProofEvent.id)).all()
        # 같은 사업자가 24시간 안에 다시 보면 과금하지 않는다
        recent = s.exec(select(ProofAccess).where(
            ProofAccess.order_id == order_id, ProofAccess.client == client,
            ProofAccess.billable == True,  # noqa: E712
        )).all()
        now = utc_naive_now()
        billable = not any(a.at and now - a.at < timedelta(hours=24) for a in recent)
        s.add(ProofAccess(order_id=order_id, client=client, billable=billable, at=now))
        s.commit()
        return {
            "order_id": order_id, "verified": bool(events),
            "events": [{"type": e.type, "meaning": e.meaning, "actor": e.actor,
                        "occurred_at": e.occurred_at.isoformat() if e.occurred_at else None}
                       for e in events],
            "billing": {"unit_price_krw": 300, "billable": billable, "client": client},
        }
