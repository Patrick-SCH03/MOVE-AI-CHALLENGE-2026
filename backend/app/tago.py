"""TAGO 열차정보 — 오늘 운행하는 KTX 를 실시간으로 받는다. 이 프로젝트의 데이터 척추.

시간표를 하드코딩하지 않는다. 포털 특성:
- 오퍼레이션명은 대문자로 시작한다. 소문자면 NO_OPENAPI_SERVICE_ERROR.
- 날짜를 하루 밀어서 준다 — depPlandTime=20260813 으로 물으면 0812 편성이 온다.
  응답의 depplandtime 앞 8자리를 믿고, 원하는 날짜가 나올 때까지 하루씩 밀어
  최대 3번 재요청한다.
- 일일 한도 10,000 — O/D·날짜 조합을 디스크에 하루 캐시한다.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

from .publicdata import DiskCache, PublicDataClient, rows
from .seed.stations import BY_CODE

BASE = "https://apis.data.go.kr/1613000/TrainInfo"

client = PublicDataClient()
# .tago.json 은 .gitignore 에 있다 — 캐시가 커밋되면 "당일 수신" 주장이 무너진다
_cache = DiskCache(str(Path(__file__).resolve().parent.parent / ".tago.json"), ttl_sec=24 * 3600)


@dataclass(frozen=True)
class Train:
    no: str          # "KTX 161" — 화면 표기
    grade: str       # "KTX"
    dep_time: str    # "HH:MM"
    arr_time: str
    fare: int        # TAGO adultcharge — 여객 운임(참고용). 특송 요율은 tariff 가 단일 출처


def _fetch_day(dep_node: str, arr_node: str, yyyymmdd: str) -> list[dict] | None:
    """원하는 날짜의 원시 행. 날짜 밀림을 보정하며 최대 3번 묻는다."""
    ask = yyyymmdd
    for _ in range(3):
        payload = client.get(
            BASE, "GetStrtpntAlocFndTrainInfo",
            depPlaceId=dep_node, arrPlaceId=arr_node, depPlandTime=ask,
        )
        if payload is None:
            return None
        items = rows(payload)
        if not items:
            return []
        got = str(items[0].get("depplandtime", ""))[:8]
        if got == yyyymmdd:
            return items
        if not got:
            return []
        # 응답 날짜가 하루 이르면 요청 날짜를 하루 밀어 다시 묻는다
        shift = (datetime.strptime(yyyymmdd, "%Y%m%d") - datetime.strptime(got, "%Y%m%d")).days
        ask = (datetime.strptime(ask, "%Y%m%d") + timedelta(days=shift)).strftime("%Y%m%d")
    return []


def trains_between(dep_code: str, arr_code: str, yyyymmdd: str) -> list[Train]:
    """출발역 코드 → 도착역 코드, 해당 날짜의 KTX 목록 (출발 시각 오름차순)."""
    dep, arr = BY_CODE.get(dep_code), BY_CODE.get(arr_code)
    if not dep or not arr or dep_code == arr_code:
        return []

    cache_key = f"{dep_code}-{arr_code}:{yyyymmdd}"
    raw = _cache.get(cache_key)
    if raw is None:
        raw = _fetch_day(dep.node_id, arr.node_id, yyyymmdd)
        if raw is None:      # 실패는 캐시하지 않는다
            return []
        _cache.put(cache_key, raw)

    out: list[Train] = []
    for it in raw:
        # 무궁화·새마을·ITX 는 특송 취급이 아니다. KTX-산천·청룡·이음은 취급한다 —
        # 실제 특송(짐캐리) 공개 시간표에 산천·이음 편성이 올라와 있다
        if not str(it.get("traingradename", "")).startswith("KTX"):
            continue
        dep_ts, arr_ts = str(it.get("depplandtime", "")), str(it.get("arrplandtime", ""))
        if len(dep_ts) < 12 or len(arr_ts) < 12:
            continue
        no = str(it.get("trainno", "")).lstrip("0") or "0"
        try:
            fare = int(float(it.get("adultcharge", 0) or 0))
        except (TypeError, ValueError):
            fare = 0
        out.append(Train(
            no=f"KTX {no}", grade="KTX",
            dep_time=f"{dep_ts[8:10]}:{dep_ts[10:12]}",
            arr_time=f"{arr_ts[8:10]}:{arr_ts[10:12]}",
            fare=fare,
        ))
    out.sort(key=lambda t: t.dep_time)
    return out


def status(yyyymmdd: str) -> dict:
    """/api/health 용 — 서울→부산 기준으로 오늘 확인 편수를 센다."""
    st = {"ok": client.state == "ready", "state": client.state}
    if client.blocked:
        st["reason"] = client.blocked
    if client.state == "ready":
        st["running_today"] = len(trains_between("SEO", "BSN", yyyymmdd))
        # 조회 자체가 실패해 회로가 차단됐으면 상태를 다시 읽는다
        if client.blocked:
            st.update(ok=False, state="blocked", reason=client.blocked)
    return st
