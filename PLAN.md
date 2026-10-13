# Task Flow PLAN
## 작업 원칙
한 번에 아래 작업 하나만 구현한다. 실제 확인 전에는 완료로 표시하지 않는다.
상태는 [ ] 미완료, [x] 확인 완료로 관리하고 확인 결과를 각 항목 아래 기록한다.
## 2장: 브라우저 앱
- [x] T01: frontend/index.html, styles.css, app.js 생성. 제목 입력·등록·목록만 구현한다.
  확인: 두 항목 등록, 빈 제목 거절. 이 단계에서 새로고침하면 사라져도 정상이다.
  - 변경 파일: frontend/index.html, styles.css, app.js (신규)
  - 실행: python3 -m http.server 5500 --bind 127.0.0.1 --directory frontend
  - 결과(2026-10-13, T03 코드 기준 headless Chrome): 두 항목 등록, 빈 제목·공백 제목 거절, maxlength 100 확인.
  - 남은 오류: 없음. 입력칸 maxlength는 이모지를 2자로 세어 JS 검사(1자)보다 엄격하다.
- [x] T02: localStorage(task-flow-v1) 저장·복원.
  확인: 새로고침 후 유지. 손상된 저장값을 자동 덮어쓰지 않는다.
  - 변경 파일: frontend/app.js, index.html(저장소 오류 안내), styles.css
  - 결과(2026-10-13, headless Chrome): 새로고침 후 유지. 손상값 "{깨진값"이 그대로 보존되고 경고 표시·입력 비활성, 값 제거 후 정상 동작.
  - 남은 오류: 없음. 복원 시 제목 길이는 다시 검사하지 않는다.
- [x] T03: 상태 변경, 수정, 삭제 확인.
  확인: 삭제 취소 시 유지. 다른 항목이 수정되지 않는다.
  - 변경 파일: frontend/app.js, styles.css
  - 결과(2026-10-13, headless Chrome 24/24 통과): 삭제 취소 시 유지, 같은 제목 두 항목 중 지정 항목만 수정·상태 변경·삭제,
    빈 제목·101자 수정 거절, 새로고침 후 유지, T02 데이터(status 없음)는 TODO로 표시, 잘못된 status는 손상 처리,
    저장 실패 시 화면 변경 없음, HTML 제목은 글자로 표시.
  - 남은 오류: 없음. 설명 수정(F04)은 T04에서 구현한다.
- [x] T04: 설명·우선순위·마감일·검색·필터·지연 표시.
  확인: 필터 중 수정·삭제, 어제 마감 TODO의 지연 표시.
  - 변경 파일: frontend/index.html(등록 폼 우선순위·마감일, 검색·필터 바), app.js, styles.css
  - 결과(2026-10-13, headless Chrome 34/34 통과, T01~T03 회귀 32/32 통과): 필터 중 수정·삭제 시 대상만 변경,
    삭제 취소 시 유지, 어제 마감 TODO·DOING 지연 표시(DONE·오늘·내일·미지정 제외), 검색·상태·우선순위 AND 조건,
    설명 2000자 허용·2001자 거절, 설명 줄바꿈·HTML 글자 표시, 이전 단계 데이터는 기본값으로 표시,
    잘못된 priority·due_date·description은 손상 처리, 375px 폭에서 가로 스크롤 없음.
  - 남은 오류: 없음. 검색은 대소문자 구분 없는 부분 일치이며, 목록은 등록 순서로 표시한다.
## 3장: API
- [x] T05: API-SPEC.md 작성, FastAPI /api/health 구현.
  확인: curl로 200과 status=ok.
  - 변경 파일: API-SPEC.md, backend/__init__.py, backend/main.py, requirements.txt(fastapi, uvicorn), .gitignore (모두 신규)
  - 실행: python3 -m venv .venv → .venv/bin/python -m pip install -r requirements.txt
    → source .venv/bin/activate → python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
  - 결과(2026-10-13, Python 3.14.4): curl /api/health → 200, {"status":"ok"}. /docs 200, 없는 경로 404.
  - 남은 오류: 없음. API-SPEC은 T06~T07 엔드포인트 계약까지 미리 정의했다. id는 서버 발급 정수로 정했다.
- [x] T06: 메모리 기반 /api/tasks GET과 POST.
  확인: /docs에서 등록 후 조회. 입력 위반은 422.
  - 변경 파일: backend/schemas.py(신규, 요청·응답 형식과 검증), backend/main.py
  - 실행: source .venv/bin/activate → python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
  - 결과(2026-10-13): /docs(Swagger UI, headless Chrome)에서 POST 201 → GET 조회 확인, 공백 제목·잘못된 상태 422.
    curl 35/35 통과: 기본값, 제목 공백 제거, 100자·2000자 경계, 윤년 날짜 허용,
    빈 제목·101자·잘못된 상태/우선순위·없는 날짜·YYYY-MM-DD 외 형식·id/created_at/정의 안 된 필드 422.
    거절된 요청은 저장되지 않음. 서버 재시작 시 목록이 비고 id가 1부터 다시 시작.
  - 남은 오류: 없음. 구현 중 Pydantic strict 날짜가 정상 날짜도 거절하는 문제를 발견해 형식 검사 방식으로 수정했다.
- [x] T07: PATCH·DELETE와 필터 구현.
  확인: 미전달 필드 유지, 없는 ID 404, 삭제 204.
  - 변경 파일: backend/schemas.py(TaskUpdate 추가), backend/main.py(PATCH, DELETE, GET 필터 q·status·priority)
  - 결과(2026-10-13, curl 51/51 통과, T06 회귀 35/35 통과): PATCH 시 미전달 필드·created_at·다른 항목 유지,
    due_date null로 마감일 삭제, 빈 본문은 변경 없음, title·description·status·priority null은 422,
    없는 ID 404(PATCH·DELETE), 삭제 204(본문 없음), 삭제된 ID는 재사용하지 않음,
    q(대소문자·앞뒤 공백 무시)·status·priority AND 필터, 잘못된 필터 값 422, 422 요청 후 데이터 변화 없음.
  - 남은 오류: 없음. /api/tasks/ 처럼 끝에 /를 붙이면 FastAPI가 307로 /api/tasks로 보낸다. 프런트엔드는 /를 붙이지 않는다.
- [x] T08: 프런트엔드 저장 처리를 API 호출로 교체.
  확인: 화면과 curl 목록이 같음. API 중지 시 오류 표시.
  - 변경 파일: frontend/app.js(localStorage 제거, fetch로 등록·조회·수정·상태 변경·삭제), index.html(서버 오류 배너·다시 시도),
    styles.css, backend/main.py(frontend/를 / 주소로 제공), API-SPEC.md(화면 제공 항목)
  - 실행: API 명령 하나로 화면과 API를 함께 제공한다. 브라우저에서 http://127.0.0.1:8000 을 연다.
  - 결과(2026-10-13, headless Chrome 30/30 통과, API 회귀 T06 35/35·T07 51/51 통과):
    등록·수정·상태 변경·삭제가 API에 반영되고 매 단계 화면과 API 목록 일치, 마지막 화면과 curl 목록 일치.
    API 중지 시 등록·수정·상태 변경·삭제는 오류 표시 후 화면 유지, API 재시작 후 새로고침하면 정상 동작.
    다른 곳에서 삭제된 항목은 404 안내 후 목록에서 제거. 등록 연속 실행 시 1건만 등록.
    일반 Chrome(보안 제한 켬)에서 8000 화면이 API 목록 표시. 화면 파일은 frontend/와 동일, 폴더 밖 경로는 404.
  - 변경 이력: 처음에는 화면(5500)과 API(8000)를 나누고 CORS를 허용했으나,
    실행 기준(T05~T11은 uvicorn 하나)에 맞춰 FastAPI가 화면도 제공하도록 바꾸고 CORS를 제거했다.
  - 남은 오류: WSL 환경에서는 API가 꺼져 있으면 Windows 브라우저 연결이 바로 실패하지 않아,
    요청 제한 시간(10초)이 지난 뒤 오류가 표시된다. 이 10초 경로는 브라우저 테스트로 확인하지 못했다.
    API를 끄면 화면 파일도 함께 꺼지므로, 꺼진 상태에서 새로고침하면 브라우저 자체 오류 화면이 나온다.
    검색·필터는 받은 전체 목록에서 브라우저가 처리한다. (API 필터는 T07에서 확인)
## 4장: DB
- [x] T09: MariaDB 전용 사용자·DB와 .env 준비. 접속 확인.
  - 변경 파일: .env.example(신규, 가짜 값). DB·사용자·.env는 사용자가 직접 준비했다.
  - 결과(2026-10-13): MariaDB 11.8.6, 127.0.0.1:3306에서만 접속 허용. .env 값으로 task_flow_app 접속 성공(SELECT 1).
    권한은 task_flow DB 전체만, DB 문자셋 utf8mb4(이모지 저장 확인). 테이블 없음.
  - 남은 오류: 비밀번호가 4자로 짧다. (.env는 처음 .venv/.env에 있었으나 최상위로 옮김)
- [x] T10: backend/database.py, models.py, init_db.py 생성.
  확인: python -m backend.init_db 실행 후 tasks 테이블 확인.
  - 변경 파일: backend/database.py, models.py, init_db.py(신규),
    requirements.txt(SQLAlchemy 2.1.4: 테이블 정의·연결, PyMySQL 1.2.3: MariaDB 드라이버, python-dotenv 1.2.4: .env 읽기)
  - 실행: python -m backend.init_db (최상위 .env 또는 환경변수의 DB_* 값을 읽는다)
  - 결과(2026-10-13): 첫 실행 "tasks: 생성함", 다시 실행 "이미 있음 (변경하지 않음)". SHOW CREATE TABLE로
    id AUTO_INCREMENT, title VARCHAR(100), description VARCHAR(2000) 기본값 '', status·priority ENUM과 기본값,
    due_date DATE NULL, created_at DATETIME NOT NULL, InnoDB·utf8mb4 확인.
    임시 복사 테이블에서 이모지 100자 저장, 101자·잘못된 status·없는 날짜·created_at 누락 거절(sql_mode STRICT) 확인.
    접속 정보 없음·틀린 비밀번호는 비밀번호 없이 오류 안내 후 종료 코드 1. 실제 tasks 테이블은 비어 있음.
  - 남은 오류: 없음. 처음에는 .env가 .venv/.env에 있어 환경변수로 넘겨 확인했고,
    최상위 .env로 옮긴 뒤 환경변수 없이 실행해 "이미 있음"으로 정상 동작 확인. .env는 Git 무시 대상.
- [x] T11: API 메모리 저장을 DB로 교체.
  확인: 등록한 행을 SQL로 조회. API 재시작 후 데이터 유지.
  - 변경 파일: backend/main.py(메모리 목록 제거, 요청마다 DB 세션으로 조회·등록·수정·삭제). API 계약은 그대로.
  - 실행: python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload (최상위 .env 필요)
  - 결과(2026-10-13): API 테스트 47/47 통과 — 등록·수정·삭제가 SQL에 반영, created_at UTC 일치, 422·404 규칙 유지,
    필터 AND·대소문자 무시, 검색어의 %·_는 글자로 검색, café/cafe 구분(메모리 단계와 동일),
    API 재시작 후 전체 필드 유지, 재시작 후 id가 이어짐. 테스트 행은 끝에 삭제.
    브라우저(headless Chrome) 5/5 통과 — 화면에서 샘플 2건 등록·상태 변경 후 SQL로 id 10, 11 조회,
    API 재시작 후 새로고침해도 같은 목록, 화면·curl·SQL 일치.
  - 남은 오류: 없음. 테스트로 AUTO_INCREMENT가 소모되어 샘플 id가 10부터 시작한다.
    샘플 2건(샘플: 주간 보고서 작성, 샘플: 장보기)은 확인용으로 DB에 남겨 두었다.
## 5장: 서버 분리
- [ ] T12: DB 서버 구성 후 App 서버에서 SELECT 1 확인.
- [ ] T13: App 서버 코드·가상환경·환경변수·systemd 구성.
  확인: App에서 /api/health 응답.
- [ ] T14: Web 서버 Nginx와 정적 파일·/api 프록시 구성.
  확인: Web 주소로 등록, DB 저장, App 재시작 후 유지.
## 실행 기준
T01~T04: python3 -m http.server 5500 --bind 127.0.0.1 --directory frontend
T05~T11: 가상환경에서 python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
실제 존재하는 파일을 확인한 뒤 명령을 실행한다.
## 기록
각 작업에 변경 파일, 실행 명령, 실제 확인 결과, 남은 오류를 기록한다.
정상 동작을 확인한 작업 단위로 Git 커밋한다.