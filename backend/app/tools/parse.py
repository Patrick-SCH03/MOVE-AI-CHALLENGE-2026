"""자연어 접수 파서 — Gemini 구조화 출력 + 규칙 폴백.

폴백이 있다는 것은 외부가 느릴 때 포기할 줄 안다는 뜻이어야 한다 —
클라이언트에 8초 타임아웃을 걸고, 넘기면 규칙 폴백으로 같은 흐름이 돈다.
GEMINI_API_KEY 가 없어도 동작이 같다.
"""
import json
import os
import re

from ..clock import to_hhmm
from ..seed.places import PLACES
from ..seed.tariff import ITEM_TIERS

# 타임아웃이 없으면 앞단이 끊으며 502 가 뜬다 (실제로 당한 사고).
# 8초를 걸었더니 Gemini 가 400 "Minimum allowed deadline is 10s" 를 반환 —
# 서버가 허용하는 최소값 10초를 쓴다. 상한이 있다는 사실이 중요하다
GEMINI_TIMEOUT_MS = 10_000

_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "origin": {"type": "STRING", "nullable": True},
        "destination": {"type": "STRING", "nullable": True},
        "item": {"type": "STRING", "nullable": True},
        "declared_value": {"type": "INTEGER", "nullable": True},
        "deadline": {"type": "STRING", "nullable": True, "description": "HH:MM 24시간제"},
        "question": {"type": "STRING", "nullable": True},
    },
}

_PROMPT = """당일 KTX 특송 배송 접수 문장에서 항목을 추출한다.
- origin/destination: 지명(동네·역·시군구). 조사·수식어 제거
- item: 물품명
- declared_value: 신고가액(원, 정수). "85만원짜리" → 850000
- deadline: 도착 데드라인 "HH:MM" 24시간제. 오전/오후 없는 1~8시는 오후로
- 모르는 항목은 null. 지어내지 않는다
이전 접수 상태가 있으면 이번 발화로 보완·수정된 최종 상태를 낸다."""


def _gemini_parse(utterance: str, history: list[str], prior: dict) -> dict | None:
    key = os.getenv("GEMINI_API_KEY", "").strip()
    if not key:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=key,
                              http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_MS))
        context = ""
        if history:
            context += "직전 대화:\n" + "\n".join(history[-6:]) + "\n"
        if prior:
            context += f"이전 접수 상태: {json.dumps(prior, ensure_ascii=False)}\n"
        resp = client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
            contents=f"{_PROMPT}\n\n{context}이번 발화: {utterance}",
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_SCHEMA,
                temperature=0,
            ),
        )
        data = json.loads(resp.text)
        return data if isinstance(data, dict) else None
    except Exception:
        # 타임아웃·한도·형식 오류 전부 — 접수가 막히면 안 되므로 폴백으로 간다
        return None


# ── 규칙 폴백 ──────────────────────────────────────────────────────────

_KO_NUM = {"한": 1, "두": 2, "세": 3, "네": 4, "다섯": 5, "여섯": 6, "일곱": 7,
           "여덟": 8, "아홉": 9, "열": 10, "열한": 11, "열두": 12}


def _parse_value(text: str) -> int | None:
    """금액. 콤마 표기를 먼저 매칭한다 — 단일 정규식은 "1,250,000원"에서
    뒤쪽 "250,000원"에 걸린다. 가액은 할증과 배상 한도를 정하므로 요금이 그대로 틀린다."""
    m = re.search(r"(\d{1,3}(?:,\d{3})+)\s*원", text)
    if m:
        return int(m.group(1).replace(",", ""))
    # 단위 표기 — 이어 붙은 만큼 더한다: "4만5천원" = 45,000
    m = re.search(r"(?:(\d+)\s*억)?\s*(?:(\d+)\s*만)\s*(?:(\d+)\s*천)?\s*원", text)
    if m and m.group(2):
        total = (int(m.group(1) or 0) * 100_000_000
                 + int(m.group(2)) * 10_000
                 + int(m.group(3) or 0) * 1_000)
        return total
    m = re.search(r"(\d{4,})\s*원", text)
    if m:
        return int(m.group(1))
    return None


def _parse_deadline(text: str) -> str | None:
    """시각. "저녁 여섯시" 같은 한글 시각도 읽는다. 오전/오후 없는 1~8시는 오후."""
    pm_hint = bool(re.search(r"오후|저녁|밤|낮", text))
    am_hint = bool(re.search(r"오전|아침|새벽", text))

    m = re.search(r"(\d{1,2}):(\d{2})", text)
    if m:
        h, mi = int(m.group(1)), int(m.group(2))
    else:
        m = re.search(r"(\d{1,2})\s*시\s*(반|\d{1,2}\s*분)?", text)
        if m:
            h = int(m.group(1))
            mi = 30 if m.group(2) == "반" else int(re.sub(r"\D", "", m.group(2) or "0") or 0)
        else:
            m = re.search(r"(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열한|열두|열)\s*시\s*(반)?", text)
            if not m:
                return None
            h, mi = _KO_NUM[m.group(1)], 30 if m.group(2) else 0
    if h > 23 or mi > 59:
        return None
    if not am_hint and 1 <= h <= 8:
        h += 12   # 오전/오후 없는 1~8시는 오후 — 당일배송에서 새벽 6시는 말이 안 된다
    elif pm_hint and h < 12:
        h += 12
    return to_hhmm(h * 60 + mi)


def _parse_item(text: str) -> str | None:
    """품목 — tariff 의 품목→등급 사전을 그대로 쓴다. 긴 이름 먼저."""
    for key in sorted(ITEM_TIERS.keys(), key=len, reverse=True):
        if key in text:
            return key
    return None


def _parse_places(text: str) -> tuple[str | None, str | None]:
    """"X에서 Y로/까지" 패턴 + 지명 사전 대조."""
    origin = destination = None
    m = re.search(r"([가-힣A-Za-z0-9]+)\s*에서", text)
    if m:
        origin = m.group(1)
    m = re.search(r"([가-힣A-Za-z0-9]+)\s*(?:으로|로|까지|에)\s", text + " ")
    if m and m.group(1) != origin:
        destination = m.group(1)
    # 사전에 있는 지명이 순서대로 나오면 그것을 믿는다 (조사 패턴보다 강하다)
    found = [(text.find(name), name) for name in PLACES if name in text]
    found.sort()
    names = [n for _, n in found]
    if len(names) >= 2:
        origin, destination = names[0], names[1]
    elif len(names) == 1:
        if origin in PLACES or not origin:
            origin = origin if origin in PLACES else (origin or None)
        if names[0] != origin:
            destination = destination or names[0]
    return origin, destination


def rules_parse(utterance: str, prior: dict | None = None) -> dict:
    origin, destination = _parse_places(utterance)
    out = {
        "origin": origin,
        "destination": destination,
        "item": _parse_item(utterance),
        "declared_value": _parse_value(utterance),
        "deadline": _parse_deadline(utterance),
        "question": None,
    }
    return _merge(prior or {}, out)


def _merge(prior: dict, new: dict) -> dict:
    """되묻기 답변 병합 — 새 발화가 준 것만 덮어쓴다."""
    merged = dict(prior)
    for k, v in new.items():
        if v is not None and v != "":
            merged[k] = v
    for k in ("origin", "destination", "item", "declared_value", "deadline"):
        merged.setdefault(k, None)
    return merged


def parse(utterance: str, history: list[str] | None = None,
          prior: dict | None = None) -> tuple[dict, str]:
    """반환: (intake, 사용 엔진 "gemini"|"rules")."""
    history, prior = history or [], prior or {}
    data = _gemini_parse(utterance, history, prior)
    if data is not None:
        return _merge(prior, data), "gemini"
    return rules_parse(utterance, prior), "rules"


def missing_fields(intake: dict) -> list[str]:
    need = [("origin", "출발지"), ("destination", "도착지"), ("deadline", "도착 시각")]
    return [label for key, label in need if not intake.get(key)]
