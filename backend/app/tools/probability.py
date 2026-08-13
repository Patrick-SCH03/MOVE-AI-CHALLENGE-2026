"""몬테카를로 확률 엔진 — P(성공) = P(①) × P(②) × P(③). 이 곱셈이 서비스의 핵심 주장.

구간 사건을 이렇게 정의한다 (곱 = 종합이 정의로써 성립하도록 서로 다른 원천의
불확실성을 구간별로 나눈다):
- ① 운반자가 자기 예산(창구 마감 − 지금) 안에 도착한다
- ② 열차 지연이 계획 여유(slack = 데드라인 − 도착 예정)를 넘지 않는다
- ③ 운반자가 자기 예산(데드라인 − 열차 도착) 안에 배송한다

구간 예산은 비례 배분이 아니라 운영 규칙에서 역산한다 — 비례 배분은 근거를
물으면 답이 없고, 운영 규칙(창구 마감 30분 전)은 근거가 규정이다.
"""
import hashlib
import os
from dataclasses import dataclass

import numpy as np

from ..seed import ontime
from ..seed.carriers import SPEED_KMH

# 확률 상한 0.99 — 100%는 확률이 아니라 약속으로 읽힌다.
# 하한 0.05 는 경로 목록 필터(route)가 쓴다. 구간 값 자체는 자르지 않는다.
CAP = 0.99
FLOOR = 0.05

# 인계 대기 — 창구 접수 처리. 삼각분포(2, 4, 12)분. 가정값
HANDOVER_TRI = (2.0, 4.0, 12.0)
HANDOVER_TYPICAL = 4.0
# 구간 최소 소요 3분 — 출발지가 역 자체여도 창구까지 이동·대기가 존재한다
MIN_LEG_MIN = 3.0

# 대체 경로(집앞 픽업) — 미배정 구간을 확정(1.0)으로 두지 않는다.
# 1.0 으로 두면 "운반자가 없는 편이 안전"이 되어 경로 탐색이 미배정을 고른다
FALLBACK_RELIABILITY = 0.92
FALLBACK_EXTRA_MIN = 25.0


@dataclass(frozen=True)
class LegInput:
    distance_km: float
    mode: str            # SPEED_KMH 의 키
    reliability: float   # R = 0.5×정시율 + 0.5×min(누적/20, 1)
    budget_min: float
    extra_min: float = 0.0  # 대체 경로 픽업 대기 등 고정 추가분


def iterations() -> int:
    return int(os.getenv("MC_ITERATIONS", "10000"))


def _seed_from(*parts) -> int:
    """난수 seed 를 입력에서 결정한다 — 같은 입력이면 같은 화면이어야
    시연이 안 흔들리고, 테스트도 재현된다. DEMO_MODE 여부와 무관하게 안전하다."""
    h = hashlib.md5("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:8], 16)


def _leg_params(leg: LegInput) -> tuple[float, float]:
    """로그정규 median·sigma.

    median = T_base × (1 + 0.35 × (1−R)) — 신뢰도가 낮으면 늦는 쪽으로 민다.
    sigma  = 0.18 + 0.15 × (1−R)

    ⚠ σ 계수는 0.15 다. 0.30 으로 뒀을 때 예산이 빠듯한 구간에서 신뢰도 0.36 이
    0.98 보다 확률이 높게 나왔다 — 로그정규는 σ 가 크면 왼쪽 꼬리도 두꺼워져
    '어차피 안 되는 예산'에서는 편차 큰 쪽이 요행으로 이긴다. 우리 R 의 낮은 값은
    '변덕스럽다'가 아니라 '아직 모른다'(누적 건수 부족)이므로, 모른다는 사실이
    예측을 낙관적으로 만들면 안 된다.
    """
    speed = SPEED_KMH.get(leg.mode, SPEED_KMH["대중교통"])
    t_base = leg.distance_km / speed * 60.0
    median = max(MIN_LEG_MIN, t_base * (1.0 + 0.35 * (1.0 - leg.reliability)))
    sigma = 0.18 + 0.15 * (1.0 - leg.reliability)
    return median, sigma


def leg_duration_samples(leg: LegInput, n: int, rng: np.random.Generator) -> np.ndarray:
    """구간 소요 표본(분) = 로그정규 이동시간 + 삼각분포 인계 대기 + 고정 추가분."""
    median, sigma = _leg_params(leg)
    travel = rng.lognormal(mean=np.log(median), sigma=sigma, size=n)
    handover = rng.triangular(*HANDOVER_TRI, size=n)
    return travel + handover + leg.extra_min


def typical_duration_min(leg: LegInput) -> float:
    """계획 표시용 대표 소요(중앙값 + 대표 인계 대기). 확률 계산에는 쓰지 않는다."""
    median, _ = _leg_params(leg)
    return median + HANDOVER_TYPICAL + leg.extra_min


def leg_probability(leg: LegInput, n: int | None = None) -> float:
    """P(구간 소요 ≤ 예산). 예산이 0 이하면 0 — 시작도 못 하는 구간이다."""
    if leg.budget_min <= 0:
        return 0.0
    n = n or iterations()
    rng = np.random.default_rng(_seed_from("leg", leg))
    samples = leg_duration_samples(leg, n, rng)
    return min(CAP, float(np.mean(samples <= leg.budget_min)))


def train_delay_samples(grade: str, n: int, rng: np.random.Generator) -> np.ndarray:
    """열차 지연 표본(분). 늦을 확률(베르누이 1−정시율)과 늦는 크기(지수분포)는
    출처가 다르다 — 두 값 모두 ontime 이 실측(전일 운행실적) 우선으로 고른다."""
    late = rng.random(n) >= ontime.rate(grade)
    sizes = rng.exponential(ontime.delay_mean(grade), size=n)
    return np.where(late, sizes, 0.0)


def train_probability(grade: str, slack_min: float, n: int | None = None) -> float:
    """P(② 성공) = P(지연 ≤ 계획 여유)."""
    if slack_min < 0:
        return 0.0
    n = n or iterations()
    rng = np.random.default_rng(_seed_from("train", grade, round(slack_min, 1)))
    delays = train_delay_samples(grade, n, rng)
    return min(CAP, float(np.mean(delays <= slack_min)))


@dataclass(frozen=True)
class Result:
    p1: float
    p2: float
    p3: float

    @property
    def combined(self) -> float:
        # 종합 = 곱, 정의로써 성립한다. 화면의 세 숫자를 곱하면 이 값이 나온다
        return min(CAP, self.p1 * self.p2 * self.p3)


def compute(leg1: LegInput, grade: str, slack_min: float, leg3: LegInput,
            n: int | None = None) -> Result:
    return Result(
        p1=leg_probability(leg1, n),
        p2=train_probability(grade, slack_min, n),
        p3=leg_probability(leg3, n),
    )


def in_transit_probability(leg3: LegInput, delay_min: float | None,
                           grade: str = "KTX", n: int | None = None) -> float:
    """운송 중(탑재 이후) 성공 확률 — 지연 전/후 두 갈래가 반드시 이 함수 하나를 부른다.

    갈래마다 라스트마일을 다르게 보면 "정상 0.0% · 12분 지연 13.2%" — 늦을수록
    좋아지는 화면이 나온다 (실제로 당한 사고). 여기서 leg3.budget_min 은
    '데드라인 − 계획 도착'이고, 지연은 그 예산을 깎는 것으로만 반영한다.

    - 지연 후(delay_min 확정): P(라스트마일 ≤ 예산 − delay)
    - 지연 전(None): 정시율 × P(라스트마일 ≤ 예산)
                    + (1−정시율) × E_d[P(라스트마일 ≤ 예산 − d)]  (지수분포 몬테카를로 합성)
    """
    n = n or iterations()
    rng = np.random.default_rng(_seed_from("transit", leg3, delay_min, grade))
    lastmile = leg_duration_samples(leg3, n, rng)
    if delay_min is not None:
        # 확정 지연 — '더는 늦지 않는다'는 뜻이라 불확실성이 하나 사라진 상태
        return min(CAP, float(np.mean(lastmile <= leg3.budget_min - delay_min)))
    delays = train_delay_samples(grade, n, rng)
    return min(CAP, float(np.mean(lastmile <= leg3.budget_min - delays)))


def fallback_leg(distance_km: float, budget_min: float) -> LegInput:
    """미배정 구간의 대체 경로(집앞 픽업) — 픽업 +25분, 신뢰도 0.92 인 '구간'으로
    계산한다. 절대 1.0 으로 두지 않는다."""
    return LegInput(
        distance_km=distance_km, mode="대중교통",
        reliability=FALLBACK_RELIABILITY, budget_min=budget_min,
        extra_min=FALLBACK_EXTRA_MIN,
    )
