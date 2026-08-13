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


# ── P3: 헝가리안 · 경로 ────────────────────────────────────────────────
def hungarian_vs_bruteforce():
    """3×3 이하 무작위 행렬 200개 — 직접 구현이 완전탐색과 같은 최적값을 내야 한다."""
    import itertools
    import random

    from app.tools.match import hungarian

    # 회귀: 행 > 열(후보 합집합이 구간 수보다 적음) — 무한 루프가 났던 입력
    got = hungarian([[0.3], [0.5]])
    assert len(got) == 1 and sum(costv for costv in []) == 0
    got = hungarian([[0.9], [0.1]])
    assert got == {1: 0}, f"싼 행이 배정돼야 한다: {got}"

    rng = random.Random(7)
    for trial in range(200):
        n = rng.randint(1, 3)
        m = rng.randint(n, 3)
        cost = [[round(rng.uniform(0, 10), 3) for _ in range(m)] for _ in range(n)]
        got = hungarian(cost)
        got_cost = sum(cost[i][j] for i, j in got.items())
        best = min(sum(cost[i][perm[i]] for i in range(n))
                   for perm in itertools.permutations(range(m), n))
        assert abs(got_cost - best) < 1e-9, f"시행 {trial}: {got_cost} != {best}"


def _mock_tago(monkey_trains):
    """키 없이 경로 로직을 검사하기 위한 합성 시간표 — TAGO 자체는 check_tago 가 검사한다."""
    from app import tago

    original = tago.trains_between
    tago.trains_between = monkey_trains
    return lambda: setattr(tago, "trains_between", original)


def route_product_and_suggestions():
    from app import tago
    from app.tools.route import build

    def fake_trains(dep, arr, day):
        if dep == "SEO" and arr == "BSN":
            return [tago.Train("KTX 35", "KTX", "13:58", "16:35", 59800),
                    tago.Train("KTX 39", "KTX", "14:28", "17:12", 59800)]
        return []

    restore = _mock_tago(fake_trains)
    try:
        r = build("강남", "서면", "18:00", now="12:00")
        assert r["feasible"], r.get("reason")
        prod = 1.0
        for leg in r["legs"]:
            prod *= leg["probability"]
        assert abs(prod - r["combined_probability"]) < 0.002, "곱셈 불변식 위반"
        assert len(r["legs"]) == 3 and r["train_no"].startswith("KTX")
        # 같은 사람이 ①③을 동시에 맡지 않는다
        c1, c3 = r["legs"][0].get("carrier_id"), r["legs"][2].get("carrier_id")
        assert not (c1 and c3 and c1 == c3), "같은 운반자가 두 구간을 맡았다"

        r2 = build("강남", "서면", "13:00", now="12:00")
        assert not r2["feasible"]
        assert r2.get("suggestions"), "제안이 비었다"
        # 제안은 실제 계획에서 — 제안 데드라인으로 다시 세우면 성립해야 한다
        for s in r2["suggestions"]:
            r3 = build("강남", "서면", s["deadline"], now="12:00")
            assert r3["feasible"], f"제안 {s['deadline']} 이 실제로는 불가"
            assert r3["eta"] <= s["deadline"], "제안 데드라인보다 늦게 도착하는 계획"
    finally:
        restore()


def route_refusals():
    from app.tools.route import build

    r = build("강남", "잠실", "18:00", now="12:00")   # 같은 생활권
    assert not r["feasible"] and "퀵" in r["reason"]
    r = build("모르는동네123", "서면", "18:00", now="12:00")
    assert not r["feasible"] and r.get("need_place")


# ── P4: 요율 · 채널 ────────────────────────────────────────────────────
def tariff_rules():
    from app.seed import tariff

    assert tariff.value_surcharge(400_000) == 0
    assert tariff.value_surcharge(850_000) == 5_000
    assert tariff.value_surcharge(1_500_000) == 8_000
    assert tariff.value_surcharge(2_500_000) == 10_000
    assert tariff.tier_of("노트북") == "B"
    assert tariff.tier_of("서류봉투") == "초소형/서류"   # 긴 이름 먼저
    assert tariff.tier_of("모르는물건") == "B"
    assert tariff.distance_surcharge("SEO", "BSN") == 1_000
    assert tariff.distance_surcharge("DJN", "DDG") == 0
    assert tariff.liability_cap(None) == 500_000
    total, lines = tariff.base_fare("노트북", "SEO", "BSN", 850_000)
    assert total == 10_000 + 1_000 + 5_000 and len(lines) == 3


def channels_consistency():
    """경로가 가능하다는데 채널 카드가 같은 건을 '마감 지났어요'라 하면 안 된다."""
    from app import tago
    from app.clock import to_min
    from app.tools.channels import SPLIT, SURCHARGE, compare
    from app.tools.route import build

    for ch, split in SPLIT.items():
        assert sum(split.values()) == SURCHARGE[ch]

    def fake_trains(dep, arr, day):
        if dep == "SEO" and arr == "BSN":
            return [tago.Train("KTX 35", "KTX", "13:58", "16:35", 59800),
                    tago.Train("KTX 39", "KTX", "14:28", "17:12", 59800)]
        return []

    restore = _mock_tago(fake_trains)
    try:
        plan = build("강남", "서면", "18:00", now="10:00")
        assert plan["feasible"]
        cards = compare(plan, "노트북", 850_000, "18:00", to_min("10:00"))
        by_id = {c["id"]: c for c in cards}
        assert by_id["relay"]["feasible"], "경로는 되는데 relay 카드가 불가"
        assert by_id["relay"]["train_no"] == plan["train_no"], "relay 카드가 계획과 다른 편성"
        assert by_id["relay"]["eta"] == plan["eta"]
        # 창구는 도착 후 55분 — 더 이른 열차라도 자기 마감 안이면 가능해야 한다
        assert by_id["desk"]["feasible"]
        # 고가품은 relay 만 막힌다
        cards2 = compare(plan, "노트북", 2_500_000, "18:00", to_min("10:00"))
        by2 = {c["id"]: c for c in cards2}
        assert not by2["relay"]["feasible"] and by2["desk"]["feasible"]
        # 뱃지는 선택 가능한 채널에만
        for c in cards:
            if c["badge"]:
                assert c["feasible"]
    finally:
        restore()


# ── P5: 파서 폴백 · 규정 판정 ─────────────────────────────────────────
def parse_fallback_accuracy():
    """규칙 폴백 — Gemini 없이 도는 정확도. 밟아 본 함정 셋을 고정한다."""
    from app.tools.parse import _parse_deadline, _parse_item, _parse_value, rules_parse

    # 금액: 콤마 표기 먼저 — 단일 정규식은 "1,250,000원"을 250,000원으로 읽는다
    assert _parse_value("1,250,000원짜리") == 1_250_000
    assert _parse_value("4만5천원") == 45_000
    assert _parse_value("85만원") == 850_000
    assert _parse_value("300만원") == 3_000_000
    # 시각: 한글 시각 · 오전/오후 없는 1~8시는 오후
    assert _parse_deadline("저녁 여섯시") == "18:00"
    assert _parse_deadline("6시까지") == "18:00"
    assert _parse_deadline("18:30") == "18:30"
    assert _parse_deadline("오전 9시 반") == "09:30"
    # 품목: tariff 사전 공용 · 긴 이름 먼저
    assert _parse_item("서류봉투 하나") == "서류봉투"
    intake = rules_parse("강남에서 서면으로 노트북 85만원짜리 오늘 저녁 6시까지")
    assert intake["origin"] == "강남" and intake["destination"] == "서면"
    assert intake["item"] == "노트북" and intake["declared_value"] == 850_000
    assert intake["deadline"] == "18:00"


def screening_rules():
    from app.tools.screen import screen

    # 금지품은 파싱된 품목이 비어도 원문에서 잡는다
    r = screen(None, 3_000_000, raw_text="현금 300만원 보내줘")
    assert r["verdict"] == "BLOCKED"
    assert "제10조" in r["findings"][0]["clause"]
    # 수탁 상한
    assert screen("노트북", 3_500_000)["verdict"] == "BLOCKED"
    # 고가품 — 할증 + 시민 운반 제외
    r = screen("노트북", 2_500_000)
    assert r["verdict"] == "CONDITIONAL" and not r["relay_allowed"] and r["surcharge"] == 10_000
    # 통과
    assert screen("책", None)["verdict"] == "PASS"


# ── P8: 주문 흐름 ──────────────────────────────────────────────────────
def orders_flow():
    """접수→배차→인계→증명 전 구간 — 콜을 전부 거절해도 인계가 이어진다."""
    import os
    import tempfile

    os.environ["DEMO_MODE"] = "true"
    from pathlib import Path

    from sqlmodel import create_engine

    import app.db as db
    import app.routers.meta as meta_router
    import app.routers.orders as orders_router
    from app import tago

    tmp = Path(tempfile.mkdtemp()) / "check.db"
    db.DB_PATH = tmp
    db.engine = create_engine(f"sqlite:///{tmp}")
    orders_router.engine = db.engine
    meta_router.engine = db.engine
    db.init_db()

    def fake_trains(dep, arr, day):
        if dep == "SEO" and arr == "BSN":
            return [tago.Train("KTX 35", "KTX", "13:58", "16:35", 59800),
                    tago.Train("KTX 39", "KTX", "14:28", "17:12", 59800)]
        return []

    restore = _mock_tago(fake_trains)
    try:
        from fastapi.testclient import TestClient

        from app.main import app
        c = TestClient(app)
        body = dict(origin="강남", destination="서면", deadline="18:00", item="노트북",
                    declared_value=850000, channel="relay", now="12:00",
                    notice_consent=True, recipient_consent=True, relay_consent=True)

        # 동의는 서버가 막는다
        assert c.post("/api/orders", json={**body, "relay_consent": False}).status_code == 400
        assert c.post("/api/orders", json={**body, "notice_consent": False}).status_code == 400

        # 콜을 전부 거절해도 구간이 수락 대기로 굳지 않는다
        d = c.post("/api/orders", json=body).json()
        oid = d["order"]["id"]
        fare0 = d["order"]["fare"]
        for _ in range(300):
            ringing = c.get(f"/api/orders/{oid}").json()["order"]["dispatch"]["ringing"]
            if not ringing:
                break
            for call in ringing:
                c.post(f"/api/carrier/call/{call['id']}/respond", json={"accept": False})
        got = c.get(f"/api/orders/{oid}").json()
        legs = {leg["seq"]: leg for leg in got["legs"]}
        for s in (1, 3):
            assert legs[s]["accepted"] and legs[s]["fallback"], f"{s}구간이 수락 대기로 굳었다"
            assert len(legs[s]["handover_code"]) == 6 and legs[s]["reward"] == 0
        assert got["order"]["fare"] == fare0, "전환은 우리 사정 — 운임이 변하면 안 된다"

        # 순서 건너뜀 400 · 틀린 코드는 실제 코드 변형으로 (000000 은 마스터라 성공해 버린다)
        assert c.post("/api/handover", json={"order_id": oid, "seq": 2, "code": "000000"}).status_code == 400
        wrong = str((int(legs[1]["handover_code"]) + 1) % 1000000).zfill(6)
        assert c.post("/api/handover", json={"order_id": oid, "seq": 1, "code": wrong}).status_code == 400
        for seq in (1, 2, 3):
            assert c.post("/api/handover", json={"order_id": oid, "seq": seq, "code": "000000"}).status_code == 200
        assert c.get(f"/api/orders/{oid}").json()["order"]["status"] == "COMPLETED"
        proof = c.get(f"/api/proof/{oid}?client=검사").json()
        assert [e["type"] for e in proof["events"]] == ["RECEIVED", "IN_TRANSIT", "DELIVERED"]

        # 지연: 탑재 전에는 확률이 없고, 확정 지연이 커질수록 확률이 안 오른다
        d2 = c.post("/api/orders", json=body).json()
        oid2 = d2["order"]["id"]
        assert c.get(f"/api/orders/{oid2}/notifications").json()["probability_now"] is None
        for call in c.get(f"/api/orders/{oid2}").json()["order"]["dispatch"]["ringing"]:
            c.post(f"/api/carrier/call/{call['id']}/respond", json={"accept": True})
        c.post("/api/handover", json={"order_id": oid2, "seq": 1, "code": "000000"})
        c.post("/api/handover", json={"order_id": oid2, "seq": 2, "code": "000000"})
        n = c.get(f"/api/orders/{oid2}/notifications").json()
        assert n["delay_applies"] and n["probability_now"] is not None
        prev_p, prev_eta = None, n["eta_now"]
        for d_min in (12, 25):
            nd = c.post(f"/api/orders/{oid2}/delay", json={"delay_min": d_min}).json()
            assert nd["eta_now"] > prev_eta, "지연인데 도착 예정이 안 밀렸다"
            if prev_p is not None:
                assert nd["probability_now"] <= prev_p + 0.01, "확정 지연이 커질수록 확률이 올랐다"
            prev_p, prev_eta = nd["probability_now"], nd["eta_now"]
        # 탑재 후 취소 400
        assert c.post(f"/api/orders/{oid2}/cancel").status_code == 400
    finally:
        restore()


# ── 특일·열차운행정보 — 키 없이 폴백 성질만 검사한다 ─────────────────────
def ontime_fallback_and_measured():
    """실측이 없으면 공시 상수, 있으면 실측 — 확률·크기가 같은 출처에서 함께 움직인다."""
    from unittest.mock import patch

    from app import trainrun
    from app.seed import ontime

    with patch.object(trainrun, "measured", return_value=None):
        assert ontime.rate("KTX") == ontime.ONTIME_RATE["KTX"]
        assert ontime.rate("SRT") == ontime.ONTIME_RATE["SRT"]
        assert ontime.delay_mean("KTX") == ontime.DELAY_MEAN_MIN
        assert ontime.provenance("KTX")["source"] == "공시"
    m = {"date": "20260812", "n": 319, "ontime_rate": 0.931, "delay_mean_min": 8.1}
    with patch.object(trainrun, "measured", return_value=m):
        assert ontime.rate("KTX") == 0.931
        assert ontime.delay_mean("KTX") == 8.1
        # SRT 는 이 데이터에 없다 — 실측이 있어도 공시 유지
        assert ontime.rate("SRT") == ontime.ONTIME_RATE["SRT"]
        assert ontime.provenance("KTX")["source"] == "실측"


def specialday_silent_without_key():
    """키가 없거나 조회가 실패하면 평일 취급(None) — 예외가 화면까지 가면 안 된다."""
    from unittest.mock import patch

    from app import specialday

    with patch.object(specialday, "month_holidays", return_value=None):
        assert specialday.today_special() is None
    days = [{"date": "20260815", "name": "광복절", "holiday": True}]
    with patch.object(specialday, "month_holidays", return_value=days):
        got = specialday.today_special()
        # 오늘이 8/15 일 때만 배지가 뜬다 — 날짜 비교가 KST 기준으로 도는지
        from app.clock import now_kst
        expect = now_kst().strftime("%Y%m%d") == "20260815"
        assert (got is not None) == expect


def holiday_raises_relay_risk():
    """공휴일이면 시민 운반 카드 확률이 평일보다 낮아야 한다 (매칭 리스크 상향)."""
    from app.tools import channels

    assert channels.HOLIDAY_MATCH_RISK > channels.MATCH_RISK


CHECKS = [
    ("운반자 시드 — 팀원 4명·재현성·부산 활동 시간대", carriers_seed),
    ("엔진 — 같은 입력 = 같은 결과", engine_reproducible),
    ("엔진 — 구간확률 곱 = 종합 (오차 0.002)", engine_product_invariant),
    ("엔진 — 상한 99%", engine_caps),
    ("엔진 — 예산 단조성 (10~110분 훑기)", engine_monotone_budget),
    ("엔진 — σ 벌점: 불확실성이 확률을 못 올린다", engine_sigma_penalty),
    ("엔진 — 미배정 구간은 확정이 아니다", engine_unassigned_not_certain),
    ("엔진 — 지연 전/후 같은 분포 (늦을수록 좋아지지 않음)", engine_two_branches_same_distribution),
    ("헝가리안 — 무작위 200회 완전탐색 대조", hungarian_vs_bruteforce),
    ("경로 — 3구간 곱셈·전역 배정·제안이 실제 계획", route_product_and_suggestions),
    ("경로 — 거절 사유 구분 (생활권·지명 미인식)", route_refusals),
    ("요율 — 등급·거리·가액·배상 규칙", tariff_rules),
    ("채널 — 배분 합계·경로와 무모순·고가품 차단", channels_consistency),
    ("파서 — 규칙 폴백 정확도 (금액·시각·품목)", parse_fallback_accuracy),
    ("규정 — 금지품 원문 스캔·상한·고가품", screening_rules),
    ("주문 — 동의 400·전부 거절 전환·인계 순서·지연 단조", orders_flow),
    ("정시율 — 실측 우선·공시 폴백·SRT 상수 유지", ontime_fallback_and_measured),
    ("특일 — 실패 시 평일 취급·KST 날짜 판정", specialday_silent_without_key),
    ("특일 — 공휴일 매칭 리스크 상향", holiday_raises_relay_risk),
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
