"""데이터 모델 — SQLite · SQLModel. ERD 5테이블.

저장 시각은 UTC naive(created_at 등). 단, 인계·계획 시각(start_at·end_at·
handed_over_at)은 서비스 기준 시계의 "HH:MM" 문자열 — 계획과 실제를 빼야 하므로
같은 단위여야 한다. DEMO_TIME 고정 시 벽시계로 저장하면 뺄 수 없다.

만들지 않는 테이블: User(로그인 화면 없음) · Carrier(시드 상수) ·
Train(시간표는 TAGO 에서 — 저장하면 그 순간 낡는다) · Payment(대금 미취급).
"""
from datetime import datetime

from sqlmodel import Field, SQLModel

# 상태·채널 표시명 — 화면 문구의 단일 출처. 라우터·알림이 각자 들고 있으면
# 한쪽만 고쳐진 채 화면마다 다른 이름이 나간다 (실제로 두 벌 있었다)
STATUS_LABELS = {"ACCEPTED": "접수 완료", "PICKED_UP": "수취 완료", "ON_TRAIN": "운송 중",
                 "COMPLETED": "배송 완료", "CANCELLED": "취소됨"}
CHANNEL_LABELS = {"desk": "KTX특송 창구", "locker": "역사 무인함", "relay": "시민 운반",
                  "fullmile": "기사 방문 픽업"}
# 대체 경로(계약 사업자) 담당 표시명 — 경로 계산(route)과 전환(orderflow)이 같은 이름을 쓴다
FALLBACK_NAMES = {1: "픽업 기사", 3: "배송 기사"}


class Order(SQLModel, table=True):
    id: str = Field(primary_key=True)          # "TP" + YYMMDD + 4자리
    origin: str
    destination: str
    item: str | None = None
    declared_value: int | None = None          # 신고가액 = 배상 한도
    deadline: str                              # "HH:MM"
    eta: str                                   # 접수 시점 도착 예정
    train_no: str
    fare: int
    probability: float                         # 접수 시점 종합 확률
    channel: str                               # desk|locker|relay|fullmile
    status: str = "ACCEPTED"                   # ACCEPTED|PICKED_UP|ON_TRAIN|COMPLETED|CANCELLED
    plan_json: str                             # 확정 시점 경로 스냅샷 — 고지한 내용 자체가 증거
    recipient_name: str = ""
    recipient_phone: str = ""
    # 동의 3종 — 하나로 묶지 않는다. 법인 제공과 개인 제공은 같은 동의가 아니다
    notice_consent: bool = False               # 확률·배상 한도 고지 확인
    recipient_consent: bool = False            # 수령인 개인정보 제공
    relay_consent: bool = False                # 시민 운반자(개인) 제3자 제공
    consent_at: datetime | None = None
    pickup_mode: str = "door"                  # door|station
    delay_min: int = 0                         # 확인된 열차 지연 (시연은 수동 주입)
    cancelled_reason: str = ""                 # 취소 사유 — 화면에 그대로 나간다
    created_at: datetime | None = None         # UTC naive


class Leg(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order_id: str = Field(index=True)          # 주문 하나의 구간을 늘 함께 읽는다
    seq: int                                   # 1|2|3
    label: str
    from_name: str
    to_name: str
    carrier_id: str | None = None              # ②구간은 null
    carrier_name: str | None = None
    train_no: str | None = None                # ①③구간은 null
    start_at: str                              # "HH:MM"
    end_at: str                                # 계획 인계 시각
    probability: float
    handover_code: str                         # 6자리
    accepted: bool = False
    handed_over: bool = False
    handed_over_at: str | None = None          # 실제 인계 — 서비스 시계 "HH:MM"
    reward: int = 0
    fallback: bool = False                     # 대체 경로로 넘어갔는가
    fallback_note: str = ""                    # 전환 사유 — 화면에 그대로 나간다


class Call(SQLModel, table=True):
    """배차 콜 이력 — 지우지 않는다. 만료·거절도 남아야 수락률(매칭 밀도의
    유일한 실측)을 셀 수 있다."""
    id: str = Field(primary_key=True)
    order_id: str = Field(index=True)          # 진행 화면이 3초마다 조회한다
    seq: int
    carrier_id: str
    carrier_name: str
    rank: int                                  # 몇 순위에게 갔는가
    reward: int
    detour_km: float = 0.0
    score: float = 0.0
    match_reason: str = ""
    status: str = "RINGING"                    # RINGING|ACCEPTED|REJECTED|EXPIRED
    created_at: datetime | None = None
    expires_at: datetime | None = None         # 발행 + 90초


class ProofEvent(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order_id: str = Field(index=True)
    type: str                                  # RECEIVED|IN_TRANSIT|DELIVERED
    meaning: str                               # 그 사건이 증명하는 사실
    actor: str = ""
    occurred_at: datetime | None = None


class ProofAccess(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    order_id: str = Field(index=True)
    client: str = Field(index=True)            # 사업자별 청구 집계
    billable: bool = True                      # 24시간 내 중복은 False
    at: datetime | None = Field(default=None, index=True)
