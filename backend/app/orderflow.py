"""주문 흐름 비즈니스 로직 — 접수 확정·배차 콜·대체 경로 전환·인계·알림.

라우터(routers/orders.py)는 얇게 두고 규칙은 전부 여기에 모은다.
"""
import json
import os
import random
import uuid
from datetime import timedelta

from sqlmodel import Session, select

from .clock import service_now, to_hhmm, to_min, utc_naive_now
from .models import Call, Leg, Order, ProofEvent
from .seed.carriers import BY_ID
from .seed.places import haversine_km, resolve
from .seed.stations import BY_CODE
from .tools import match, probability
from .tools.channels import RELAY_LEG_REWARD
from .tools.probability import LegInput

CALL_TIMEOUT_SEC = 90   # 우버는 15초지만 우리 운반자는 출근길에 걷고 있다

# 대체 경로 담당 표시명 — 한 곳에만 적는다. 화면·채널·전환이 전부 이 이름을 쓴다
FALLBACK_NAMES = {1: "픽업 기사", 3: "배송 기사"}

PROOF_MEANING = {
    "RECEIVED": "물품이 실재하며 발송 절차가 개시됨",
    "IN_TRANSIT": "역 창구 인계 · 열차 탑재, 간선 운송 중",
    "DELIVERED": "수령이 완료됨",
}


def demo_mode() -> bool:
    return os.getenv("DEMO_MODE", "").lower() == "true"


def new_order_id(s: Session) -> str:
    from .clock import now_kst
    day = now_kst().strftime("%y%m%d")
    n = len(s.exec(select(Order.id)).all()) + 1
    return f"TP{day}{n:04d}"


def _code() -> str:
    return f"{random.randint(0, 999999):06d}"


# ── 대체 경로 전환 — 전환 함수는 하나다 ─────────────────────────────────
def to_fallback(leg: Leg, reason: str):
    """구간 자체를 대체 경로로 전환한다.

    확률만 대체 경로로 계산하고 Leg 를 그대로 두면 accepted=False 로 남아 콜도
    인계도 열리지 않고 진행 화면이 영영 '수락 대기'가 된다 (실제로 당한 사고).
    accepted=True — 계약된 기사라 수락 절차가 없다. reward=0.
    운임은 그대로 — 전환은 이용자의 선택이 아니라 우리 사정이다.
    호출 지점 세 곳: 접수 시점(계획이 이미 미배정) · 거절로 줄이 마를 때 · 만료로 줄이 마를 때.
    """
    leg.carrier_id = None
    leg.carrier_name = FALLBACK_NAMES.get(leg.seq, "담당 기사")
    leg.accepted = True
    leg.reward = 0
    leg.fallback = True
    leg.fallback_note = reason
    if not leg.handover_code:
        leg.handover_code = _code()


# ── 배차 콜 ────────────────────────────────────────────────────────────
def _leg_query(order: Order, leg: Leg) -> match.LegQuery | None:
    """콜 후보 재계산용 쿼리 — 계획 스냅샷에서 좌표·시각을 복원한다."""
    plan = json.loads(order.plan_json)
    o_pt, d_pt = resolve(order.origin), resolve(order.destination)
    dep = BY_CODE.get(plan.get("dep_code", ""))
    arr = BY_CODE.get(plan.get("arr_code", ""))
    if not (o_pt and d_pt and dep and arr):
        return None
    if leg.seq == 1:
        return match.LegQuery(o_pt, (dep.lat, dep.lon), to_min(leg.start_at), to_min(leg.end_at))
    return match.LegQuery((arr.lat, arr.lon), d_pt, to_min(leg.start_at), to_min(leg.end_at))


def issue_next_call(s: Session, order: Order, leg: Leg) -> Call | None:
    """다음 순위 후보에게 콜 발행. 후보가 마르면 구간을 대체 경로로 전환하고 None."""
    q = _leg_query(order, leg)
    called = {c.carrier_id for c in s.exec(
        select(Call).where(Call.order_id == order.id, Call.seq == leg.seq)).all()}
    ranked = [c for c in (match.rank(q) if q else []) if c.carrier.id not in called]
    if not ranked:
        to_fallback(leg, "주변 운반자가 모두 응답하지 않아 픽업 서비스로 전환했어요. 추가 요금은 없습니다.")
        s.add(leg)
        return None
    cand = ranked[0]
    call = Call(
        id=uuid.uuid4().hex[:12], order_id=order.id, seq=leg.seq,
        carrier_id=cand.carrier.id, carrier_name=cand.carrier.name,
        rank=len(called) + 1, reward=RELAY_LEG_REWARD,
        detour_km=cand.detour_km, score=cand.score, match_reason=cand.reason,
        status="RINGING", created_at=utc_naive_now(),
        expires_at=utc_naive_now() + timedelta(seconds=CALL_TIMEOUT_SEC),
    )
    s.add(call)
    return call


def refresh_calls(s: Session, order: Order):
    """조회 시점에 만료를 정리하는 refresh 패턴 — 백그라운드 작업 금지(배포 단순성).

    만료된 콜은 EXPIRED 로 바꾸고 다음 순위에게 발행한다. 줄이 마르면 전환.
    """
    if order.status == "CANCELLED":
        return
    legs = s.exec(select(Leg).where(Leg.order_id == order.id)).all()
    now = utc_naive_now()
    for leg in legs:
        if leg.seq == 2 or leg.accepted:
            continue
        ringing = s.exec(select(Call).where(
            Call.order_id == order.id, Call.seq == leg.seq, Call.status == "RINGING")).all()
        has_live = False
        for c in ringing:
            if c.expires_at and c.expires_at < now:
                c.status = "EXPIRED"
                s.add(c)
            else:
                has_live = True
        if not has_live:
            issue_next_call(s, order, leg)
    s.commit()


def respond_call(s: Session, call: Call, accept: bool) -> str:
    """수락 → 구간 확정. 거절 → 다음 순위 (불이익 없음 — 신뢰도에도 반영하지 않는다.
    불이익을 두면 업무 지시가 되어 근로자성 판단이 뒤집힌다)."""
    if call.status != "RINGING":
        return "이미 처리된 콜이에요"
    order = s.get(Order, call.order_id)
    leg = s.exec(select(Leg).where(Leg.order_id == call.order_id,
                                   Leg.seq == call.seq)).first()
    if accept:
        call.status = "ACCEPTED"
        carrier = BY_ID.get(call.carrier_id)
        leg.carrier_id = call.carrier_id
        leg.carrier_name = carrier.name if carrier else call.carrier_name
        leg.accepted = True
        leg.reward = call.reward
        leg.fallback = False
        leg.fallback_note = ""
        s.add(call)
        s.add(leg)
        s.commit()
        return ""
    call.status = "REJECTED"
    s.add(call)
    s.commit()
    if not leg.accepted:
        issue_next_call(s, order, leg)
        s.commit()
    return ""


# ── 인계 ───────────────────────────────────────────────────────────────
_STATUS_AFTER = {1: "PICKED_UP", 2: "ON_TRAIN", 3: "COMPLETED"}
_PROOF_AFTER = {1: "RECEIVED", 2: "IN_TRANSIT", 3: "DELIVERED"}


def handover(s: Session, order: Order, seq: int, code: str) -> str:
    """반환: 빈 문자열이면 성공, 아니면 사람이 읽을 오류 문구 (400 detail)."""
    legs = {leg.seq: leg for leg in s.exec(select(Leg).where(Leg.order_id == order.id)).all()}
    leg = legs.get(seq)
    if not leg:
        return "없는 구간이에요"
    if leg.handed_over:
        return "이미 인계된 구간이에요"
    if not leg.accepted:
        return "아직 운반자가 수락하지 않은 구간이에요"
    # 순서 건너뜀 — ②가 ①보다 먼저 인계될 수 없다
    for prev in range(1, seq):
        if not legs[prev].handed_over:
            return f"{prev}구간이 아직 인계되지 않았어요. 순서대로 진행해 주세요"
    # 마스터 코드 000000 은 DEMO_MODE 에서만 — 실운영에서 열리면 아무나 남의 물건을
    # 인계 처리한다. 파는 것이 '증명'인데 증명의 관문이 000000 이 되면 안 된다
    if code != leg.handover_code and not (demo_mode() and code == "000000"):
        return "인계 코드가 일치하지 않아요"

    leg.handed_over = True
    # 서비스 기준 시계로 저장 — 계획(end_at)과 빼야 하므로 벽시계면 DEMO_TIME 에서 어긋난다
    leg.handed_over_at = to_hhmm(service_now())
    order.status = _STATUS_AFTER[seq]
    s.add(leg)
    s.add(order)
    s.add(ProofEvent(order_id=order.id, type=_PROOF_AFTER[seq],
                     meaning=PROOF_MEANING[_PROOF_AFTER[seq]],
                     actor=leg.carrier_name or leg.train_no or "",
                     occurred_at=utc_naive_now()))
    s.commit()
    return ""


# ── 접수 확정 ──────────────────────────────────────────────────────────
def create_order(s: Session, plan: dict, body: dict, fare: int) -> tuple[Order, list[Leg]]:
    """plan 은 feasible 한 RoutePlan. 동의 검증은 라우터가 이미 했다."""
    order = Order(
        id=new_order_id(s),
        origin=body["origin"], destination=body["destination"],
        item=body.get("item"), declared_value=body.get("declared_value"),
        deadline=plan["deadline"], eta=plan["eta"], train_no=plan["train_no"],
        fare=fare, probability=plan["combined_probability"],
        channel=body["channel"], status="ACCEPTED",
        plan_json=json.dumps(plan, ensure_ascii=False),
        recipient_name=body.get("recipient_name", ""),
        recipient_phone=body.get("recipient_phone", ""),
        notice_consent=True, recipient_consent=True,
        relay_consent=body["channel"] != "relay" or body.get("relay_consent", False),
        consent_at=utc_naive_now(),
        created_at=utc_naive_now(),
    )
    s.add(order)

    legs: list[Leg] = []
    for leg_d in plan["legs"]:
        leg = Leg(
            order_id=order.id, seq=leg_d["seq"], label=leg_d["label"],
            from_name=leg_d["from_name"], to_name=leg_d["to_name"],
            carrier_id=leg_d.get("carrier_id"), carrier_name=leg_d.get("carrier_name"),
            train_no=leg_d.get("train_no"),
            start_at=leg_d["start_at"], end_at=leg_d["end_at"],
            probability=leg_d["probability"], handover_code=_code(),
            accepted=leg_d["seq"] == 2,   # ②구간(KORAIL)은 수락 절차가 없다
            reward=leg_d.get("reward", 0),
        )
        if leg.seq != 2:
            if body["channel"] == "relay":
                if not leg_d.get("assigned"):
                    # 접수 시점에 이미 미배정 — 즉시 전환 (첫 번째 호출 지점)
                    to_fallback(leg, "주변에 맞는 운반자가 없어 픽업 서비스로 전환했어요. 추가 요금은 없습니다.")
            elif body["channel"] in ("desk", "locker"):
                # 창구·무인함은 이용자가 직접 역까지 — 수락 절차가 없다
                leg.carrier_id = None
                leg.carrier_name = "본인"
                leg.accepted = True
                leg.reward = 0
            else:  # fullmile — 계약된 픽업 사업자
                leg.carrier_id = None
                leg.carrier_name = FALLBACK_NAMES[leg.seq]
                leg.accepted = True
                leg.reward = 0
        legs.append(leg)
        s.add(leg)
    s.commit()

    # relay 는 배정된 ①③구간에 1순위 콜 발행
    if body["channel"] == "relay":
        for leg in legs:
            if leg.seq != 2 and not leg.accepted:
                issue_next_call(s, order, leg)
        s.commit()
    for leg in legs:
        s.refresh(leg)
    s.refresh(order)
    return order, legs


# ── 알림 타임라인 ──────────────────────────────────────────────────────
def _leg3_input(order: Order, extra_budget_cut: float = 0.0) -> LegInput:
    """운송 중 확률 계산용 ③구간 입력 — 계획 스냅샷에서 복원한다."""
    plan = json.loads(order.plan_json)
    arr_st = BY_CODE.get(plan["arr_code"])
    d_pt = resolve(order.destination)
    dist = haversine_km((arr_st.lat, arr_st.lon), d_pt) if (arr_st and d_pt) else 3.0
    leg3 = plan["legs"][2]
    carrier = BY_ID.get(leg3.get("carrier_id") or "")
    train_arr = to_min(plan["legs"][1]["end_at"])
    budget = to_min(order.deadline) - train_arr - extra_budget_cut
    if order.pickup_mode == "station":
        # 역 수령 — 라스트마일이 창구 수령 대기(약 5분)로 줄어든다
        return LegInput(0.2, "도보", 0.97, budget)
    if carrier:
        return LegInput(dist, carrier.mode, carrier.reliability, budget)
    return probability.fallback_leg(dist, budget)


def notifications(s: Session, order: Order) -> dict:
    """접수부터 현재까지 — 아직 일어나지 않은 일은 알리지 않는다 (기록이지 시나리오가 아니다)."""
    plan = json.loads(order.plan_json)
    legs = {leg.seq: leg for leg in s.exec(select(Leg).where(Leg.order_id == order.id)).all()}
    train_arr = to_min(plan["legs"][1]["end_at"])
    out: list[dict] = []

    def add(type_, title, at, body_, eta=None, prob=None, action=""):
        out.append({"seq": len(out) + 1, "type": type_, "title": title, "at": at,
                    "body": body_, "eta": eta, "probability": prob, "action": action})

    # 접수 — 시각은 계획의 ①구간 시작 시각에서. 고정 문자열·벽시계면 시간이 거꾸로 찍힌다
    add("ACCEPTED", "접수 확인", plan["legs"][0]["start_at"],
        f"{plan['dep_station']} 출발 {order.train_no} 편으로 접수됐어요. "
        f"창구 마감 {plan.get('desk_cutoff', '')} 이전이라 여유가 있어요.",
        eta=order.eta, prob=order.probability)

    if legs[1].handed_over:
        add("PICKED_UP", "물품 수취", legs[1].handed_over_at or legs[1].end_at,
            f"{legs[1].carrier_name}님이 물품을 수취해 {plan['dep_station']}로 이동 중이에요.")

    loaded = legs[2].handed_over
    delay = order.delay_min if loaded else 0
    eta_now = prob_now = None
    if loaded:
        at = legs[2].handed_over_at or legs[2].start_at
        leg3_typ = probability.typical_duration_min(_leg3_input(order))
        eta0 = train_arr + int(round(leg3_typ))
        p0 = probability.in_transit_probability(_leg3_input(order), None)
        add("LOADED", "탑재 완료", at,
            f"{order.train_no} 열차에 실렸어요. {plan['arr_station']} {plan['legs'][1]['end_at']} 도착 예정이에요.",
            eta=to_hhmm(eta0), prob=round(p0, 4))
        eta_now, prob_now = to_hhmm(eta0), round(p0, 4)

        if delay > 0:
            # 지연 후 갈래 — 지연 전과 같은 분포 함수를 부른다 (in_transit_probability)
            eta_d = eta0 + delay
            p_d = probability.in_transit_probability(_leg3_input(order), float(delay))
            action = ""
            if order.pickup_mode == "door":
                # 역 수령 전환 대안 — 라스트마일 55분→5분급으로 준다
                station_eta = train_arr + delay + 5
                if to_hhmm(station_eta) <= order.deadline:
                    p_st = probability.in_transit_probability(
                        LegInput(0.2, "도보", 0.97, to_min(order.deadline) - train_arr), float(delay))
                    action = (f"도착역에서 직접 수령하면 시간을 맞출 수 있어요 "
                              f"(도착 {to_hhmm(station_eta)} · {p_st * 100:.0f}%)")
                else:
                    action = (f"{order.deadline}까지는 어렵습니다. 역 수령 시 "
                              f"{to_hhmm(station_eta)}이 가장 빠릅니다.")
            add("DELAY", "지연 안내", to_hhmm(service_now()),
                f"열차가 {delay}분 지연되고 있어요. 도착 예정이 {to_hhmm(eta_d)}로 밀렸어요.",
                eta=to_hhmm(eta_d), prob=round(p_d, 4), action=action)
            eta_now, prob_now = to_hhmm(eta_d), round(p_d, 4)

        if order.pickup_mode == "station" and not legs[3].handed_over:
            eta_st = train_arr + delay + 5
            p_st = probability.in_transit_probability(_leg3_input(order), float(delay) if delay else None)
            add("RECOVERED", "역 수령 전환", to_hhmm(service_now()),
                f"{plan['arr_station']} 창구에서 직접 수령으로 바꿨어요. 도착하면 바로 받을 수 있어요.",
                eta=to_hhmm(eta_st), prob=round(p_st, 4))
            eta_now, prob_now = to_hhmm(eta_st), round(p_st, 4)

    if legs[3].handed_over:
        add("DELIVERED", "배송 완료", legs[3].handed_over_at or legs[3].end_at,
            f"{legs[3].carrier_name}님이 전달을 완료했어요. 이용해 주셔서 감사합니다.")
        eta_now = legs[3].handed_over_at
        prob_now = None

    if order.status == "CANCELLED":
        add("CANCELLED", "접수 취소", to_hhmm(service_now()), "접수가 취소됐어요.")

    # 화살표 — 직전 값과 비교해서 정한다. 문턱 0.005
    prev = None
    for n in out:
        if n["probability"] is None:
            n["trend"] = "flat"
            continue
        if prev is None or abs(n["probability"] - prev) < 0.005:
            n["trend"] = "flat"
        else:
            n["trend"] = "up" if n["probability"] > prev else "down"
        prev = n["probability"]

    status_labels = {"ACCEPTED": "접수 완료", "PICKED_UP": "수취 완료", "ON_TRAIN": "운송 중",
                     "COMPLETED": "배송 완료", "CANCELLED": "취소됨"}
    return {
        "status": order.status, "status_label": status_labels.get(order.status, order.status),
        "delay_min": order.delay_min,
        # 탑재 전에는 확률을 만들지 않는다 — 열차에 싣지도 않았는데 열차가 늦었다고 할 수 없다
        "eta_now": eta_now if loaded or legs[3].handed_over else None,
        "probability_now": prob_now if loaded and not legs[3].handed_over else None,
        "delay_applies": loaded and not legs[3].handed_over,
        "pickup_mode": order.pickup_mode,
        "notifications": out,
    }
