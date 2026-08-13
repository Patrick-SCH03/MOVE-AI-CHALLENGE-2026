"""운영 이력 시드 — 화면의 모든 통계는 실제 주문 행 집계에서 나와야 한다.

지난 7일 × 하루 25~45건을 실제로 경로를 세워 생성한다. 원칙 셋:
- 결과는 예측에서 생성한다 (성공 여부 ~ p^1.10). 무관하게 뽑으면 "예측 43%인데
  실제 94% 도착" 이력이 쌓여 보정할 것이 없어진다.
- 확률 0.75 미만이면 접수하지 않고 시각을 미룬다 — 사람이 하는 행동이다.
- 접수 시각은 계획을 세운 시각. KST 벽시계를 UTC naive 로 바꿔 저장한다.
"""
import json
import os
import random
from datetime import timedelta

from sqlmodel import Session, select

from ..clock import now_kst, service_now, to_hhmm, to_min
from ..db import engine
from ..models import Leg, Order
from ..tools import route as route_tool

# 시드 경로 풀 — 지명 사전에 있고 생활권 밖(40km+)인 조합만
_ROUTES = [
    ("강남", "서면"), ("마포", "해운대"), ("여의도", "대구"), ("잠실", "해운대"),
    ("서면", "강남"), ("대전", "마포"), ("수원", "부산"), ("강남", "광주"),
    ("부전동", "여의도"), ("천안", "부산"),
]
_ITEMS = ["노트북", "서류", "계약서", "화장품", "부품", "수산물", "책", "태블릿",
          "카메라", "반찬", "샘플", "의류"]
_VALUES = [None, None, None, 150_000, 300_000, 550_000, 850_000, 1_200_000]
_CHANNELS = ["desk"] * 39 + ["relay"] * 34 + ["locker"] * 19 + ["fullmile"] * 8


def _make_order(s: Session, rng: random.Random, day_offset: int, seq: int,
                plan: dict, origin: str, dest: str, now_min: int) -> Order:
    day = now_kst() - timedelta(days=day_offset)
    channel = rng.choice(_CHANNELS)
    item = rng.choice(_ITEMS)
    value = rng.choice(_VALUES)
    if channel == "relay" and value and value > 2_000_000:
        value = 850_000
    p = plan["combined_probability"]

    status = "COMPLETED" if day_offset > 0 else "ACCEPTED"
    late = False
    if day_offset > 0:
        if rng.random() < 0.09:
            status = "CANCELLED"
        else:
            # 결과는 예측에서 — 성공 ~ p^1.10
            late = rng.random() >= p ** 1.10
    eta = plan["eta"]
    if late:
        # 실패 건은 데드라인을 넘긴 도착으로 남긴다 — 정시율 집계의 분모·분자가 된다
        eta = to_hhmm(to_min(plan["deadline"]) + rng.randint(4, 28))

    created_kst = day.replace(hour=now_min // 60, minute=now_min % 60,
                              second=0, microsecond=0)
    order = Order(
        id=f"TP{day.strftime('%y%m%d')}{seq:04d}",
        origin=origin, destination=dest, item=item, declared_value=value,
        deadline=plan["deadline"], eta=eta, train_no=plan["train_no"],
        fare=10_000 + rng.choice([1000, 1000, 3000, 7000]),
        probability=p, channel=channel, status=status,
        plan_json=json.dumps(plan, ensure_ascii=False),
        notice_consent=True, recipient_consent=True, relay_consent=channel == "relay",
        created_at=created_kst.replace(tzinfo=None) - timedelta(hours=9),
    )
    s.add(order)
    handed = status == "COMPLETED"
    for leg_d in plan["legs"]:
        s.add(Leg(
            order_id=order.id, seq=leg_d["seq"], label=leg_d["label"],
            from_name=leg_d["from_name"], to_name=leg_d["to_name"],
            carrier_id=leg_d.get("carrier_id"), carrier_name=leg_d.get("carrier_name"),
            train_no=leg_d.get("train_no"),
            start_at=leg_d["start_at"], end_at=leg_d["end_at"],
            probability=leg_d["probability"], handover_code=f"{rng.randint(0, 999999):06d}",
            accepted=True, handed_over=handed,
            handed_over_at=leg_d["end_at"] if handed else None,
            reward=leg_d.get("reward", 0),
        ))
    return order


def generate():
    rng = random.Random(20260813)   # seed 고정 — 재기동해도 같은 이력
    made = 0
    # 시드는 정밀도보다 속도 — 반복 수를 낮췄다가 끝나면 되돌린다
    prev_iter = os.environ.get("MC_ITERATIONS")
    os.environ["MC_ITERATIONS"] = "2000"
    try:
        with Session(engine) as s:
            for day_offset in range(7, -1, -1):
                target = rng.randint(25, 45) if day_offset > 0 else rng.randint(6, 10)
                # 기동 로그 — Railway 첫 배포에서 시드가 어디까지 왔는지 보인다
                print(f"[seed] D-{day_offset} 목표 {target}건", flush=True)
                seq = 0
                tries = 0
                while seq < target and tries < target * 4:
                    tries += 1
                    origin, dest = rng.choice(_ROUTES)
                    # 오늘 건은 지금(service_now)보다 미래로 접수하지 않는다
                    hi = min(16 * 60, service_now() - 60) if day_offset == 0 else 16 * 60
                    if hi <= 9 * 60:
                        break
                    now_min = rng.randint(9 * 60, hi)
                    deadline = to_hhmm(min(21 * 60, now_min + rng.choice([180, 240, 300, 360])))
                    plan = route_tool.build(origin, dest, deadline, now=to_hhmm(now_min),
                                            with_suggestions=False)
                    # 확률 0.75 미만이면 접수하지 않고 미룬다 — 다음 시도로
                    if not plan.get("feasible") or plan["combined_probability"] < 0.75:
                        continue
                    seq += 1
                    _make_order(s, rng, day_offset, seq, plan, origin, dest, now_min)
                    made += 1
            s.commit()
    finally:
        if prev_iter is None:
            os.environ.pop("MC_ITERATIONS", None)
        else:
            os.environ["MC_ITERATIONS"] = prev_iter
    return made


def seed_if_empty() -> int:
    """기동 시 DB 가 비어 있을 때만. TAGO 가 안 되면 조용히 넘어간다 —
    시드 실패가 서버 기동을 막으면 안 된다."""
    with Session(engine) as s:
        if s.exec(select(Order).limit(1)).first():
            return 0
    try:
        return generate()
    except Exception:
        return 0
