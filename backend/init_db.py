"""tasks 테이블을 만든다.

실행: python -m backend.init_db

이미 있는 테이블은 건드리지 않는다. (삭제·초기화하지 않으므로 여러 번 실행해도 안전하다)
"""

import sys

from sqlalchemy import inspect
from sqlalchemy.exc import SQLAlchemyError


def main() -> int:
    try:
        from backend import models  # noqa: F401  테이블 정의를 Base에 등록한다.
        from backend.database import Base, engine
    except RuntimeError as error:
        print(f"오류: {error}", file=sys.stderr)
        return 1

    try:
        existing = set(inspect(engine).get_table_names())
        Base.metadata.create_all(engine)
        current = set(inspect(engine).get_table_names())
    except SQLAlchemyError as error:
        # 오류 메시지에 비밀번호는 포함되지 않는다.
        print(f"오류: DB에 연결하거나 테이블을 만들지 못했습니다. {error.orig or error}", file=sys.stderr)
        return 1

    for table in Base.metadata.sorted_tables:
        if table.name in existing:
            print(f"{table.name}: 이미 있음 (변경하지 않음)")
        elif table.name in current:
            print(f"{table.name}: 생성함")
    return 0


if __name__ == "__main__":
    sys.exit(main())
