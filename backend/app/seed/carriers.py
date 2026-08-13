"""운반자 시드 — "배송하러 가는 사람"이 아니라 원래 이동(출퇴근·러닝)에 물품을 얹는 사람.

팀원 4명은 손으로 넣는다(시연에 이름이 나온다). 같은 동선·같은 시간대에 신뢰도만
다르게 — 운반자를 바꿨을 때 확률 변화가 깨끗하게 비교되도록.
나머지는 14개 역 주변에 seed 고정으로 자동 생성해 재현 가능하게 한다.
"""
import math
import random
from dataclasses import dataclass

from .stations import STATIONS

# 이동수단 속도 (km/h) — 가정. 통행속도 통계 기반 유도값
SPEED_KMH = {"도보": 4.5, "러닝": 9.0, "자전거": 15.0, "대중교통": 18.0}


@dataclass(frozen=True)
class Carrier:
    id: str
    name: str
    type: str          # 러너·프리랜서·출근길 …
    mode: str          # SPEED_KMH 의 키
    route_from: tuple  # (lat, lon)
    route_to: tuple
    active_from: str   # "HH:MM"
    active_to: str
    completed_count: int
    ontime_rate: float

    @property
    def reliability(self) -> float:
        """R = 0.5×정시율 + 0.5×min(누적/20, 1). 낮은 R 은 '변덕'이 아니라
        '아직 모른다' — 신규 운반자는 실적이 없어서 낮다."""
        return 0.5 * self.ontime_rate + 0.5 * min(self.completed_count / 20, 1.0)


# ── 팀원 4명 — 시연 대조용 ──────────────────────────────────────────────
# 부산 두 명의 활동 시작은 10:00 — 퇴근길(18:00~)로 두면 ③구간이 시작되는
# 16~17시에 활동 밖이라 시연 내내 한 번도 배정되지 않는다 (실제로 당한 사고)
_GANGNAM = (37.4979, 127.0276)
_SEOUL_ST = (37.5546, 126.9707)
_BUSAN_ST = (35.1152, 129.0403)
_BUJEON = (35.1626, 129.0616)

MANUAL: list[Carrier] = [
    Carrier("C001", "조민재", "러너", "러닝", _GANGNAM, _SEOUL_ST, "06:00", "21:00", 47, 0.96),
    Carrier("C037", "김성민", "러너", "러닝", _GANGNAM, _SEOUL_ST, "06:00", "21:00", 1, 0.60),
    Carrier("C023", "현민채", "프리랜서", "대중교통", _BUSAN_ST, _BUJEON, "10:00", "21:00", 44, 0.95),
    Carrier("C038", "김나은", "프리랜서", "대중교통", _BUSAN_ST, _BUJEON, "10:00", "21:00", 2, 0.62),
]

# ── 자동 생성 ──────────────────────────────────────────────────────────
# 프로필 8종 — 특송 열차는 대부분 낮에 뜨므로 활동 시간대가 낮을 덮어야 한다
_PROFILES = [
    ("출근길", "대중교통", "06:30", "09:30"),
    ("러너", "러닝", "06:00", "11:00"),
    ("프리랜서", "대중교통", "10:00", "18:00"),
    ("주부", "도보", "09:00", "16:00"),
    ("통학", "대중교통", "08:00", "13:00"),
    ("자전거", "자전거", "10:00", "17:00"),
    ("오후 러너", "러닝", "14:00", "20:00"),
    ("퇴근길", "대중교통", "17:00", "21:00"),
]

# 역별 두께 — 큰 역일수록 겹을 더 둔다
_LAYERS = {
    "SEO": 6, "YSN": 4, "BSN": 6, "GMY": 3, "DTN": 3, "CAN": 3, "OSG": 3,
    "DJN": 4, "DDG": 4, "GJU": 2, "GSJ": 3, "MKP": 2, "YSU": 2, "GNG": 2,
}

_FAMILY = "김이박최정강조윤장임한오서신권황안송전홍"
_GIVEN1 = "민서지현도예승수하은주태윤재시아"
_GIVEN2 = "준우연아인영훈빈원호진율성경환"


def _offset(lat: float, lon: float, km: float, bearing_rad: float) -> tuple:
    """역 좌표에서 거리·방위로 좌표를 민다. 이 정밀도면 소수점 4자리 근사로 충분하다."""
    dlat = km * math.cos(bearing_rad) / 111.0
    dlon = km * math.sin(bearing_rad) / (111.0 * math.cos(math.radians(lat)))
    return (round(lat + dlat, 4), round(lon + dlon, 4))


def _generate() -> list[Carrier]:
    rng = random.Random(42)  # seed 고정 — 재실행해도 같은 명단이어야 시연이 안 흔들린다
    out: list[Carrier] = []
    n = 100  # id 는 C100 부터 — 수동 4명(C001~C038 대역)과 겹치지 않게
    for st in STATIONS:
        for _ in range(_LAYERS[st.code]):
            for ptype, mode, a_from, a_to in _PROFILES:
                name = (rng.choice(_FAMILY) + rng.choice(_GIVEN1) + rng.choice(_GIVEN2))
                km = rng.uniform(1.5, 9.0)
                bearing = rng.uniform(0, 2 * math.pi)
                home = _offset(st.lat, st.lon, km, bearing)
                # 절반은 역으로 향하고(①구간감), 절반은 역에서 나간다(③구간감)
                toward = rng.random() < 0.5
                r_from, r_to = (home, (st.lat, st.lon)) if toward else ((st.lat, st.lon), home)
                completed = rng.choice([0, 1, 2, 3, 5, 8, 12, 18, 25, 30, 40, 55])
                ontime = round(rng.uniform(0.55, 0.99), 2)
                out.append(Carrier(
                    f"C{n}", name, ptype, mode, r_from, r_to, a_from, a_to, completed, ontime,
                ))
                n += 1
    return out


CARRIERS: list[Carrier] = MANUAL + _generate()
BY_ID: dict[str, Carrier] = {c.id: c for c in CARRIERS}
