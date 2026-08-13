FROM python:3.11-slim
WORKDIR /app

# requirements 를 먼저 복사 — 코드만 고쳤을 때 pip 레이어를 재사용한다
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# exec 형식(JSON 배열)은 셸을 안 거쳐 $PORT 가 문자열 그대로 넘어간다.
# sh -c 로 감싸야 확장된다 — 이거 하나로 헬스체크가 통째로 실패한다
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8020}"]
