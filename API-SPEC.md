# Task Flow API 명세

PRD.md의 요구사항을 API로 옮긴 계약이다. 메모리 단계(T06~T08)와 DB 단계(T11)에서 같은 계약을 유지한다.

## 공통

- 기본 주소: `http://127.0.0.1:8000` (개발), 모든 경로는 `/api`로 시작한다.
- 요청·응답 본문은 JSON(UTF-8)이다.
- 인증은 없다. (PRD: 로그인 없는 단일 사용자)
- 자동 문서: `/docs` (Swagger UI)
- 화면 제공: API 서버가 `frontend/` 파일을 `/` 주소로 함께 제공한다. 화면과 API의 주소가 같으므로 CORS 설정은 두지 않는다.
  서버 분리 단계에서는 Nginx가 화면 파일을 제공하고 `/api`를 App 서버로 전달한다.

## 구현 단계

| 엔드포인트 | 작업 |
|---|---|
| `GET /api/health` | T05 |
| `GET /api/tasks`, `POST /api/tasks` | T06 |
| `PATCH /api/tasks/{id}`, `DELETE /api/tasks/{id}`, 목록 필터 | T07 |

## Task 객체

| 필드 | 타입 | 설명 |
|---|---|---|
| `id` | integer | 서버가 발급하는 고유 번호. 수정·삭제는 이 값으로 한다. 클라이언트가 보낼 수 없다. |
| `title` | string | 앞뒤 공백 제거 후 1~100자 |
| `description` | string | 0~2000자. 기본값 `""` |
| `status` | string | `TODO`, `DOING`, `DONE` 중 하나. 기본값 `TODO` |
| `priority` | string | `HIGH`, `NORMAL`, `LOW` 중 하나. 기본값 `NORMAL` |
| `due_date` | string \| null | `YYYY-MM-DD` 형식의 실제 날짜. 미지정은 `null`. 기본값 `null` |
| `created_at` | string | 서버가 기록하는 생성 시각. ISO 8601 UTC (예: `2026-10-13T06:23:49Z`). 클라이언트가 보낼 수 없다. |

```json
{
  "id": 1,
  "title": "주간 보고서 작성",
  "description": "금요일까지 공유",
  "status": "TODO",
  "priority": "HIGH",
  "due_date": "2026-10-17",
  "created_at": "2026-10-13T06:23:49Z"
}
```

- 글자 수는 문자(코드 포인트) 단위로 센다. 프런트엔드와 같은 기준이다.
- 지연 여부는 응답에 포함하지 않는다. PRD F09가 사용자의 로컬 달력 날짜를 기준으로 하므로 프런트엔드가 계산한다.
- 요청에 정의되지 않은 필드(`id`, `created_at` 포함)가 있으면 422로 거절한다.

## GET /api/health

서버가 요청을 받을 수 있는지 확인한다.

- 응답 `200`: `{"status": "ok"}`

## GET /api/tasks

할 일 목록을 등록 순서(`id` 오름차순)로 반환한다.

쿼리 파라미터 (모두 선택, 함께 쓰면 AND 조건):

| 이름 | 설명 |
|---|---|
| `q` | 제목 부분 일치 검색. 앞뒤 공백 제거, 대소문자 구분 없음. 빈 값은 조건 없음 |
| `status` | `TODO`, `DOING`, `DONE` 중 하나 |
| `priority` | `HIGH`, `NORMAL`, `LOW` 중 하나 |

- 응답 `200`: Task 배열. 결과가 없으면 `[]`
- 응답 `422`: `status`, `priority`가 허용값이 아닐 때

## POST /api/tasks

할 일을 등록한다.

요청 본문:

| 필드 | 필수 | 비고 |
|---|---|---|
| `title` | 예 | |
| `description` | 아니요 | 기본값 `""` |
| `status` | 아니요 | 기본값 `TODO` |
| `priority` | 아니요 | 기본값 `NORMAL` |
| `due_date` | 아니요 | 기본값 `null` |

```json
{ "title": "장보기", "priority": "HIGH", "due_date": "2026-10-14" }
```

- 응답 `201`: 생성된 Task
- 응답 `422`: 제목 누락·빈 제목·길이 초과, 허용되지 않은 값, 잘못된 날짜, 정의되지 않은 필드

## PATCH /api/tasks/{id}

전달한 필드만 수정한다. **전달하지 않은 필드는 기존 값을 유지한다.**

- 요청 본문: POST와 같은 필드이며 모두 선택이다. 규칙도 POST와 같다.
- `due_date: null`은 마감일을 지운다.
- `title`, `description`, `status`, `priority`에는 `null`을 보낼 수 없다.
- 빈 본문 `{}`은 아무것도 바꾸지 않고 현재 Task를 반환한다.
- 응답 `200`: 수정된 Task
- 응답 `404`: 해당 `id`가 없을 때
- 응답 `422`: 입력값 위반

```json
{ "status": "DONE" }
```

## DELETE /api/tasks/{id}

할 일을 삭제한다. 삭제 확인은 프런트엔드가 담당한다.

- 응답 `204`: 본문 없음
- 응답 `404`: 해당 `id`가 없을 때

## 오류 응답

| 코드 | 의미 | 본문 |
|---|---|---|
| `404` | 대상 없음 | `{"detail": "Task not found"}` |
| `422` | 입력값 위반 | FastAPI 기본 형식 `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` |

## 저장 방식

- 메모리 단계: 서버 프로세스 메모리에 저장한다. 서버를 재시작하면 데이터가 사라지고 `id`는 1부터 다시 시작한다.
- DB 단계: MariaDB에 저장한다. 서버를 재시작해도 데이터와 `id`가 유지된다.
- 단계 간 데이터는 자동 이전하지 않는다. (PRD)
