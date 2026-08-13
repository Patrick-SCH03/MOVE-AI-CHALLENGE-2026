"""시각 파싱은 이 파일에서만 한다.

파일마다 _m / _hhmm 파서를 두면 이름은 같은데 방향이 반대인 함수가 생긴다 —
그게 제일 위험해서 여덟 파일이 각자 파서를 들다 사고가 난 전례를 따라 단일화했다.
날짜 경계는 KST, 저장은 UTC naive.
"""
import os
from datetime import datetime, timedelta, timezone

KST = timezone(timedelta(hours=9))


def to_min(hhmm: str) -> int:
    """"13:28" -> 808. 잘못된 값은 ValueError — 조용히 넘기지 않는다."""
    h, m = hhmm.strip().split(":")
    return int(h) * 60 + int(m)


def to_hhmm(minutes: int) -> str:
    """808 -> "13:28". 자정 넘김은 하루로 접는다(표시용)."""
    minutes = int(minutes) % (24 * 60)
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def try_min(s) -> int | None:
    """파싱 실패를 흐름 제어로 쓰는 곳용 — 예외 대신 None."""
    if not isinstance(s, str) or ":" not in s:
        return None
    try:
        return to_min(s)
    except (ValueError, AttributeError):
        return None


def now_kst() -> datetime:
    return datetime.now(KST)


def today_yyyymmdd() -> str:
    """오늘 날짜는 반드시 KST 로 센다 — UTC 자정이면 한국 오전 9시에 하루가 바뀐다."""
    return now_kst().strftime("%Y%m%d")


def service_now() -> int:
    """서비스 기준 시각(분). 실제 시각이 기본, DEMO_TIME("HH:MM")이 있으면 그 값.

    계획·인계 시각을 전부 이 시계로 재야 DEMO_TIME 고정 시에도 뺄셈이 맞는다.
    """
    demo = os.getenv("DEMO_TIME", "").strip()
    fixed = try_min(demo)
    if fixed is not None:
        return fixed
    n = now_kst()
    return n.hour * 60 + n.minute


def utc_naive_now() -> datetime:
    """저장용 — DB 에는 UTC naive 로만 넣는다."""
    return datetime.utcnow()


def kst_day_start_utc() -> datetime:
    """KST 자정을 UTC naive 로 — UTC 자정으로 '오늘'을 세면 한국 오전 9시에
    하루가 바뀐다. '오늘' 집계는 전부 이 경계를 쓴다."""
    k = now_kst().replace(hour=0, minute=0, second=0, microsecond=0)
    return k.replace(tzinfo=None) - timedelta(hours=9)
