"""DB 엔진 — SQLite 파일 하나. *.db 는 .gitignore 에 있다."""
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

DB_PATH = Path(__file__).resolve().parent.parent / "timeproof.db"
engine = create_engine(f"sqlite:///{DB_PATH}", echo=False,
                       connect_args={"check_same_thread": False})


def init_db():
    from . import models  # noqa: F401  (테이블 등록)
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
