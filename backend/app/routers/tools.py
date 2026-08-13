"""도구 개별 노출 라우터 — 오케스트레이터(/api/agent)와 별개로 직접 부를 수 있다."""
from fastapi import APIRouter
from pydantic import BaseModel

from .. import agent as agent_mod
from ..tools import parse as parse_tool
from ..tools import route as route_tool
from ..tools import screen as screen_tool

router = APIRouter(prefix="/api")


class RouteRequest(BaseModel):
    origin: str
    destination: str
    deadline: str
    now: str | None = None
    force_carriers: dict[str, str] | None = None


@router.post("/route")
def post_route(req: RouteRequest):
    return route_tool.build(req.origin, req.destination, req.deadline,
                            now=req.now, force_carriers=req.force_carriers)


class AgentRequest(BaseModel):
    utterance: str
    history: list[str] | None = None
    prior: dict | None = None
    now: str | None = None
    sort: str | None = None
    force_carriers: dict[str, str] | None = None


@router.post("/agent")
def post_agent(req: AgentRequest):
    return agent_mod.run(req.utterance, req.history, req.prior, req.now,
                         sort=req.sort, force_carriers=req.force_carriers)


@router.get("/places")
def get_places(q: str = ""):
    from ..seed.places import search

    return search(q)


class MatchRequest(BaseModel):
    from_lat: float
    from_lng: float
    to_lat: float
    to_lng: float
    need_at: str


@router.post("/match")
def post_match(req: MatchRequest):
    """구간 후보 — 운반자 교체(시연 장면 2)가 쓴다. 전체 명단이 아니라
    그 구간·시간대의 매칭 후보만 내려준다."""
    from ..clock import service_now, try_min
    from ..tools import match as match_tool

    need = try_min(req.need_at) or service_now()
    now = service_now()
    start, end = (now, need) if need > now else (need, need + 120)
    ranked = match_tool.rank(match_tool.LegQuery(
        (req.from_lat, req.from_lng), (req.to_lat, req.to_lng), start, end))
    return {"candidates": [{
        "id": c.carrier.id, "name": c.carrier.name, "type": c.carrier.type,
        "reliability": round(c.carrier.reliability, 2),
        "detour_km": c.detour_km, "eligible": True, "time_fit": 1.0,
    } for c in ranked[:10]]}


@router.get("/terms")
def get_terms():
    """접수 전 고지 문구 — 화면이 들고 있으면 두 화면이 다른 말을 하게 된다."""
    from ..seed.tariff import DEFAULT_LIABILITY

    return {
        "probability": "표시된 도착 확률은 접수 시점 정보로 산출한 추정치이며, "
                       "운송 상황에 따라 일부 지연될 수 있음을 사전에 고지하는 것입니다. "
                       "고지된 확률 범위에서 발생한 연착에는 연착 배상 책임이 발생하지 않습니다 "
                       "(특송서비스 약관 제20조 ②3 단서).",
        "relay": "①③구간을 시민 운반자가 수행하더라도 이용자에 대한 책임은 회사가 부담합니다 (약관 제19조).",
        "refund": "취소는 열차 탑재 전까지 전액 환불되며, 탑재 후에는 취소 대신 도착역 직접 수령으로 전환할 수 있습니다.",
        "claim": "일부 멸실·훼손은 수령일로부터 14일 이내에 통지해야 하며, 회사의 책임은 수령일로부터 1년이 지나면 소멸합니다 (약관 제23조).",
        "liability": "신고가액을 기재한 경우 그 가액, 기재하지 않은 경우 1개당 50만원이 배상 한도입니다. "
                     "고의·중대한 과실로 인한 손해는 한도와 관계없이 배상합니다.",
        "liability_cap_undeclared": DEFAULT_LIABILITY,
    }


@router.get("/consents")
def get_consents():
    """동의 항목과 문구 — 항목을 묶지 않는다. 법인 제공과 개인 제공은 같은 동의가 아니다."""
    return {
        "person_to_person_channels": ["relay"],
        "items": [
            {"id": "notice_confirm",
             "title": "확률·배상 고지 확인",
             "body": "표시된 도착 확률이 추정치이며 지연 가능성이 있음을 확인했어요. "
                     "배상 한도는 신고가액(미신고 시 50만원)입니다.",
             "basis": "특송서비스 약관 제6조 · 제20조 ②3 단서"},
            {"id": "recipient_notice",
             "title": "수령인에게 알리고 동의를 받았어요",
             "body": "받는 분의 이름·연락처를 배송 목적으로 제공하는 것에 대해 "
                     "받는 분께 미리 알리고 동의를 얻었습니다.",
             "basis": "서비스 이용약관 제7조 · 개인정보 처리방침 3"},
            {"id": "relay_third_party",
             "title": "시민 운반자(개인) 정보 제공 동의",
             "body": "수락한 운반자에게 인계에 필요한 주소·마스킹된 이름·안심번호가 제공되고, "
                     "인계가 끝나면 즉시 가려집니다.",
             "basis": "개인정보 처리방침 4 — 제공 대상이 법인이 아니라 개인입니다"},
        ],
    }


@router.get("/documents")
def list_documents(audience: str | None = None):
    from ..seed.documents import DOCUMENTS

    docs = DOCUMENTS
    if audience == "carrier":
        # 운반자 화면에서는 운반자 약관을 앞세운다
        docs = sorted(DOCUMENTS, key=lambda d: d["id"] != "carrier")
    return {"documents": [{"id": d["id"], "title": d["title"], "summary": d["summary"]}
                          for d in docs]}


@router.get("/documents/{doc_id}")
def get_document(doc_id: str):
    from fastapi import HTTPException

    from ..seed.documents import BY_ID

    doc = BY_ID.get(doc_id)
    if not doc:
        raise HTTPException(404, "없는 문서예요.")
    return doc


class ParseRequest(BaseModel):
    utterance: str
    history: list[str] | None = None
    prior: dict | None = None


@router.post("/parse")
def post_parse(req: ParseRequest):
    intake, engine = parse_tool.parse(req.utterance, req.history, req.prior)
    return {"intake": intake, "engine": engine,
            "missing": parse_tool.missing_fields(intake)}


class ScreenRequest(BaseModel):
    item: str | None = None
    declared_value: int | None = None


@router.post("/screen")
def post_screen(req: ScreenRequest):
    return screen_tool.screen(req.item, req.declared_value)
