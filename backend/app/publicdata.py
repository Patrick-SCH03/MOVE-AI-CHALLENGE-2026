"""data.go.kr 공공데이터 공통 클라이언트.

포털 API 는 전부 같은 모양(serviceKey + response.body.items.item)이라 공통화한다.
여기서 처리하는 포털 특성 셋 — 전부 실제로 밟아 본 것들:
- 키가 이미 URL 인코딩된 형태로 발급된다. urlencode 에 다시 넣으면 서명이 깨진다.
- item 이 하나면 리스트가 아니라 객체로, 없으면 빈 문자열로 온다.
- 오류가 HTTP 200 + XML/JSON 본문 문구로 온다.
"""
import json
import os
import time
import urllib.request
from pathlib import Path
from urllib.parse import urlencode

# 오류 본문 문구 → 사람이 읽을 한국어. blocked 사유로 화면(/api/health)까지 간다
_ERROR_KO = {
    "NO_OPENAPI_SERVICE_ERROR": "오퍼레이션명이 틀렸어요(대소문자 확인)",
    "SERVICE_KEY_IS_NOT_REGISTERED": "서비스 키가 등록되지 않았어요(발급 직후엔 반영까지 시간이 걸려요)",
    "LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS": "일일 요청 한도를 넘었어요",
    "SERVICE_ACCESS_DENIED": "이 API 에 대한 활용 신청이 없어요",
}


class PublicDataClient:
    """회로 차단 내장 — 한 번 실패하면 blocked 로 두고 이후 호출을 건너뛴다.

    매 요청마다 타임아웃을 기다리는 것은 없느니만 못하다(접수 화면이 그만큼 멈춘다).
    reset() 으로만 다시 잇는다.
    """

    def __init__(self, timeout: float = 6.0):
        self.timeout = timeout
        self.blocked: str | None = None  # None 이면 정상, 문자열이면 차단 사유

    @property
    def key(self) -> str:
        return os.getenv("DATA_GO_KR_KEY", "").strip()

    @property
    def state(self) -> str:
        if not self.key:
            return "no_key"
        if self.blocked:
            return "blocked"
        return "ready"

    def reset(self):
        self.blocked = None

    def get(self, base: str, operation: str, **params) -> dict | None:
        """성공 시 파싱된 JSON, 실패 시 None(사유는 self.blocked)."""
        if not self.key or self.blocked:
            return None
        # 키는 이미 인코딩돼 있으므로 문자열로 직접 붙인다 — urlencode 금지
        qs = urlencode({**params, "_type": "json", "numOfRows": 200})
        url = f"{base}/{operation}?serviceKey={self.key}&{qs}"
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as r:
                body = r.read().decode("utf-8")
        except Exception as e:
            self.blocked = f"호출 실패: {e.__class__.__name__}"
            return None
        for marker, ko in _ERROR_KO.items():
            if marker in body:
                self.blocked = ko
                return None
        try:
            return json.loads(body)
        except json.JSONDecodeError:
            self.blocked = "응답이 JSON 이 아니에요(오류 XML 가능성)"
            return None


def rows(payload: dict | None) -> list[dict]:
    """response.body.items.item 언랩.

    포털 규칙: item 이 하나면 객체로, 없으면 items 가 빈 문자열("")로 온다.
    둘 다 리스트로 정규화해야 호출부가 매번 분기하지 않는다.
    """
    if not payload:
        return []
    items = (payload.get("response", {}).get("body", {}) or {}).get("items", "")
    if not items or not isinstance(items, dict):
        return []
    item = items.get("item", [])
    if isinstance(item, dict):
        return [item]
    return item if isinstance(item, list) else []


class DiskCache:
    """디스크 JSON 캐시(TTL). 실패(None)는 캐시하지 않는다 —
    일시 장애가 하루 종일 빈 응답으로 굳는 것을 막는다."""

    def __init__(self, path: str, ttl_sec: int):
        self.path = Path(path)
        self.ttl = ttl_sec

    def _load(self) -> dict:
        if not self.path.exists():
            return {}
        try:
            return json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {}

    def get(self, key: str):
        entry = self._load().get(key)
        if not entry or time.time() - entry["at"] > self.ttl:
            return None
        return entry["data"]

    def put(self, key: str, data):
        if data is None:
            return
        store = self._load()
        store[key] = {"at": time.time(), "data": data}
        self.path.write_text(json.dumps(store, ensure_ascii=False), encoding="utf-8")
