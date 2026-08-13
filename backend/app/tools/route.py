"""3구간 경로 조립 — 편성마다 계획을 세워 종합확률이 가장 높은 것을 고른다.

불가하면 이유를 구분해서 말한다(같은 생활권 / 취급역 없음 / 시각 부족).
시각 부족의 제안은 반드시 실제 계획에서 뽑는다 — 별도 공식으로 계산하면
"16:00까지는 어렵다"면서 15:40 도착을 제안하는 모순이 생긴다.
"""
import math
from dataclasses import dataclass

from .. import tago
from ..clock import service_now, to_hhmm, to_min, today_yyyymmdd, try_min
from ..models import FALLBACK_NAMES
from ..seed.carriers import BY_ID
from ..seed.places import haversine_km, resolve
from ..seed.stations import STATIONS, Station
from . import match, probability
# 보상은 배분표(channels.SPLIT)에서만 나온다 — 숫자를 여기 적지 않는다
from .channels import RELAY_LEG_REWARD
from .probability import FLOOR, LegInput

DESK_CUTOFF_MIN = 30       # 창구 접수 마감 — 열차 출발 30분 전 (운영 규칙)
SAME_ZONE_KM = 40.0        # 이 미만이면 같은 생활권 — KTX 가 이점이 없다
MAX_STATION_KM = 60.0      # 가까운 취급역이 이보다 멀면 서비스 밖
ASSIGNED_BONUS = 0.025     # 배정 구간당 +2.5%p (두 구간 = 5%p) — 사람이 붙은 경로 선호.
                           # 5%p 넘게 나쁘면 미배정이 이긴다는 규칙의 구현
SUGGEST_MARGIN_MIN = 10    # 데드라인 제안 = eta + 여유 — 통상 지연의 대부분을 흡수하는 폭
SUGGEST_ROUND_MIN = 5      # 제안 시각은 5분 단위로 올림 — 17:03 같은 제안은 어색하다


@dataclass
class _Option:
    train: tago.Train
    dep_st: Station
    arr_st: Station
    legs: list          # [dict, dict, dict]
    combined: float
    adjusted: float
    eta_min: int
    slack_min: int


def _near_stations(pt: tuple, limit: int = 2) -> list[Station]:
    within = [(haversine_km(pt, (s.lat, s.lon)), s) for s in STATIONS]
    within = [x for x in within if x[0] <= MAX_STATION_KM]
    within.sort(key=lambda x: x[0])
    return [s for _, s in within[:limit]]


def _leg_input(dist_km: float, cand: match.Candidate | None, budget: float) -> LegInput:
    if cand is None:
        return probability.fallback_leg(dist_km, budget)
    return LegInput(dist_km + cand.detour_km, cand.carrier.mode,
                    cand.carrier.reliability, budget)


def _force_candidate(cid: str) -> match.Candidate | None:
    """시연용 수동 지정 — 신뢰도 대조를 위해 게이트를 거치지 않고 그대로 쓴다."""
    c = BY_ID.get(cid)
    if not c:
        return None
    return match.Candidate(c, 1.0, 0.0, 1.0,
                           f"수동 지정 · 신뢰도 {c.reliability * 100:.0f}%")


def _evaluate(train: tago.Train, dep_st: Station, arr_st: Station,
              o_pt: tuple, d_pt: tuple, deadline_min: int, now_min: int,
              force: dict) -> _Option | None:
    dep_min, arr_min = to_min(train.dep_time), to_min(train.arr_time)
    if arr_min <= dep_min:      # 자정 넘김 편성은 당일 배송이 아니다
        return None
    cutoff = dep_min - DESK_CUTOFF_MIN
    budget1 = cutoff - now_min                  # ①예산 = 창구 마감 − 지금 (운영 규칙 역산)
    budget3 = deadline_min - arr_min            # ③예산 = 데드라인 − 열차 도착
    if budget1 < probability.MIN_LEG_MIN or budget3 < probability.MIN_LEG_MIN:
        return None

    d1 = haversine_km(o_pt, (dep_st.lat, dep_st.lon))
    d3 = haversine_km((arr_st.lat, arr_st.lon), d_pt)

    # ①③ 후보를 전역(헝가리안) 배정 — 같은 사람이 두 구간을 못 맡는다
    leg3_start = arr_min + int(probability.HANDOVER_TYPICAL)
    queries = {
        1: match.LegQuery(o_pt, (dep_st.lat, dep_st.lon), now_min, cutoff),
        3: match.LegQuery((arr_st.lat, arr_st.lon), d_pt, leg3_start, deadline_min),
    }
    ranked = match.assign(queries)
    cands = {seq: (ranked[seq][0] if ranked[seq] else None) for seq in (1, 3)}
    for seq in (1, 3):
        forced = _force_candidate(force.get(str(seq), ""))
        if forced:
            cands[seq] = forced

    leg1 = _leg_input(d1, cands[1], budget1)
    leg3 = _leg_input(d3, cands[3], budget3)

    eta_min = arr_min + int(round(probability.typical_duration_min(leg3)))
    slack = deadline_min - eta_min
    r = probability.compute(leg1, "KTX", max(0, slack), leg3)
    combined = r.combined
    n_assigned = sum(1 for s in (1, 3) if cands[s] is not None)
    adjusted = combined + ASSIGNED_BONUS * n_assigned

    def leg_dict(seq: int) -> dict:
        if seq == 2:
            return {
                "seq": 2, "label": "② 출발역 → 도착역",
                "from_name": dep_st.name, "to_name": arr_st.name,
                "carrier_id": None, "carrier_name": None, "train_no": train.no,
                "start_at": train.dep_time, "end_at": train.arr_time,
                "probability": round(r.p2, 4), "assigned": True,
                "fallback": False, "fallback_note": "",
                "mode": "KTX", "carrier_type": None,
                "from_point": [dep_st.lat, dep_st.lon], "to_point": [arr_st.lat, arr_st.lon],
            }
        cand = cands[seq]
        p = r.p1 if seq == 1 else r.p3
        base = {
            "seq": seq,
            "label": "① 출발지 → 출발역" if seq == 1 else "③ 도착역 → 수령지",
            "from_name": "출발지" if seq == 1 else arr_st.name,
            "to_name": dep_st.name if seq == 1 else "수령지",
            "train_no": None,
            "start_at": to_hhmm(now_min if seq == 1 else leg3_start),
            "end_at": to_hhmm(cutoff if seq == 1 else eta_min),
            "probability": round(p, 4),
            # 운반자 교체(시연)가 이 좌표로 그 구간의 후보를 다시 조회한다
            "from_point": list(o_pt) if seq == 1 else [arr_st.lat, arr_st.lon],
            "to_point": [dep_st.lat, dep_st.lon] if seq == 1 else list(d_pt),
            "distance_km": round(d1 if seq == 1 else d3, 1),
            "mode": cand.carrier.mode if cand else "대중교통",
            "carrier_type": cand.carrier.type if cand else None,
        }
        if cand:
            base.update(carrier_id=cand.carrier.id, carrier_name=cand.carrier.name,
                        assigned=True, fallback=False, fallback_note="",
                        match_reason=cand.reason, reward=RELAY_LEG_REWARD)
        else:
            # 미배정 — 대체 경로(집앞 픽업)로 계산했고, 화면에도 그렇게 말한다.
            # 계약 주체가 일하므로 보상 0
            base.update(carrier_id=None, carrier_name=FALLBACK_NAMES[seq],
                        assigned=False, fallback=True, reward=0,
                        fallback_note="주변에 맞는 운반자가 없어 픽업 서비스로 계산했어요. 추가 요금은 없습니다.")
        return base

    return _Option(train, dep_st, arr_st,
                   [leg_dict(1), leg_dict(2), leg_dict(3)],
                   combined, adjusted, eta_min, slack)


MAX_TRAINS_PER_PAIR = 8   # 페어당 평가 편성 상한 — 없으면 시드 250건 생성이 수 분 걸린다


def _options(o_pt, d_pt, deadline_min, now_min, force) -> tuple[list[_Option], bool]:
    """평가 가능한 모든 편성 계획. 두 번째 값은 '시간표를 받긴 했는가'."""
    today = today_yyyymmdd()
    opts: list[_Option] = []
    got_any = False
    for dep_st in _near_stations(o_pt):
        for arr_st in _near_stations(d_pt):
            if dep_st.code == arr_st.code:
                continue
            trains = tago.trains_between(dep_st.code, arr_st.code, today)
            if trains:
                got_any = True
            # 시각으로 미리 거르고(싼 계산), 남으면 늦게 출발하는 순으로 상한을 건다 —
            # 늦은 편성이 ①예산이 커 대체로 유리하고, 이른 편성도 2개는 남겨 비교한다
            viable = [t for t in trains
                      if to_min(t.dep_time) - DESK_CUTOFF_MIN - now_min >= probability.MIN_LEG_MIN
                      and deadline_min - to_min(t.arr_time) >= probability.MIN_LEG_MIN]
            if len(viable) > MAX_TRAINS_PER_PAIR:
                viable = viable[:2] + viable[-(MAX_TRAINS_PER_PAIR - 2):]
            for tr in viable:
                opt = _evaluate(tr, dep_st, arr_st, o_pt, d_pt, deadline_min, now_min, force)
                if opt:
                    opts.append(opt)
    return opts, got_any


def _suggestions(o_pt, d_pt, now_min, force, count=3) -> list[dict]:
    """가능한 데드라인 제안 — 실제 계획을 넉넉한 데드라인으로 세워 eta 에서 뽑되,
    제안할 데드라인으로 그 편성을 **다시 평가해 성립하는 것만** 내보낸다.

    여유가 줄면 ③예산이 좁아져 같은 편성도 확률 하한 아래로 떨어질 수 있다 —
    특히 밤 시간대는 운반자 활동이 끝나 대체 경로(+25분)로 계산되므로 eta+10분이
    안 성립한다. 검증 없이 내보냈더니 "21:10까지는 어려워요. 21:10으로 잡으시면
    보낼 수 있어요"라는 자기모순 안내가 실제로 나갔다.

    같은 데드라인은 eta 가 가장 이른 편성(여유 최대)으로만 한 번 검증한다 —
    그 편성이 안 되면 더 늦게 도착하는 편성은 더 안 된다."""
    opts, _ = _options(o_pt, d_pt, 24 * 60 - 1, now_min, force)
    out, seen = [], set()
    for opt in sorted(opts, key=lambda x: x.eta_min):
        need = opt.eta_min + SUGGEST_MARGIN_MIN
        dl = math.ceil(need / SUGGEST_ROUND_MIN) * SUGGEST_ROUND_MIN
        if dl in seen or dl >= 24 * 60:
            continue
        seen.add(dl)
        v = _evaluate(opt.train, opt.dep_st, opt.arr_st, o_pt, d_pt, dl, now_min, force)
        if v is None or v.combined < FLOOR:
            continue
        out.append({"deadline": to_hhmm(dl), "eta": to_hhmm(v.eta_min),
                    "train_no": v.train.no, "label": to_hhmm(dl)})
        if len(out) >= count:
            break
    return out


def build(origin: str, destination: str, deadline: str,
          now: str | None = None, force_carriers: dict | None = None,
          with_suggestions: bool = True) -> dict:
    # 키를 문자열로 정규화 — 라우터(JSON)는 "1", 내부 호출은 1 로 준다
    force = {str(k): v for k, v in (force_carriers or {}).items()}
    now_min = try_min(now) if now else service_now()
    if now_min is None:
        now_min = service_now()
    deadline_min = try_min(deadline)
    if deadline_min is None:
        return {"feasible": False, "reason": "데드라인 시각을 읽지 못했어요. \"18:00\"처럼 적어 주세요."}

    o_pt, d_pt = resolve(origin), resolve(destination)
    if not o_pt or not d_pt:
        missing = origin if not o_pt else destination
        return {"feasible": False, "need_place": True,
                "reason": f"'{missing}' 위치를 못 찾았어요. 시·군·구를 함께 적어 주세요."}

    if haversine_km(o_pt, d_pt) < SAME_ZONE_KM:
        return {"feasible": False,
                "reason": "이 거리는 KTX보다 퀵·택배가 빠르고 쌉니다. 같은 생활권 배송은 퀵서비스를 권해요."}

    if not _near_stations(o_pt) or not _near_stations(d_pt):
        return {"feasible": False, "reason": "근처에 특송을 취급하는 KTX역이 없어요."}

    opts, got_any = _options(o_pt, d_pt, deadline_min, now_min, force)
    # 종합확률 5% 미만 경로는 목록에 올리지 않는다 — 0%짜리를 파는 것이 된다
    viable = [o for o in opts if o.combined >= FLOOR]
    if not viable:
        if not got_any:
            st = tago.client.state
            reason = ("오늘 시간표를 받지 못했어요. 공공데이터 연동 상태를 확인해 주세요."
                      if st != "ready" else "오늘 운행하는 KTX 편성이 없어요.")
            return {"feasible": False, "reason": reason, "tago_state": st}
        sugg = _suggestions(o_pt, d_pt, now_min, force) if with_suggestions else []
        if sugg:
            times = " · ".join(s["deadline"] for s in sugg)
            reason = f"{deadline}까지는 어려워요. {times}까지로 잡으시면 보낼 수 있어요."
        else:
            reason = "오늘 안에 보낼 수 있는 편성이 없어요. 내일 첫차 편으로 접수해 주세요."
        return {"feasible": False, "reason": reason, "suggestions": sugg}

    best = max(viable, key=lambda x: x.adjusted)
    return {
        "feasible": True,
        "combined_probability": round(best.combined, 4),
        "eta": to_hhmm(best.eta_min),
        "deadline": to_hhmm(deadline_min),
        "slack_min": best.slack_min,
        "train_no": best.train.no,
        "dep_station": best.dep_st.name, "arr_station": best.arr_st.name,
        "dep_code": best.dep_st.code, "arr_code": best.arr_st.code,
        "desk_cutoff": to_hhmm(to_min(best.train.dep_time) - DESK_CUTOFF_MIN),
        "legs": best.legs,
        "fallback_used": [leg["seq"] for leg in best.legs if leg.get("fallback")],
        "iterations": probability.iterations(),
        "origin": origin, "destination": destination,
        "now": to_hhmm(now_min),
    }
