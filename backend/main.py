from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import TaskRow
from backend.schemas import Priority, Status, Task, TaskCreate, TaskUpdate

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(title="Task Flow API")


def get_session() -> Iterator[Session]:
    """요청마다 DB 세션을 열고, 응답 후 닫는다."""
    with SessionLocal() as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


def to_task(row: TaskRow) -> Task:
    """DB 행을 API 응답 형식으로 바꾼다. created_at은 UTC로 저장되어 있다."""
    return Task(
        id=row.id,
        title=row.title,
        description=row.description,
        status=row.status,
        priority=row.priority,
        due_date=row.due_date,
        created_at=row.created_at.replace(tzinfo=UTC),
    )


def get_row_or_404(session: Session, task_id: int) -> TaskRow:
    row = session.get(TaskRow, task_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return row


@app.get("/api/health")
def health() -> dict[str, str]:
    """서버가 요청을 받을 수 있는지 확인한다."""
    return {"status": "ok"}


@app.get("/api/tasks")
def list_tasks(
    session: SessionDep,
    q: str | None = None,
    status: Status | None = None,
    priority: Priority | None = None,
) -> list[Task]:
    """할 일 목록을 등록 순서(id 오름차순)로 반환한다.

    q(제목 부분 일치, 대소문자 무시), status, priority를 함께 주면 AND 조건으로 거른다.
    """
    statement = select(TaskRow).order_by(TaskRow.id)

    query = (q or "").strip().lower()
    if query:
        # 대소문자만 무시하고 그 외 글자는 정확히 비교하도록 소문자 + 바이너리 비교를 쓴다.
        # (DB 기본 정렬 규칙은 é와 e도 같게 본다)
        # autoescape: 검색어의 %, _ 를 와일드카드가 아닌 글자로 찾는다.
        statement = statement.where(
            func.lower(TaskRow.title)
            .collate("utf8mb4_bin")
            .contains(query, autoescape=True)
        )
    if status is not None:
        statement = statement.where(TaskRow.status == status)
    if priority is not None:
        statement = statement.where(TaskRow.priority == priority)

    return [to_task(row) for row in session.scalars(statement)]


@app.post("/api/tasks", status_code=201)
def create_task(payload: TaskCreate, session: SessionDep) -> Task:
    """할 일을 등록한다. id는 DB가, created_at은 서버가 정한다."""
    row = TaskRow(
        **payload.model_dump(),
        # DB DATETIME에는 시간대가 없으므로 UTC 시각을 시간대 정보 없이 저장한다.
        created_at=datetime.now(UTC).replace(microsecond=0, tzinfo=None),
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return to_task(row)


@app.patch("/api/tasks/{task_id}")
def update_task(task_id: int, payload: TaskUpdate, session: SessionDep) -> Task:
    """전달한 필드만 수정한다. 전달하지 않은 필드는 기존 값을 유지한다."""
    row = get_row_or_404(session, task_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
    session.commit()
    session.refresh(row)
    return to_task(row)


@app.delete("/api/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, session: SessionDep) -> None:
    """할 일을 삭제한다. 삭제 확인은 프런트엔드가 담당한다."""
    session.delete(get_row_or_404(session, task_id))
    session.commit()


# 화면 파일(frontend/)을 같은 주소에서 제공한다. 화면과 API의 주소가 같아 CORS 설정이 필요 없다.
# /api 경로가 먼저 처리되도록 모든 API를 등록한 뒤 마지막에 연결한다.
app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
