"""한국철도공사 열차운행정보 — 어제 "계획 대 실적" 전수 대조로 정시율을 실측한다.

확률 엔진의 열차 지연 갈래는 두 숫자로 돈다: 늦을 확률(1−정시율)과 늦는
크기(지수분포 평균). 지금까지는 공시 PDF 상수였는데, 이 API 의 운행계획
(travelerTrainRunPlan2)과 운행실적(travelerTrainRunInfo2)을 열차번호로 붙이면
같은 두 숫자를 어제 실운행 전수에서 잴 수 있다. 실측이 있으면 실측을, 없으면
공시 상수를 쓴다 — 어느 쪽을 썼는지는 provenance 로 화면까지 간다.

포털 특성 (전부 실제로 밟아 본 것):
- 두 오퍼레이션 모두 필터 파라미터가 없다(run_ymd 를 줘도 무시된다). 날짜
  내림차순 전량 페이징뿐이라, 실적은 1페이지부터(어제가 최신), 계획은 미래
  계획(+10일)을 지나 어제가 나올 때까지 앞에서부터 읽는다.
- 실적은 정차역 단위 행이라 종착(stop_se_nm="종착") 도착만 골라 쓴다.
- 하루 ~720편 × 계획 ~11일 치를 읽으면 요청 ~16번 — 요청 경로에서 돌리면
  화면이 그만큼 멈추므로, 기동 시 1회 예열(warm)하고 하루 디스크 캐시로 읽는다.

SRT 는 이 데이터에 없다(운영사가 (주)SR) — SRT 정시율은 공시 상수를 유지한다.
"""
import threading
from datetime import datetime, timedelta
from pathlib import Path

from .clock import now_kst
from .publicdata import DiskCache, PublicDataClient, rows

BASE = "https://apis.data.go.kr/B551457/run/v2"
ONTIME_STD_MIN = 5      # 정시 판정 5분 — 사업자 공표 정시율과 같은 기준
MIN_SAMPLE = 100        # 대조 편수가 이보다 적으면 실측을 신뢰하지 않는다
_PAGE_ROWS = 1000
_MAX_PAGES = 20         # 폭주 방어 — 하루 실적 ~9p, 계획 어제 도달 ~8p

# 페이지가 커서 기본 6초로는 모자란다 — TAGO 와 별도 인스턴스(회로도 별도)
client = PublicDataClient(timeout=25.0)
_cache = DiskCache(str(Path(__file__).resolve().parent.parent / ".trainrun.json"),
                   ttl_sec=24 * 3600)


def _page(op: str, page_no: int) -> list[dict]:
    payload = client.get(BASE, op, numOfRows=_PAGE_ROWS, pageNo=page_no)
    return rows(payload)


def _collect(yesterday: str) -> dict | None:
    """어제 종착 실적 × 어제 계획 도착을 열차번호로 붙여 지연 분포를 잰다."""
    # 실적 — 최신(어제)이 1페이지. 다른 날짜가 나오면 그 날 치는 끝난 것
    actual: dict[str, tuple[str, str]] = {}
    for p in range(1, _MAX_PAGES + 1):
        items = _page("travelerTrainRunInfo2", p)
        if not items:
            return None
        other_day = False
        for it in items:
            if it.get("run_ymd") != yesterday:
                other_day = True
                break
            if it.get("stop_se_nm") == "종착" and it.get("trn_arvl_dt"):
                actual[it["trn_no"]] = (it["trn_arvl_dt"], it["stn_nm"])
        if other_day:
            break

    # 계획 — 내림차순이라 미래 계획을 지나 어제를 모으고, 어제보다 이르면 끝
    plan: dict[str, tuple[str, str]] = {}
    for p in range(1, _MAX_PAGES + 1):
        items = _page("travelerTrainRunPlan2", p)
        if not items:
            return None
        for it in items:
            if it.get("run_ymd") == yesterday:
                plan[it["trn_no"]] = (it["trn_plan_arvl_dt"], it["arvl_stn_nm"])
        if items[-1].get("run_ymd", "") < yesterday:
            break

    fmt = "%Y-%m-%d %H:%M:%S.%f"
    delays: list[float] = []
    for tn, (a_dt, stn) in actual.items():
        # 고속 여객 대역(번호<1000)만 — 우리 상품이 싣는 열차다
        if not (tn.isdigit() and int(tn) < 1000):
            continue
        if tn in plan and plan[tn][1] == stn:
            try:
                d = (datetime.strptime(a_dt, fmt)
                     - datetime.strptime(plan[tn][0], fmt)).total_seconds() / 60.0
                delays.append(d)
            except ValueError:
                continue
    if len(delays) < MIN_SAMPLE:
        return None
    late = [d for d in delays if d > ONTIME_STD_MIN]
    return {
        "date": yesterday,
        "n": len(delays),
        "ontime_rate": round(1 - len(late) / len(delays), 4),
        # 늦는 크기는 정시율이 정한 꼬리(5분 초과 건)에서 잰다 — ontime.py 참조
        "delay_mean_min": round(sum(late) / len(late), 1) if late else None,
    }


def _yesterday() -> str:
    return (now_kst() - timedelta(days=1)).strftime("%Y%m%d")


def measured() -> dict | None:
    """어제 실측 통계 — 캐시만 읽는다(요청 경로에서 절대 수집하지 않는다)."""
    return _cache.get(_yesterday())


def warm() -> None:
    """기동 시 1회 수집. '백그라운드 작업 금지' 원칙은 요청 경로의 상태 갱신
    이야기다 — 이것은 캐시 예열이고, 실패해도 공시 상수 폴백이라 조용히 둔다."""
    y = _yesterday()
    if _cache.get(y) is not None:
        return
    try:
        stats = _collect(y)
    except Exception:
        return
    if stats:
        _cache.put(y, stats)


def warm_async() -> None:
    threading.Thread(target=warm, daemon=True, name="trainrun-warm").start()


def status() -> dict:
    """/api/health 용 — 지금 확률 엔진이 어느 출처로 도는지."""
    m = measured()
    st = {"ok": client.state != "blocked", "state": client.state,
          "source": "measured" if m else "published_fallback"}
    if m:
        st.update(date=m["date"], n=m["n"], ontime_rate=m["ontime_rate"],
                  delay_mean_min=m["delay_mean_min"])
    if client.blocked:
        st["reason"] = client.blocked
    return st
