"""운반자 매칭 — 게이트(하드컷) → 점수 → 헝가리안 전역 배정.

SciPy 를 넣지 않는다 — 헝가리안 한 함수 때문에 40MB 를 넣지 않는다.
직접 구현하고, 3×3 이하 무작위 행렬 200개를 완전탐색과 대조하는 테스트를 둔다.
같은 사람이 ①과 ③을 동시에 맡으면 안 되므로 구간별 그리디가 아니라 전역 배정이다.
"""
import math
from dataclasses import dataclass

from ..clock import to_min
from ..seed.carriers import CARRIERS, Carrier
from ..seed.places import haversine_km

MAX_DETOUR_KM = 3.0


@dataclass(frozen=True)
class LegQuery:
    from_pt: tuple      # (lat, lon)
    to_pt: tuple
    start_min: int      # 구간 시작 시각(분)
    end_min: int        # 구간 마감 시각(분)


@dataclass(frozen=True)
class Candidate:
    carrier: Carrier
    score: float
    detour_km: float
    overlap: float
    reason: str         # 화면·콜 카드에 그대로 나간다


def _bearing(a: tuple, b: tuple) -> float:
    return math.atan2(b[1] - a[1], b[0] - a[0])


# 운반자 정적값(방위·직행거리·활동 분)을 한 번만 계산해 둔다 —
# 편성마다 380명 전수 기하 계산을 반복하면 경로 탐색이 수 초, 시드 생성이 수 분 걸린다
_STATIC: dict[str, tuple[float, float, int, int]] = {}


def _static(c: Carrier) -> tuple[float, float, int, int]:
    got = _STATIC.get(c.id)
    if got is None:
        got = (_bearing(c.route_from, c.route_to),
               haversine_km(c.route_from, c.route_to),
               to_min(c.active_from), to_min(c.active_to))
        _STATIC[c.id] = got
    return got


def _gates(c: Carrier, q: LegQuery, q_bearing: float, q_km: float) -> tuple[float, float] | None:
    """게이트 셋: 활동 시간대 / 동선 방향 / 우회 3km 이하. 통과하면 (우회, 방향합)."""
    ca, direct, a_from, a_to = _static(c)
    # 활동 시간대 안인가 — 시작과 마감이 모두 창 안이어야 한다
    if not (a_from <= q.start_min and q.end_min <= a_to):
        return None
    # 동선 방향이 맞는가 — 반대로 가는 사람에게 얹으면 배송이 아니라 심부름이다
    cos_sim = math.cos(ca - q_bearing)
    if cos_sim <= 0:
        return None
    # 우회 부담 — 원래 동선 대비 늘어나는 거리
    via = (haversine_km(c.route_from, q.from_pt)
           + q_km
           + haversine_km(q.to_pt, c.route_to))
    detour = max(0.0, via - direct - q_km)
    if detour > MAX_DETOUR_KM:
        return None
    return detour, cos_sim


def rank(q: LegQuery) -> list[Candidate]:
    """게이트 통과자를 점수 내림차순으로. 점수 = 중첩도·시간대·방향·신뢰도·우회의 가중합."""
    leg_km = haversine_km(q.from_pt, q.to_pt)
    q_bearing = _bearing(q.from_pt, q.to_pt)
    out: list[Candidate] = []
    for c in CARRIERS:
        gate = _gates(c, q, q_bearing, leg_km)
        if gate is None:
            continue
        detour, cos_sim = gate
        overlap = leg_km / (leg_km + detour) if leg_km > 0 else 0.0
        # 시간대 여유 — 마감 후에도 활동이 남아 있을수록 안정적이다
        margin = (_static(c)[3] - q.end_min) / 120.0
        score = (0.35 * overlap
                 + 0.15 * min(1.0, margin)
                 + 0.15 * cos_sim
                 + 0.25 * c.reliability
                 + 0.10 * (1.0 - detour / MAX_DETOUR_KM))
        reason = (f"우회 {detour:.1f}km · 중첩도 {overlap * 100:.0f}% · "
                  f"신뢰도 {c.reliability * 100:.0f}%")
        out.append(Candidate(c, round(score, 4), round(detour, 2), overlap, reason))
    out.sort(key=lambda x: -x.score)
    return out


def hungarian(cost: list[list[float]]) -> dict[int, int]:
    """할당 문제 최소화. 반환: {행: 열}.

    포텐셜 기반 O(n²m) — e-maxx 정식화. SciPy linear_sum_assignment 대체.
    알고리즘은 행 ≤ 열을 전제하므로 열이 모자라면 더미 열을 패딩한다 —
    두 구간의 후보 합집합이 1명뿐인 입력(2×1)에서 증강 경로를 영원히 찾는
    무한 루프가 실제로 났다. 더미 열에 배정된 행은 결과에서 뺀다.
    """
    n, m = len(cost), len(cost[0]) if cost else 0
    if n == 0 or m == 0:
        return {}
    real_m = m
    if m < n:
        pad = max(1.0, max(max(row) for row in cost)) * 10 + 1
        cost = [row + [pad] * (n - m) for row in cost]
        m = n
    INF = float("inf")
    u = [0.0] * (n + 1)
    v = [0.0] * (m + 1)
    p = [0] * (m + 1)      # p[j] = 열 j 에 배정된 행 (1-기반, 0 = 없음)
    way = [0] * (m + 1)
    for i in range(1, n + 1):
        p[0] = i
        j0 = 0
        minv = [INF] * (m + 1)
        used = [False] * (m + 1)
        while True:
            used[j0] = True
            i0, delta, j1 = p[j0], INF, -1
            for j in range(1, m + 1):
                if used[j]:
                    continue
                cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
                if cur < minv[j]:
                    minv[j], way[j] = cur, j0
                if minv[j] < delta:
                    delta, j1 = minv[j], j
            for j in range(m + 1):
                if used[j]:
                    u[p[j]] += delta
                    v[j] -= delta
                else:
                    minv[j] -= delta
            j0 = j1
            if p[j0] == 0:
                break
        while j0:
            j1 = way[j0]
            p[j0] = p[j1]
            j0 = j1
    # 더미 열(패딩)에 배정된 행은 미배정으로 취급한다
    return {p[j] - 1: j - 1 for j in range(1, m + 1) if p[j] and j - 1 < real_m}


def assign(queries: dict[int, LegQuery]) -> dict[int, list[Candidate]]:
    """①③구간 전역 배정. 반환: 구간별 후보 목록 — [0]이 배정자, 이후가 콜 순위.

    구간별 최고점을 따로 뽑으면 같은 사람이 ①③을 동시에 맡을 수 있어
    전역(헝가리안)으로 푼다. 배정자를 목록 맨 앞으로 올리고 나머지는 점수순.
    """
    ranked = {seq: rank(q) for seq, q in queries.items()}
    seqs = sorted(ranked.keys())
    # 후보 전체(중복 제거)로 비용 행렬 구성 — 점수 최대화 = (1−점수) 최소화
    ids: list[str] = []
    for seq in seqs:
        for cand in ranked[seq]:
            if cand.carrier.id not in ids:
                ids.append(cand.carrier.id)
    if ids:
        BIG = 10.0  # 후보가 아닌 조합 — 절대 선택되지 않을 비용
        cost = []
        for seq in seqs:
            by_id = {c.carrier.id: c for c in ranked[seq]}
            cost.append([1.0 - by_id[cid].score if cid in by_id else BIG for cid in ids])
        picked = hungarian(cost)
        for row, seq in enumerate(seqs):
            col = picked.get(row)
            if col is None:
                continue
            cid = ids[col]
            lst = ranked[seq]
            idx = next((k for k, c in enumerate(lst) if c.carrier.id == cid), None)
            # BIG 셀이 배정됐다는 것은 그 구간에 후보가 없다는 뜻 — 배정으로 치지 않는다
            if idx is not None:
                lst.insert(0, lst.pop(idx))
    return ranked
