"""특송 취급역 14곳 — API 가 알려주지 않는 우리 규정 지식이라 상수로 둔다.

nodeid 는 TAGO 로도 받을 수 있지만(전국 343개) 시연 안정성을 위해 확인된 값을
박아 두고, 조회 실패 시 폴백으로 쓴다. 없는 역은 만들지 않는다 —
역만 있고 편성이 없으면 "역은 있는데 못 보낸다"가 된다.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class Station:
    code: str        # 내부 코드 (SEO, BSN …)
    name: str        # 화면 표기
    tago_name: str   # TAGO 표기 — 여수엑스포만 "여수EXPO" 로 다르다
    node_id: str
    lat: float
    lon: float


STATIONS: list[Station] = [
    Station("SEO", "서울역",     "서울",     "NAT010000", 37.5546, 126.9707),
    Station("YSN", "용산역",     "용산",     "NAT010032", 37.5299, 126.9646),
    Station("GMY", "광명역",     "광명",     "NATH10219", 37.4163, 126.8847),
    Station("DTN", "동탄역",     "동탄",     "NATH30326", 37.2038, 127.0967),
    Station("CAN", "천안아산역", "천안아산", "NATH10960", 36.7946, 127.1045),
    Station("OSG", "오송역",     "오송",     "NAT050044", 36.6199, 127.3268),
    Station("DJN", "대전역",     "대전",     "NAT011668", 36.3325, 127.4342),
    Station("DDG", "동대구역",   "동대구",   "NAT013271", 35.8797, 128.6286),
    Station("GJU", "경주역",     "경주",     "NATH13421", 35.7981, 129.1393),
    Station("BSN", "부산역",     "부산",     "NAT014445", 35.1152, 129.0403),
    Station("GSJ", "광주송정역", "광주송정", "NAT031857", 35.1376, 126.7935),
    Station("MKP", "목포역",     "목포",     "NAT032563", 34.7936, 126.3886),
    Station("YSU", "여수엑스포역", "여수EXPO", "NAT041993", 34.7526, 127.7467),
    Station("GNG", "강릉역",     "강릉",     "NAT601936", 37.7637, 128.8993),
]

BY_CODE: dict[str, Station] = {s.code: s for s in STATIONS}
