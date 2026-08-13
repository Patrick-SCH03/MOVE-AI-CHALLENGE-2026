"""한국천문연구원 특일 정보 — 오늘이 공휴일인지 실데이터로 판단한다.

시민 운반의 공급은 "배송하러 나가는 사람"이 아니라 원래 이동하던 사람이다.
공휴일에는 출퇴근 이동 자체가 사라지므로 매칭 밀도 가정이 평일과 같을 수 없다 —
채널 비교(relay 매칭 리스크)와 홈 배지가 이 모듈을 본다.

달력을 하드코딩하지 않는 이유는 시간표와 같다: 대체공휴일은 국무회의 승인 뒤에야
확정되므로 상수로 두면 그 순간 낡는다. 월 단위 디스크 캐시 — 한 달에 한 번 호출.
"""
from pathlib import Path

from .clock import now_kst
from .publicdata import DiskCache, PublicDataClient, rows

BASE = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService"

client = PublicDataClient()
_cache = DiskCache(str(Path(__file__).resolve().parent.parent / ".specialday.json"),
                   ttl_sec=30 * 24 * 3600)


def month_holidays(year: int, month: int) -> list[dict] | None:
    """해당 월의 공휴일 목록. 실패는 None — 캐시하지 않는다."""
    key = f"{year:04d}-{month:02d}"
    got = _cache.get(key)
    if got is None:
        payload = client.get(BASE, "getRestDeInfo",
                             solYear=f"{year:04d}", solMonth=f"{month:02d}")
        if payload is None:
            return None
        got = [{"date": str(it.get("locdate", "")), "name": it.get("dateName", ""),
                "holiday": it.get("isHoliday") == "Y"} for it in rows(payload)]
        _cache.put(key, got)
    return got


def today_special() -> dict | None:
    """오늘이 공휴일이면 {"name", "date"} — 아니면 None.

    조회 실패도 None: 공휴일 판단이 안 되면 평일 취급이 보수적이다
    (리스크를 낮게 잡는 쪽이 아니라 화면 배지가 안 뜨는 쪽으로 틀린다).
    """
    n = now_kst()
    ymd = n.strftime("%Y%m%d")
    for d in month_holidays(n.year, n.month) or []:
        if d["date"] == ymd and d["holiday"]:
            return {"name": d["name"], "date": ymd}
    return None


def status() -> dict:
    """/api/health 용."""
    st = {"ok": client.state == "ready", "state": client.state}
    if client.blocked:
        st["reason"] = client.blocked
    return st
