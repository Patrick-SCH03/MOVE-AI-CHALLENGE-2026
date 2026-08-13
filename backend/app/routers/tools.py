"""도구 개별 노출 라우터 — /api/route 등. 오케스트레이터(P5)와 별개로 직접 부를 수 있다."""
from fastapi import APIRouter
from pydantic import BaseModel

from ..tools import route as route_tool

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
