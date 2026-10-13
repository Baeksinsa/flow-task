"""API 요청·응답 형식과 입력 검증 규칙 (API-SPEC.md 참고)"""

import re
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    StringConstraints,
    field_validator,
)

Status = Literal["TODO", "DOING", "DONE"]
Priority = Literal["HIGH", "NORMAL", "LOW"]

# 앞뒤 공백 제거 후 1~100자. 파이썬 문자열 길이는 코드 포인트 단위라 프런트엔드와 기준이 같다.
Title = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
]
Description = Annotated[str, StringConstraints(max_length=2000)]
DATE_PATTERN = re.compile(r"\d{4}-\d{2}-\d{2}")


def check_due_date_format(value: Any) -> Any:
    """null 또는 "YYYY-MM-DD" 문자열만 통과시킨다.

    기본 date 변환은 "2026-10-14T00:00:00" 같은 값도 받아들이므로 형식을 먼저 검사한다.
    실제 존재하는 날짜인지는 이어지는 date 변환에서 검사한다. (예: 2026-02-30 거절)
    """
    if value is None:
        return None
    if not isinstance(value, str) or not DATE_PATTERN.fullmatch(value):
        raise ValueError("due_date는 YYYY-MM-DD 형식이어야 합니다.")
    return value


DueDate = Annotated[date | None, BeforeValidator(check_due_date_format)]


class TaskCreate(BaseModel):
    # 정의되지 않은 필드(id, created_at 포함)는 422로 거절한다.
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description = ""
    status: Status = "TODO"
    priority: Priority = "NORMAL"
    due_date: DueDate = None


class TaskUpdate(BaseModel):
    """전달한 필드만 수정한다. 전달하지 않은 필드는 model_fields_set에 없다."""

    model_config = ConfigDict(extra="forbid")

    title: Title | None = None
    description: Description | None = None
    status: Status | None = None
    priority: Priority | None = None
    # due_date만 null을 허용한다. null은 마감일을 지운다.
    due_date: DueDate = None

    @field_validator("title", "description", "status", "priority", mode="before")
    @classmethod
    def reject_null(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("null로 바꿀 수 없는 필드입니다.")
        return value


class Task(BaseModel):
    id: int
    title: str
    description: str
    status: Status
    priority: Priority
    due_date: date | None
    created_at: datetime
