"""규정 판정 — 금지품 차단·고가품 할증·시민 운반 제외.

근거 조문은 특송서비스 약관의 실제 조문만 쓴다 — 제10조(수탁 거절),
제20조(손해배상). 조문 번호를 지어내지 않는다. 확실하지 않으면 번호 없이
"약관의 수탁 거절 사유"라고만 쓴다.
"""
from ..seed import tariff

# 금지 품목 사전 — 운영사 운송약관 운송금지 품목 (실측: 공시 안내 기준)
_PROHIBITED: list[tuple[str, str, str]] = [
    # (키워드, 사유, 조문)
    ("현금", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("어음", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("수표", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("유가증권", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("상품권", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("귀금속", "현금화할 수 있는 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("독극물", "위험 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("농약", "위험 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("휘발유", "휘발성 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("스프레이", "휘발성 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("페인트", "휘발성 물품은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("총", "총포류는 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("동물", "동물은 보낼 수 없어요", "특송서비스 약관 제10조(수탁 거절)"),
    ("리튬배터리", "리튬배터리 단독 운송은 보낼 수 없어요", "약관의 수탁 거절 사유"),
    ("배터리", "배터리 단독 운송은 보낼 수 없어요", "약관의 수탁 거절 사유"),
]

# 파손 위험 품목 — 차단이 아니라 포장 안내. 릴레이는 인계가 두 번이라 더 중요하다
_FRAGILE = ("노트북", "카메라", "렌즈", "모니터", "태블릿", "휴대폰", "스마트폰", "케이크", "그림")


def screen(item: str | None, declared_value: int | None,
           raw_text: str | None = None) -> dict:
    """판정: PASS(통과) / CONDITIONAL(조건부) / BLOCKED(불가) / HOLD(판단유보).

    금지품 스캔은 파싱된 품목만이 아니라 원문도 본다 — "현금 300만원 보내줘"는
    품목 사전(값을 매길 수 있는 것)에 '현금'이 없어 item 이 비지만, 차단은 되어야 한다.
    """
    findings: list[dict] = []
    text = f"{item or ''} {raw_text or ''}"

    for kw, why, clause in _PROHIBITED:
        if kw in text:
            return {"verdict": "BLOCKED", "surcharge": 0, "relay_allowed": False,
                    "findings": [{"keyword": kw, "note": why, "clause": clause}]}

    if declared_value and declared_value > tariff.DECLARED_MAX:
        return {"verdict": "BLOCKED", "surcharge": 0, "relay_allowed": False,
                "findings": [{"note": "신고가액 300만원 초과 물품은 수탁할 수 없어요 (할증 적용 상한)",
                              "clause": "특송서비스 약관 제10조(수탁 거절)"}]}

    verdict = "PASS"
    surcharge = tariff.value_surcharge(declared_value)
    relay_allowed = not (declared_value and declared_value > tariff.RELAY_VALUE_MAX)

    if surcharge:
        verdict = "CONDITIONAL"
        findings.append({"note": f"신고가액 할증 {surcharge:,}원이 더해져요. "
                                 f"배상 한도는 신고가액까지예요 (미신고 시 50만원)",
                         "clause": "특송서비스 약관 제20조(손해배상)"})
    if not relay_allowed:
        findings.append({"note": "신고가액 200만원 초과 물품은 시민 운반 채널에서 제외돼요. "
                                 "창구·픽업으로 안내드려요 (내부 취급 기준)",
                         "clause": ""})
    if item and any(f in item for f in _FRAGILE):
        verdict = "CONDITIONAL" if verdict == "PASS" else verdict
        findings.append({"note": "파손 위험 품목이에요. 완충 포장을 해 주세요 — "
                                 "릴레이는 인계가 두 번이라 포장이 더 중요해요",
                         "clause": ""})

    return {"verdict": verdict, "surcharge": surcharge,
            "relay_allowed": relay_allowed, "findings": findings}
