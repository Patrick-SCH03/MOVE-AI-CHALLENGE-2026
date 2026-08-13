"""통합 점검 — 서버·키 없이 돈다. 수치가 아니라 성질을 검사한다.

모든 검사에 now·예산을 명시적으로 넣는다 — 실행 시각에 따라 결과가 바뀌면
저녁에 전부 실패한다(틀린 게 아니라 그 시각에 열차가 없는 것).
단계가 끝날 때마다 여기에 검사를 추가한다.
"""
import sys
from pathlib import Path

# Windows 콘솔이 cp949 라 한국어 출력이 깨진다
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

FAILED = []


def check(name: str, fn):
    try:
        fn()
        print(f"  ok  {name}")
    except AssertionError as e:
        FAILED.append(name)
        print(f"FAIL  {name} — {e}")


# ── P2: 운반자 시드 ────────────────────────────────────────────────────
def carriers_seed():
    from app.seed.carriers import BY_ID, CARRIERS, MANUAL

    assert 300 <= len(CARRIERS) <= 500, f"운반자 수 {len(CARRIERS)}"
    assert [c.id for c in MANUAL] == ["C001", "C037", "C023", "C038"]
    # 팀원 대조쌍: 같은 동선·같은 시간대, 신뢰도만 다르다
    a, b = BY_ID["C001"], BY_ID["C037"]
    assert a.route_from == b.route_from and a.active_from == b.active_from
    assert a.reliability > b.reliability + 0.3, "대조가 벌어져야 시연이 된다"
    # 부산 팀원은 10:00 시작 — 퇴근길로 두면 ③구간 시간대(16~17시)에 활동 밖
    assert BY_ID["C023"].active_from == "10:00"
    # 재현성: 모듈을 다시 로드해도 같은 명단
    import importlib

    import app.seed.carriers as mod
    first = [(c.id, c.name, c.route_from) for c in mod.CARRIERS[:20]]
    importlib.reload(mod)
    second = [(c.id, c.name, c.route_from) for c in mod.CARRIERS[:20]]
    assert first == second, "seed 고정이 깨졌다"


# ── P2: 확률 엔진 ──────────────────────────────────────────────────────
def engine_reproducible():
    from app.tools.probability import LegInput, compute

    leg1 = LegInput(5.2, "러닝", 0.98, 88)
    leg3 = LegInput(3.1, "대중교통", 0.97, 85)
    r1 = compute(leg1, "KTX", 64, leg3)
    r2 = compute(leg1, "KTX", 64, leg3)
    assert (r1.p1, r1.p2, r1.p3) == (r2.p1, r2.p2, r2.p3), "같은 입력인데 다른 결과"


def engine_product_invariant():
    from app.tools.probability import LegInput, compute

    for slack, b1, b3 in [(64, 88, 85), (20, 40, 30), (5, 15, 12)]:
        leg1 = LegInput(5.2, "러닝", 0.98, b1)
        leg3 = LegInput(3.1, "대중교통", 0.97, b3)
        r = compute(leg1, "KTX", slack, leg3)
        assert abs(r.p1 * r.p2 * r.p3 - r.combined) < 0.002 or r.combined == 0.99, \
            f"곱셈 불변식 위반 slack={slack}"


def engine_caps():
    from app.tools.probability import LegInput, compute, leg_probability

    generous = LegInput(1.5, "대중교통", 0.99, 500)
    assert leg_probability(generous) <= 0.99, "상한 99% 위반"
    r = compute(generous, "KTX", 500, generous)
    assert r.combined <= 0.99


def engine_monotone_budget():
    """예산이 늘수록 확률이 내려가지 않는다 — 한 점이 아니라 구간을 훑는다."""
    from app.tools.probability import LegInput, leg_probability

    prev = -1.0
    for budget in range(10, 120, 10):
        p = leg_probability(LegInput(5.2, "러닝", 0.9, budget))
        assert p >= prev - 0.015, f"예산 {budget}분에서 확률이 크게 역행"
        prev = p


def engine_sigma_penalty():
    """불확실성이 확률을 올리면 안 된다 — 신뢰도 대조가 넉넉한 예산에서 유지되고,
    빠듯한 예산의 역전은 목록 하한(5%) 아래로 밀려나야 한다."""
    from app.tools.probability import FLOOR, LegInput, leg_probability

    for budget in range(15, 90, 5):
        hi = leg_probability(LegInput(5.2, "러닝", 0.98, budget))
        lo = leg_probability(LegInput(5.2, "러닝", 0.36, budget))
        if lo > hi:
            assert max(hi, lo) < FLOOR, \
                f"예산 {budget}분: 낮은 신뢰도가 목록 하한 위에서 이겼다 hi={hi:.3f} lo={lo:.3f}"


def engine_unassigned_not_certain():
    from app.tools.probability import fallback_leg, leg_probability

    p = leg_probability(fallback_leg(3.1, 85))
    assert 0.0 < p <= 0.99, "미배정 구간이 0 또는 확정으로 계산됐다"


def engine_two_branches_same_distribution():
    """지연 전/후 갈래가 같은 분포를 봐야 한다 — 늦을수록 확률이 오르면 안 된다."""
    from app.tools.probability import LegInput, in_transit_probability

    leg3 = LegInput(3.1, "대중교통", 0.97, 40)
    before = in_transit_probability(leg3, None)
    after0 = in_transit_probability(leg3, 0.0)
    assert before <= after0 + 0.01, "지연 없음 확정이 미확정보다 낮게 나왔다"
    prev = after0
    for d in (6, 12, 25, 40):
        p = in_transit_probability(leg3, float(d))
        assert p <= prev + 0.01, f"지연 {d}분에서 확률이 올랐다"
        prev = p


CHECKS = [
    ("운반자 시드 — 팀원 4명·재현성·부산 활동 시간대", carriers_seed),
    ("엔진 — 같은 입력 = 같은 결과", engine_reproducible),
    ("엔진 — 구간확률 곱 = 종합 (오차 0.002)", engine_product_invariant),
    ("엔진 — 상한 99%", engine_caps),
    ("엔진 — 예산 단조성 (10~110분 훑기)", engine_monotone_budget),
    ("엔진 — σ 벌점: 불확실성이 확률을 못 올린다", engine_sigma_penalty),
    ("엔진 — 미배정 구간은 확정이 아니다", engine_unassigned_not_certain),
    ("엔진 — 지연 전/후 같은 분포 (늦을수록 좋아지지 않음)", engine_two_branches_same_distribution),
]


def main() -> int:
    print(f"점검 {len(CHECKS)}항목")
    for name, fn in CHECKS:
        check(name, fn)
    if FAILED:
        print(f"\n실패 {len(FAILED)}: {FAILED}")
        return 1
    print("\n전부 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
