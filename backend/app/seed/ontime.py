"""열차 정시율·지연 — '늦을 확률'과 '늦는 크기'는 출처가 다르다. 섞지 않는다.

늦을 확률 = 1 − 정시율, 늦는 크기 = 지수분포 평균. 값은 두 층이다:
- 실측 — 한국철도공사 열차운행정보(trainrun)로 어제 계획 대 실적을 전수 대조한
  값. 있으면 이것을 쓴다. KTX 만 — SRT 는 운영사((주)SR)가 달라 이 데이터에 없다.
- 공시 폴백 — 사업자 공표 실적. 키가 없거나(CI) 수집 전이면 이것.
  · KTX 0.8269 — 한국철도공사 「2024년 여객열차 정시운행률」 (5분 기준)
  · SRT 0.9648 — SR 「SRT 정시운행률(2025년 상반기 기준)」 (5분 기준)

UIC 15분 기준(99%대)을 쓰면 화면 확률이 전부 99%에 붙어 정보가 없어진다.
분 단위 데드라인을 파는 서비스라 보수 기준(사업자 공표와 같은 5분)을 쓴다.

늦는 크기를 잴 때는 반드시 정시율이 정한 꼬리(5분 초과 건)에서 잰다 —
"1분 이상 늦은 열차" 평균을 쓰면 전혀 다른 사건의 값이 된다. trainrun 이
이 규칙으로 잰다.
"""
from .. import trainrun

ONTIME_RATE = {
    "KTX": 0.8269,   # 공시 폴백 — 사업자 공표
    "SRT": 0.9648,   # 공시 폴백 — 사업자 공표
}

DELAY_MEAN_MIN = 12.0  # 공시 폴백의 지연 크기 — 가정값 (실측이 있으면 안 쓴다)


def rate(grade: str) -> float:
    """정시율 — 실측(어제 전수, 표본 충분) 우선, 아니면 공시 폴백."""
    if grade == "KTX":
        m = trainrun.measured()
        if m:
            return m["ontime_rate"]
    return ONTIME_RATE.get(grade, ONTIME_RATE["KTX"])


def delay_mean(grade: str) -> float:
    """지연 크기(지수분포 평균, 분) — 정시율과 같은 출처에서 함께 온다.
    확률은 실측인데 크기만 가정값이면 두 숫자의 기준이 어긋난다."""
    if grade == "KTX":
        m = trainrun.measured()
        if m and m.get("delay_mean_min"):
            return m["delay_mean_min"]
    return DELAY_MEAN_MIN


def provenance(grade: str = "KTX") -> dict:
    """지금 확률 엔진이 어느 출처로 도는지 — 운영자 화면·health 가 보여 준다."""
    m = trainrun.measured() if grade == "KTX" else None
    if m:
        return {"source": "실측", "detail": f"전일({m['date']}) 계획·실적 {m['n']}편 대조",
                "rate": rate(grade), "delay_mean_min": delay_mean(grade)}
    return {"source": "공시", "detail": "사업자 공표 정시운행률 (실측 폴백)",
            "rate": rate(grade), "delay_mean_min": delay_mean(grade)}
