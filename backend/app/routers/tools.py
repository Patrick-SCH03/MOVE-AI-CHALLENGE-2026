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


@router.post("/agent")
def post_agent(req: AgentRequest):
    return agent_mod.run(req.utterance, req.history, req.prior, req.now)


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
