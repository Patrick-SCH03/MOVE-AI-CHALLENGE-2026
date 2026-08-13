"""TAGO 연동 확인 — 키가 있어야 돈다 (CI 통합 잡 전용, 로컬 수동 확인용).

성공 기준: 서울→부산 오늘 KTX N편, 첫차·막차가 찍힌다.
"""
import sys
from pathlib import Path

# Windows 콘솔이 cp949 라 한국어 출력이 깨진다 — 테스트 출력은 UTF-8 로 고정
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from app import tago
from app.clock import today_yyyymmdd


def main() -> int:
    today = today_yyyymmdd()
    if tago.client.state == "no_key":
        print("DATA_GO_KR_KEY 없음 — 확인 불가 (.env 를 채우세요)")
        return 1
    trains = tago.trains_between("SEO", "BSN", today)
    if tago.client.blocked:
        print(f"차단됨: {tago.client.blocked}")
        return 1
    if not trains:
        print("서울→부산 오늘 KTX 0편 — 날짜 보정 로직 또는 포털 상태를 확인")
        return 1
    print(f"서울→부산 오늘({today}) KTX {len(trains)}편, "
          f"첫차 {trains[0].dep_time} 막차 {trains[-1].dep_time}")
    # 시각 형식·정렬 성질 확인
    assert all(len(t.dep_time) == 5 and ":" in t.dep_time for t in trains)
    assert [t.dep_time for t in trains] == sorted(t.dep_time for t in trains)
    assert all(t.grade == "KTX" for t in trains)
    print("형식·정렬·등급 필터 통과")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
