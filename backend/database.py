"""MariaDB 연결 설정

접속 정보는 환경변수(DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)에서 읽는다.
프로젝트 최상위의 .env 파일이 있으면 읽어 오지만, 이미 설정된 환경변수가 우선한다.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import URL, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REQUIRED_SETTINGS = ("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")

load_dotenv(PROJECT_ROOT / ".env")


class DatabaseConfigError(RuntimeError):
    pass


def build_database_url() -> URL:
    missing = [name for name in REQUIRED_SETTINGS if not os.environ.get(name)]
    if missing:
        raise DatabaseConfigError(
            f"DB 접속 정보가 없습니다: {', '.join(missing)}. "
            ".env.example을 참고해 .env를 만들거나 환경변수를 설정하세요."
        )
    # URL.create는 비밀번호의 특수문자를 알아서 처리한다.
    return URL.create(
        "mysql+pymysql",
        username=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        database=os.environ["DB_NAME"],
        # 이모지 등 4바이트 문자를 저장하기 위해 utf8mb4로 접속한다.
        query={"charset": "utf8mb4"},
    )


# pool_pre_ping: 오래 쉬어 끊긴 연결을 쓰기 전에 확인하고 다시 연결한다.
engine = create_engine(build_database_url(), pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass
