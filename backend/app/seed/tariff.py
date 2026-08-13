"""요율 단일 출처 — 운임·요율 숫자는 이 파일에만 둔다.

숫자가 두 곳에 있으면 조용히 어긋난다. 배분 합계는 import 시점에 검증한다.

기본 요금·규격·할증은 KTX-SRT 특송(짐캐리) 공시 요율표에서 그대로 옮긴 실측값이다:
- 규격 6등급 기본요금 (초소형/서류 5,000 ~ 특수 28,000)
- 무게할증: 기본 10kg, 추가 5kg 당 2,000원, 최대 30kg
- 거리할증: 장거리 구간 1,000원 (부산↔수도권 · 광주/전남↔수도권 · 강릉↔서울)
- 가액할증: 50만 초과~100만 5,000 / ~200만 8,000 / ~300만 10,000 · 300만 초과 접수 불가
- 배상: 미신고 시 개당 최대 500,000원

시민 운반 채널 미노출 기준(신고가액 200만 초과)은 약관이 아니라 본 서비스 내부
취급 기준이다 — 불특정 시민이 운반하는 구간의 손해 규모 통제 목적.
"""

# ── 규격 6등급: (등급, 최장변cm, 세변합cm, 기본요금) — 실측(공시 요율) ──
TIERS: list[tuple[str, int, int, int]] = [
    ("초소형/서류", 20, 50, 5_000),
    ("A", 35, 80, 8_000),
    ("B", 50, 100, 10_000),
    ("C", 70, 120, 14_000),
    ("D", 100, 160, 20_000),
    ("특수", 180, 200, 28_000),
]
BASE_FARE: dict[str, int] = {name: fare for name, _, _, fare in TIERS}

# 무게 — 실측(공시 요율)
WEIGHT_BASE_KG = 10
WEIGHT_STEP_KG = 5
WEIGHT_STEP_FEE = 2_000
WEIGHT_MAX_KG = 30

# ── 거리 할증 — 실측(공시 요율): 장거리 구간 1,000원 ──
DISTANCE_FEE = 1_000
_CAPITAL = {"SEO", "YSN", "GMY", "DTN"}          # 서울·경기권 취급역
_LONG_FROM_CAPITAL = {"BSN", "GSJ", "MKP", "YSU", "GNG"}  # 부산 · 광주/전남 · 강릉


def distance_surcharge(dep_code: str, arr_code: str) -> int:
    pair = {dep_code, arr_code}
    if pair & _CAPITAL and pair & _LONG_FROM_CAPITAL:
        return DISTANCE_FEE
    return 0


# ── 가액 — 실측(공시 요율 + 현업 자문) ──
DECLARED_MAX = 3_000_000          # 초과 시 수탁 불가
RELAY_VALUE_MAX = 2_000_000       # 초과 시 시민 운반 채널 미노출 (내부 취급 기준)
DEFAULT_LIABILITY = 500_000       # 미신고 시 배상 한도

_VALUE_BANDS = [(500_000, 0), (1_000_000, 5_000), (2_000_000, 8_000), (3_000_000, 10_000)]


def value_surcharge(declared_value: int | None) -> int:
    if not declared_value:
        return 0
    for limit, fee in _VALUE_BANDS:
        if declared_value <= limit:
            return fee
    return _VALUE_BANDS[-1][1]


# ── 품목 → 등급 사전 — 값을 매길 수 있는 것이 곧 인식 대상이다.
# parse(자연어 접수)도 이 사전을 그대로 쓴다: 인식 사전을 따로 만들면 어긋난다.
# 긴 이름을 먼저 매칭해야 한다("서류봉투" > "서류") — dict 순서가 곧 우선순위
ITEM_TIERS: dict[str, str] = {
    "서류봉투": "초소형/서류",
    "서류": "초소형/서류",
    "계약서": "초소형/서류",
    "여권": "초소형/서류",
    "USB": "초소형/서류",
    "카드": "초소형/서류",
    "카메라 렌즈": "A",
    "렌즈": "A",
    "휴대폰": "A",
    "스마트폰": "A",
    "태블릿": "A",
    "화장품": "A",
    "약": "A",
    "부품": "A",
    "샘플": "A",
    "노트북": "B",
    "책": "B",
    "옷": "B",
    "의류": "B",
    "신발": "B",
    "케이크": "B",
    "카메라": "B",
    "수산물": "C",
    "농산물": "C",
    "과일": "C",
    "특산품": "C",
    "반찬": "C",
    "김치": "C",
    "전자제품": "C",
    "모니터": "C",
    "캐리어": "D",
    "이불": "D",
    "골프채": "특수",
    "그림": "특수",
}


def tier_of(item: str | None) -> str:
    """품목명 → 규격 등급 추정. 모르면 B(중간) — 견적은 나가야 하고, 접수 시 확인한다."""
    if not item:
        return "B"
    for key, tier in ITEM_TIERS.items():
        if key in item:
            return tier
    return "B"


def base_fare(item: str | None, dep_code: str, arr_code: str,
              declared_value: int | None = None) -> tuple[int, list[dict]]:
    """채널 추가분을 제외한 운임과 내역. 반환: (합계, fare_lines)."""
    tier = tier_of(item)
    lines = [{"label": f"기본 운임 ({tier})", "amount": BASE_FARE[tier]}]
    dist = distance_surcharge(dep_code, arr_code)
    if dist:
        lines.append({"label": "거리 할증 (장거리)", "amount": dist})
    val = value_surcharge(declared_value)
    if val:
        lines.append({"label": "가액 할증", "amount": val})
    return sum(x["amount"] for x in lines), lines


def liability_cap(declared_value: int | None) -> int:
    return declared_value if declared_value else DEFAULT_LIABILITY
