"""지명 사전 — 외부 지오코딩 API 를 쓰지 않는다. 키 없이도 동작이 같아야 한다.

사전에 없으면 route 가 "못 찾았어요, 시·군·구를 함께 적어 주세요"로 되묻는다 —
아무 좌표나 추측해서 배송 경로를 만드는 것보다 낫다.
"""
import math

# 시연 지명 + 시·도 17 + 주요 시·군·구 중심 좌표 (지도에서 찍은 근사값이면 충분)
PLACES: dict[str, tuple[float, float]] = {
    # 시연 지명
    "강남": (37.4979, 127.0276),
    "서면": (35.1578, 129.0594),
    "부전동": (35.1626, 129.0616),
    "해운대": (35.1631, 129.1635),
    "마포": (37.5637, 126.9036),
    "여의도": (37.5216, 126.9243),
    "잠실": (37.5133, 127.1000),
    # 시·도 17
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052),
    "광주": (35.1595, 126.8526),
    "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114),
    "세종": (36.4800, 127.2890),
    "수원": (37.2636, 127.0286),   # 경기 — 도청 소재지로 대표
    "춘천": (37.8813, 127.7298),   # 강원
    "청주": (36.6424, 127.4890),   # 충북
    "홍성": (36.6015, 126.6608),   # 충남
    "전주": (35.8242, 127.1480),   # 전북
    "무안": (34.9901, 126.4831),   # 전남
    "안동": (36.5684, 128.7294),   # 경북
    "창원": (35.2281, 128.6811),   # 경남
    "제주": (33.4996, 126.5312),
    # 주요 시·군·구
    "강릉": (37.7519, 128.8761),
    "경주": (35.8562, 129.2247),
    "고양": (37.6584, 126.8320),
    "김해": (35.2342, 128.8811),
    "목포": (34.8118, 126.3922),
    "성남": (37.4200, 127.1265),
    "순천": (34.9506, 127.4872),
    "아산": (36.7898, 127.0018),
    "여수": (34.7604, 127.6622),
    "용인": (37.2411, 127.1776),
    "천안": (36.8151, 127.1139),
    "포항": (36.0190, 129.3435),
    "평택": (36.9921, 127.1129),
    "구미": (36.1195, 128.3446),
    "진주": (35.1800, 128.1076),
    "원주": (37.3422, 127.9202),
    "송파": (37.5145, 127.1059),
    "노원": (37.6542, 127.0568),
    "관악": (37.4784, 126.9516),
    "동탄": (37.2038, 127.0967),
    "판교": (37.3948, 127.1112),
    "광안리": (35.1531, 129.1187),
    "센텀시티": (35.1693, 129.1293),
}

_SUFFIXES = ("특별시", "광역시", "특별자치시", "특별자치도", "역", "시", "구", "동", "읍", "면")


def resolve_name(name: str) -> str | None:
    """지명 → 사전 키. 접미사(시·구·동·역)를 떼며 재시도하고, 그래도 없으면
    입력 안에 들어 있는 사전 지명(최장 일치)을 찾는다 — 도로명·지번 주소를
    그대로 넣는 사람이 대부분이라 "서울시 강남구 테헤란로 152" 는 강남으로 잡힌다."""
    if not name:
        return None
    q = name.strip().replace(" ", "")
    if q in PLACES:
        return q
    for suf in _SUFFIXES:
        if q.endswith(suf) and len(q) > len(suf):
            base = q[: -len(suf)]
            if base in PLACES:
                return base
    # 부분 일치 — 긴 이름 먼저 ("광주송정" 이 "광주" 보다 먼저 걸려야 한다)
    for key in sorted(PLACES.keys(), key=len, reverse=True):
        if key in q:
            return key
    return None


def resolve(name: str) -> tuple[float, float] | None:
    """지명 → 좌표."""
    key = resolve_name(name)
    return PLACES[key] if key else None


def search(q: str, limit: int = 8) -> dict:
    """장소 자동완성 — {items: [{name, kind}], resolved}.
    resolved 는 자유 입력을 어느 지명 기준으로 읽었는가 ("그대로 쓰기" 안내용)."""
    from .stations import STATIONS

    q = (q or "").strip()
    if not q:
        return {"items": [], "resolved": None}
    qq = q.replace(" ", "")
    items = []
    for s in STATIONS:
        if qq in s.name or qq in s.tago_name:
            items.append({"name": s.name, "kind": "역"})
    for name in PLACES:
        if qq in name and all(x["name"] != name for x in items):
            items.append({"name": name, "kind": "지역"})
        if len(items) >= limit:
            break
    return {"items": items[:limit], "resolved": resolve_name(q)}


def haversine_km(a: tuple[float, float], b: tuple[float, float]) -> float:
    """두 좌표 사이 거리(km). 도심 이동 추정 용도라 대원거리면 충분하다."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    dlat, dlon = lat2 - lat1, lon2 - lon1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))
