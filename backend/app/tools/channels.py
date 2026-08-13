"""4채널 비교 — 같은 열차, 다른 것은 역까지 어떻게 가느냐와 언제까지 접수하느냐뿐.

채널마다 탈 수 있는 열차가 다르다 — 도착 후 수령 시간이 달라서다. 계획이 고른
한 편성으로만 재면 창구가 "데드라인을 못 맞춰요"로 뜨는데 실제로는 한 시간 이른
열차로 충분히 간다. 채널별로 자기가 탈 수 있는 편성 중 가장 늦은 것을 고른다
(늦게 탈수록 마감이 여유롭다).
"""
from dataclasses import dataclass

from .. import tago
from ..clock import to_hhmm, to_min, today_yyyymmdd
from ..seed import tariff
from . import probability
from .probability import LegInput

# ── 채널 추가분과 배분 — 합계가 다르면 import 가 실패한다 ──────────────
# 숫자가 두 곳에 있으면 조용히 어긋난다. 여기 한 곳뿐이다.
SURCHARGE: dict[str, int] = {"desk": 1_000, "locker": 1_000, "relay": 3_000, "fullmile": 7_000}

SPLIT: dict[str, dict[str, int]] = {
    "desk": {"플랫폼": 1_000},
    "locker": {"무인함": 700, "플랫폼": 300},
    "relay": {"①운반자": 1_200, "③운반자": 1_200, "보험·보증 적립": 400, "플랫폼": 200},
    "fullmile": {"픽업사업자": 5_500, "플랫폼": 1_500},
}

for ch, split in SPLIT.items():
    if sum(split.values()) != SURCHARGE[ch]:
        raise ValueError(f"{ch} 배분 합계 {sum(split.values())} ≠ 추가분 {SURCHARGE[ch]}")

RELAY_LEG_REWARD = SPLIT["relay"]["①운반자"]  # 구간 보상 표시는 배분표에서만 나온다

# 접수 마감(열차 출발 기준, 분) — desk 30 은 실측(공시), 나머지는 운영 가정
CUTOFF_LEAD = {"desk": 30, "locker": 100, "fullmile": 190}
RELAY_LEAD_DEFAULT = 130      # 계획이 없을 때 대표값: ①구간 실소요 + 30 의 통상치

# 도착 후 수령까지(분) — 창구·무인함은 역으로 나와야 하고, 릴레이·픽업은 집앞
PICKUP_AFTER = {"desk": 55, "locker": 55, "relay": 15, "fullmile": 15}

MATCH_RISK = 0.05             # 시민 운반 매칭 실패 리스크 — 가정 (파일럿 실측 대상)
LOCKER_RISK = 0.03            # 무인함 회수 주기 대기 리스크 — 가정

NAMES = {"desk": "KTX특송 창구", "locker": "역사 무인함", "relay": "시민 운반",
         "fullmile": "기사 방문 픽업"}


def cap(p: float) -> float:
    return min(0.99, max(0.0, p))


@dataclass
class _Pick:
    train: tago.Train
    cutoff_min: int
    eta_min: int


def _pick_train(trains: list[tago.Train], lead_min: int, after_min: int,
                deadline_min: int, now_min: int) -> tuple[_Pick | None, str]:
    """채널이 탈 수 있는 편성 중 가장 늦은 것. 없으면 (None, 사유)."""
    fits_deadline = [t for t in trains
                     if to_min(t.arr_time) + after_min <= deadline_min
                     and to_min(t.arr_time) > to_min(t.dep_time)]
    if not fits_deadline:
        return None, "이 채널의 수령 방식으로는 데드라인을 맞출 수 없어요"
    open_now = [t for t in fits_deadline if to_min(t.dep_time) - lead_min >= now_min]
    if not open_now:
        return None, "접수 마감이 지났어요"
    t = max(open_now, key=lambda t: to_min(t.dep_time))
    return _Pick(t, to_min(t.dep_time) - lead_min, to_min(t.arr_time) + after_min), ""


def compare(plan: dict, item: str | None, declared_value: int | None,
            deadline: str, now_min: int) -> list[dict]:
    """4채널 카드. plan 은 feasible 한 RoutePlan — 역·relay 확률은 계획에서 가져온다.

    /api/route 결과와 모순되면 안 된다: 경로가 96%라는데 채널 카드가 같은 건을
    "마감 지났어요"라고 하면 안 된다. relay 마감은 계획의 ①구간 실소요에서 역산한다.
    """
    deadline_min = to_min(deadline)
    dep_code, arr_code = plan["dep_code"], plan["arr_code"]
    trains = tago.trains_between(dep_code, arr_code, today_yyyymmdd())
    base, base_lines = tariff.base_fare(item, dep_code, arr_code, declared_value)

    # relay 마감은 계획에서 역산 — ①구간 실소요(now→창구마감) + 30분 여유
    leg1 = plan["legs"][0]
    relay_lead = (to_min(leg1["end_at"]) - to_min(leg1["start_at"])) + 30 \
        if plan.get("feasible") else RELAY_LEAD_DEFAULT

    relay_blocked_by_value = bool(declared_value and declared_value > tariff.RELAY_VALUE_MAX)

    out = []
    for ch in ("desk", "locker", "relay", "fullmile"):
        lead = CUTOFF_LEAD.get(ch, relay_lead)
        after = PICKUP_AFTER[ch]
        pick, why = _pick_train(trains, lead, after, deadline_min, now_min)

        fare = base + SURCHARGE[ch]
        fare_lines = base_lines + [{"label": f"채널 추가 ({NAMES[ch]})", "amount": SURCHARGE[ch]}]
        card = {
            "id": ch, "name": NAMES[ch],
            "fare": fare, "fare_label": f"{fare:,}원", "fare_lines": fare_lines,
            "door_to_door": ch in ("relay", "fullmile"),
            "badge": "", "probability_note": "",
        }

        if ch == "relay" and relay_blocked_by_value:
            card.update(feasible=False,
                        blocked_reason="신고가액 200만원 초과 물품은 시민 운반으로 보낼 수 없어요. 창구·픽업을 이용해 주세요.",
                        probability=0.0, probability_label="—", cutoff="", eta="", train_no="")
            out.append(card)
            continue
        if pick is None:
            card.update(feasible=False, blocked_reason=why, probability=0.0,
                        probability_label="—", cutoff="", eta="", train_no="")
            out.append(card)
            continue

        slack = deadline_min - pick.eta_min
        p_train = probability.train_probability("KTX", max(0, slack))
        if ch == "desk":
            p = cap(p_train)
        elif ch == "locker":
            p = cap(p_train * (1 - LOCKER_RISK))
        elif ch == "fullmile":
            # 양 끝단이 픽업 사업자 — 대체 경로와 같은 분포(신뢰도 0.92)로 계산한다
            b1 = pick.cutoff_min - now_min
            b3 = deadline_min - to_min(pick.train.arr_time)
            p1 = probability.leg_probability(probability.fallback_leg(3.0, b1))
            p3 = probability.leg_probability(probability.fallback_leg(3.0, b3))
            p = cap(p1 * p_train * p3)
        else:  # relay — 계획의 종합확률에 매칭 리스크를 얹어 범위로 말한다
            p_base = plan["combined_probability"] if plan.get("feasible") else 0.0
            p = cap(p_base * (1 - MATCH_RISK))
            lo, hi = cap(p - 0.04), cap(p + 0.04)
            card["probability_label"] = f"{lo * 100:.0f}~{hi * 100:.0f}"
            card["probability_note"] = "매칭 후 확정"

        # relay 는 계획이 이미 편성·eta 를 골랐다 — 카드가 계획과 다른 말을 하면 안 된다
        if ch == "relay" and plan.get("feasible"):
            eta_min, train_no = to_min(plan["eta"]), plan["train_no"]
        else:
            eta_min, train_no = pick.eta_min, pick.train.no
        card.update(
            feasible=True, blocked_reason="",
            probability=round(p, 4),
            probability_label=card.get("probability_label") or f"{p * 100:.0f}",
            cutoff=to_hhmm(pick.cutoff_min),
            eta=to_hhmm(eta_min),
            slack_min=deadline_min - eta_min,
            train_no=train_no,
        )
        out.append(card)

    # 뱃지 — 선택 가능한 채널에만. 추천 = 확률 최고(문전 우선), 최저가 = 운임 최저
    feas = [c for c in out if c["feasible"]]
    if feas:
        best = max(feas, key=lambda c: (c["probability"], c["door_to_door"]))
        best["badge"] = "추천"
        cheapest = min(feas, key=lambda c: c["fare"])
        if not cheapest["badge"]:
            cheapest["badge"] = "최저가"
    return out
