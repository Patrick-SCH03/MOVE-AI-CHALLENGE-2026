"""오케스트레이터 — 도구를 순서대로 부르고 호출 로그를 응답에 넣는다.

이 로그(tool_calls)가 화면의 'AI 활용 증거'다:
AI-4 자연어 접수 → AI-5 규정 판정 → AI-2 경로·매칭 → AI-3 적재 확인
→ AI-1 확률 → 채널 비교.

금지품 판정은 결측 되묻기보다 먼저 — "현금 300만원 보내줘"에 "몇 시까지요?"를
물으면 답할 수 없는 질문을 시키는 것이다.
"""
import time

from . import tago
from .clock import service_now, to_hhmm, today_yyyymmdd, try_min
from .tools import channels as channels_tool
from .tools import parse as parse_tool
from .tools import route as route_tool
from .tools import screen as screen_tool


class _Log:
    def __init__(self):
        self.calls: list[dict] = []

    def add(self, tool: str, ai: str, note: str, started: float,
            input_: dict, output: dict):
        self.calls.append({
            "seq": len(self.calls) + 1, "tool": tool, "ai": ai,
            "elapsed_ms": int((time.perf_counter() - started) * 1000),
            "note": note, "input": input_, "output": output,
        })


def run(utterance: str, history: list[str] | None = None,
        prior: dict | None = None, now: str | None = None,
        sort: str | None = None, force_carriers: dict | None = None) -> dict:
    log = _Log()
    now_min = try_min(now) if now else service_now()
    if now_min is None:
        now_min = service_now()

    # AI-4 — 자연어 접수
    t0 = time.perf_counter()
    intake, engine = parse_tool.parse(utterance, history, prior)
    log.add("자연어 접수 처리", "AI-4",
            "엔티티 추출 및 결측 재질의" + (" (규칙 폴백)" if engine == "rules" else ""),
            t0, {"utterance": utterance}, {k: v for k, v in intake.items() if v is not None})

    # AI-5 — 규정 판정. 금지품이면 결측이 있어도 즉시 차단
    t0 = time.perf_counter()
    screening = screen_tool.screen(intake.get("item"), intake.get("declared_value"),
                                   raw_text=utterance)
    log.add("규정·수탁 판정", "AI-5",
            f"판정 {screening['verdict']}", t0,
            {"item": intake.get("item"), "declared_value": intake.get("declared_value")},
            screening)
    if screening["verdict"] == "BLOCKED":
        reason = screening["findings"][0]["note"] if screening["findings"] else "수탁할 수 없는 물품이에요"
        return {"stage": "BLOCKED",
                "message": f"{reason}.",
                "intake": {**intake, "missing": []},
                "screening": screening, "route": None, "options": [],
                "tool_calls": log.calls}

    # 결측 되묻기
    missing = parse_tool.missing_fields(intake)
    if missing:
        question = f"{' · '.join(missing)} 정보가 필요해요. 알려주시겠어요?"
        return {"stage": "ASK", "message": question,
                "intake": {**intake, "missing": missing},
                "screening": screening, "route": None, "options": [],
                "tool_calls": log.calls}

    # AI-2 — 경로·매칭
    t0 = time.perf_counter()
    plan = route_tool.build(intake["origin"], intake["destination"],
                            intake["deadline"], now=to_hhmm(now_min),
                            force_carriers=force_carriers)
    if plan.get("feasible"):
        note = f"{plan['dep_station']}→{plan['arr_station']} {plan['train_no']} · 3구간 조립"
        out = {"train_no": plan["train_no"], "eta": plan["eta"],
               "carriers": [leg.get("carrier_name") for leg in plan["legs"]]}
    else:
        note = "가능 경로 없음"
        out = {"reason": plan.get("reason")}
    log.add("경로 탐색·운반자 매칭", "AI-2", note, t0,
            {"origin": intake["origin"], "destination": intake["destination"],
             "deadline": intake["deadline"]}, out)

    if not plan.get("feasible"):
        return {"stage": "ASK", "message": plan.get("reason", "지금은 경로를 만들 수 없어요."),
                "intake": {**intake, "missing": []},
                "screening": screening, "route": plan,
                "suggestions": plan.get("suggestions", []),
                "options": [], "tool_calls": log.calls}

    # AI-3 — 적재 확인 (모의 — 실제 적재 연동은 계약이 필요한 영역이라 형식만 남긴다)
    t0 = time.perf_counter()
    remaining = [t for t in tago.trains_between(plan["dep_code"], plan["arr_code"],
                                               today_yyyymmdd())
                 if t.no == plan["train_no"]]
    log.add("적재 공간 확인 (모의)", "AI-3",
            "잔여 공간 확인 — 실운영에서는 적재 관제 연동", t0,
            {"train_no": plan["train_no"]},
            {"available": bool(remaining), "note": "모의 확인"})

    # AI-1 — 확률 (경로 조립에 내장된 몬테카를로 결과를 요약해 보고)
    t0 = time.perf_counter()
    log.add("성공 확률 산출", "AI-1",
            f"몬테카를로 {plan['iterations']:,}회 · 곱셈 불변식", t0,
            {"deadline": intake["deadline"]},
            {"combined": plan["combined_probability"],
             "legs": [leg["probability"] for leg in plan["legs"]]})

    # 채널 비교
    t0 = time.perf_counter()
    options = channels_tool.compare(plan, intake.get("item"),
                                    intake.get("declared_value"),
                                    intake["deadline"], now_min)
    # 정렬 — 무엇을 우선할지는 이용자가 고른다. 선택 불가는 항상 뒤로
    if sort == "cheapest":
        options.sort(key=lambda c: (not c["feasible"], c["fare"]))
    elif sort == "latest":
        options.sort(key=lambda c: (not c["feasible"], -(try_min(c.get("cutoff") or "") or 0)))
    else:  # guarantee (기본)
        options.sort(key=lambda c: (not c["feasible"], -c["probability"]))
    log.add("4채널 비교", "도구",
            f"선택 가능 {sum(1 for c in options if c['feasible'])}채널", t0,
            {"deadline": intake["deadline"]},
            {c["id"]: c["probability_label"] for c in options if c["feasible"]})

    return {"stage": "QUOTED", "message": "확인했어요. 4개 채널을 비교해 드릴게요.",
            "intake": {**intake, "missing": []},
            "screening": screening, "route": plan, "options": options,
            "tool_calls": log.calls}
