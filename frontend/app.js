// T01: 제목 입력·등록·목록 표시
// T02~T04: localStorage 저장, 상태 변경·수정·삭제, 설명·우선순위·마감일·검색·필터·지연 표시
// T08: 저장 처리를 localStorage에서 API 호출로 교체

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const REQUEST_TIMEOUT_MS = 10000;

// 화면과 API는 같은 주소에서 제공된다. (개발: FastAPI, 서버 분리 단계: Nginx)
const API_BASE = "/api";

const STATUS_LABELS = {
  TODO: "할 일",
  DOING: "진행 중",
  DONE: "완료",
};

const PRIORITY_LABELS = {
  HIGH: "높음",
  NORMAL: "보통",
  LOW: "낮음",
};

const form = document.getElementById("task-form");
const titleInput = document.getElementById("task-title");
const priorityInput = document.getElementById("task-priority");
const dueDateInput = document.getElementById("task-due-date");
const submitButton = form.querySelector("button[type=submit]");
const formError = document.getElementById("form-error");
const serverError = document.getElementById("server-error");
const serverErrorMessage = document.getElementById("server-error-message");
const retryButton = document.getElementById("retry-button");
const taskList = document.getElementById("task-list");
const taskCount = document.getElementById("task-count");
const emptyMessage = document.getElementById("empty-message");
const filterQuery = document.getElementById("filter-query");
const filterStatus = document.getElementById("filter-status");
const filterPriority = document.getElementById("filter-priority");

// 서버에서 받은 할 일 목록. 화면은 항상 이 목록을 기준으로 그린다.
let tasks = [];
// 목록 불러오기 상태: loading, ready, error
let loadState = "loading";
// 요청을 보내고 응답을 기다리는 항목의 id. 같은 항목에 요청이 겹치지 않도록 막는다.
const pendingIds = new Set();

// 수정 중인 항목의 id. 수정 중이 아니면 null이다.
let editingId = null;
let editError = "";

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function describeApiError(status, data) {
  if (status === 404) {
    return "이미 삭제된 할 일입니다.";
  }
  if (status === 422) {
    const detail = Array.isArray(data?.detail) ? data.detail[0]?.msg : "";
    return detail
      ? `서버가 입력값을 거절했습니다. (${detail})`
      : "서버가 입력값을 거절했습니다.";
  }
  return `서버 오류가 발생했습니다. (${status})`;
}

// API를 호출하고 JSON 응답을 반환한다. 204 응답은 null을 반환한다.
// 연결 실패는 status 0, 그 외 실패는 HTTP 상태 코드로 ApiError를 던진다.
async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(
      0,
      "서버에 연결할 수 없습니다. API 서버가 실행 중인지 확인하세요.",
    );
  }

  if (response.status === 204) {
    return null;
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    // 본문이 JSON이 아니면 상태 코드로만 판단한다.
  }
  if (!response.ok) {
    throw new ApiError(response.status, describeApiError(response.status, data));
  }
  return data;
}

// 공백 제거 후 1~100자인지 검사한다. 오류가 없으면 빈 문자열을 반환한다.
function validateTitle(title) {
  if (title.length === 0) {
    return "제목을 입력하세요.";
  }
  // 이모지 등도 한 글자로 세기 위해 코드 포인트 단위로 센다.
  if ([...title].length > TITLE_MAX_LENGTH) {
    return `제목은 ${TITLE_MAX_LENGTH}자 이하로 입력하세요.`;
  }
  return "";
}

function validateDescription(description) {
  if ([...description].length > DESCRIPTION_MAX_LENGTH) {
    return `설명은 ${DESCRIPTION_MAX_LENGTH}자 이하로 입력하세요.`;
  }
  return "";
}

// YYYY-MM-DD 형식의 실제 존재하는 날짜인지 검사한다.
function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

// 마감일 입력값을 저장 형식으로 바꾼다. 빈 값은 null이다.
// 형식이 틀리면 undefined를 반환한다.
function parseDueDate(value) {
  if (value === "") {
    return null;
  }
  return isValidDateString(value) ? value : undefined;
}

function isValidStatus(status) {
  return Object.hasOwn(STATUS_LABELS, status);
}

function isValidPriority(priority) {
  return Object.hasOwn(PRIORITY_LABELS, priority);
}

// 사용자 컴퓨터의 달력 기준 오늘 날짜(YYYY-MM-DD)
function getLocalToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function isOverdue(task, today) {
  // 같은 형식의 날짜 문자열은 글자 순서와 날짜 순서가 같다.
  return task.due_date !== null && task.due_date < today && task.status !== "DONE";
}

// 제목 검색, 상태, 우선순위 조건을 모두 만족하는 항목만 남긴다.
function getVisibleTasks() {
  const query = filterQuery.value.trim().toLowerCase();
  const status = filterStatus.value;
  const priority = filterPriority.value;

  return tasks.filter(
    (task) =>
      (query === "" || task.title.toLowerCase().includes(query)) &&
      (status === "" || task.status === status) &&
      (priority === "" || task.priority === priority),
  );
}

function isFiltering() {
  return (
    filterQuery.value.trim() !== "" ||
    filterStatus.value !== "" ||
    filterPriority.value !== ""
  );
}

function createButton(text, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;
  button.dataset.action = action;
  return button;
}

function createSelect(labels, value, label) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  for (const [optionValue, optionLabel] of Object.entries(labels)) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = optionLabel;
    select.append(option);
  }
  select.value = value;
  return select;
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  return badge;
}

function renderViewItem(item, task, today) {
  const main = document.createElement("div");
  main.className = "task-main";

  const title = document.createElement("span");
  title.className = "task-title";
  // 사용자 입력은 HTML로 해석하지 않고 글자로만 표시한다.
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "task-meta";
  meta.append(
    createBadge(
      PRIORITY_LABELS[task.priority],
      `priority-${task.priority.toLowerCase()}`,
    ),
  );
  if (task.due_date !== null) {
    const dueDate = document.createElement("span");
    dueDate.className = "task-due-date";
    dueDate.textContent = `마감 ${task.due_date}`;
    meta.append(dueDate);
  }
  if (isOverdue(task, today)) {
    meta.append(createBadge("지연", "overdue"));
  }

  main.append(title, meta);

  if (task.description !== "") {
    const description = document.createElement("p");
    description.className = "task-description";
    description.textContent = task.description;
    main.append(description);
  }

  const statusSelect = createSelect(STATUS_LABELS, task.status, "상태");
  statusSelect.className = "task-status";
  statusSelect.dataset.action = "status";

  const actions = document.createElement("div");
  actions.className = "task-actions";
  actions.append(
    statusSelect,
    createButton("수정", "edit"),
    createButton("삭제", "delete"),
  );

  item.append(main, actions);
}

function createField(labelText, control) {
  const label = document.createElement("label");
  label.className = "edit-field";
  const text = document.createElement("span");
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function renderEditItem(item, task) {
  const editForm = document.createElement("form");
  editForm.className = "edit-form";
  editForm.noValidate = true;

  const titleField = document.createElement("input");
  titleField.type = "text";
  titleField.name = "title";
  titleField.maxLength = TITLE_MAX_LENGTH;
  titleField.value = task.title;

  const descriptionField = document.createElement("textarea");
  descriptionField.name = "description";
  descriptionField.rows = 3;
  descriptionField.maxLength = DESCRIPTION_MAX_LENGTH;
  descriptionField.value = task.description;

  const priorityField = createSelect(PRIORITY_LABELS, task.priority, "우선순위");
  priorityField.name = "priority";

  const dueDateField = document.createElement("input");
  dueDateField.type = "date";
  dueDateField.name = "due_date";
  dueDateField.value = task.due_date ?? "";

  const options = document.createElement("div");
  options.className = "edit-options";
  options.append(
    createField("우선순위", priorityField),
    createField("마감일", dueDateField),
  );

  const buttons = document.createElement("div");
  buttons.className = "edit-buttons";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.textContent = "저장";
  buttons.append(saveButton, createButton("취소", "cancel-edit"));

  editForm.append(
    createField("제목", titleField),
    createField(`설명 (최대 ${DESCRIPTION_MAX_LENGTH}자)`, descriptionField),
    options,
    buttons,
  );

  const error = document.createElement("p");
  error.className = "form-error";
  error.setAttribute("role", "alert");
  error.textContent = editError;

  item.append(editForm, error);
}

// 요청 중인 항목의 버튼과 선택 상자를 비활성화한다.
function setItemBusy(item, busy) {
  for (const control of item.querySelectorAll("button, select")) {
    control.disabled = busy;
  }
}

// focusEdit가 true이면 수정 중인 항목의 제목 입력칸에 포커스를 둔다.
function renderTasks({ focusEdit = false } = {}) {
  const visibleTasks = getVisibleTasks();
  const today = getLocalToday();
  // 수정 중인 항목은 입력 중인 값이 사라지지 않도록 기존 요소를 그대로 쓴다.
  const currentEditItem = taskList.querySelector(".task-item.editing");

  taskList.replaceChildren();

  for (const task of visibleTasks) {
    if (task.id === editingId && Number(currentEditItem?.dataset.id) === editingId) {
      setItemBusy(currentEditItem, pendingIds.has(task.id));
      taskList.append(currentEditItem);
      continue;
    }

    const item = document.createElement("li");
    item.className = "task-item";
    item.dataset.id = task.id;
    item.dataset.status = task.status;

    if (task.id === editingId) {
      item.classList.add("editing");
      renderEditItem(item, task);
    } else {
      renderViewItem(item, task, today);
    }
    setItemBusy(item, pendingIds.has(task.id));
    taskList.append(item);
  }

  taskCount.textContent = isFiltering()
    ? `(${visibleTasks.length} / 전체 ${tasks.length})`
    : `(${tasks.length})`;

  if (loadState === "loading") {
    emptyMessage.textContent = "할 일을 불러오는 중입니다…";
  } else if (loadState === "error") {
    emptyMessage.textContent = "할 일 목록을 불러오지 못했습니다.";
  } else if (tasks.length === 0) {
    emptyMessage.textContent = "등록된 할 일이 없습니다.";
  } else {
    emptyMessage.textContent = "조건에 맞는 할 일이 없습니다.";
  }
  emptyMessage.hidden = visibleTasks.length > 0;

  for (const control of form.elements) {
    control.disabled = loadState !== "ready";
  }

  if (focusEdit) {
    const editInput = taskList.querySelector(".edit-form input[name=title]");
    if (editInput) {
      editInput.focus();
    }
  }
}

// 이벤트가 발생한 목록 항목의 id를 찾는다. 화면 순번이 아닌 id로 처리한다.
function getTaskId(target) {
  const item = target.closest(".task-item");
  return item ? Number(item.dataset.id) : null;
}

function replaceTask(updated) {
  tasks = tasks.map((task) => (task.id === updated.id ? updated : task));
}

// 서버에 없는 항목(404)은 화면 목록에서도 뺀다.
function removeTask(id) {
  tasks = tasks.filter((task) => task.id !== id);
  if (editingId === id) {
    editingId = null;
    editError = "";
  }
}

async function loadTasks() {
  loadState = "loading";
  serverError.hidden = true;
  renderTasks();

  try {
    const data = await request("/tasks");
    if (!Array.isArray(data)) {
      throw new ApiError(200, "서버 응답 형식이 올바르지 않습니다.");
    }
    tasks = data;
    loadState = "ready";
    formError.textContent = "";
  } catch (error) {
    tasks = [];
    editingId = null;
    loadState = "error";
    serverErrorMessage.textContent = `할 일 목록을 불러오지 못했습니다. ${error.message}`;
    serverError.hidden = false;
  }
  renderTasks();
}

retryButton.addEventListener("click", () => loadTasks());

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (loadState !== "ready" || submitButton.dataset.pending) {
    return;
  }

  const title = titleInput.value.trim();
  const priority = priorityInput.value;
  const dueDate = parseDueDate(dueDateInput.value);

  let error = validateTitle(title);
  if (!error && !isValidPriority(priority)) {
    error = "우선순위를 선택하세요.";
  }
  if (!error && dueDate === undefined) {
    error = "마감일은 YYYY-MM-DD 형식의 날짜로 입력하세요.";
  }

  if (error) {
    formError.textContent = error;
    titleInput.focus();
    return;
  }

  // 응답을 기다리는 동안 다시 눌러 중복 등록되지 않도록 막는다.
  submitButton.dataset.pending = "true";
  submitButton.disabled = true;
  try {
    const created = await request("/tasks", {
      method: "POST",
      body: { title, priority, due_date: dueDate },
    });
    tasks = [...tasks, created];
    formError.textContent = "";
    form.reset();
    renderTasks();
  } catch (requestError) {
    formError.textContent = `등록하지 못했습니다. ${requestError.message}`;
  } finally {
    delete submitButton.dataset.pending;
    submitButton.disabled = loadState !== "ready";
    titleInput.focus();
  }
});

// 검색어와 필터가 바뀌면 목록을 다시 그린다.
filterQuery.addEventListener("input", () => renderTasks());
filterStatus.addEventListener("change", () => renderTasks());
filterPriority.addEventListener("change", () => renderTasks());

// 상태 변경
taskList.addEventListener("change", async (event) => {
  if (event.target.dataset.action !== "status") {
    return;
  }
  const id = getTaskId(event.target);
  const status = event.target.value;
  if (!isValidStatus(status) || pendingIds.has(id)) {
    return;
  }

  pendingIds.add(id);
  renderTasks();
  try {
    replaceTask(
      await request(`/tasks/${id}`, { method: "PATCH", body: { status } }),
    );
    formError.textContent = "";
  } catch (error) {
    if (error.status === 404) {
      removeTask(id);
    }
    formError.textContent = `상태를 바꾸지 못했습니다. ${error.message}`;
  } finally {
    pendingIds.delete(id);
    // 실패하면 서버 값 그대로 다시 그려 선택 상자를 되돌린다.
    renderTasks();
  }
});

// 수정 시작·취소, 삭제
taskList.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const id = getTaskId(button);
  const task = tasks.find((t) => t.id === id);
  if (!task || pendingIds.has(id)) {
    return;
  }

  if (button.dataset.action === "edit") {
    editingId = id;
    editError = "";
    renderTasks({ focusEdit: true });
  } else if (button.dataset.action === "cancel-edit") {
    editingId = null;
    editError = "";
    renderTasks();
  } else if (button.dataset.action === "delete") {
    // confirm 메시지는 HTML이 아닌 글자로 표시된다.
    if (!confirm(`"${task.title}" 항목을 삭제할까요?`)) {
      return;
    }
    pendingIds.add(id);
    renderTasks();
    try {
      await request(`/tasks/${id}`, { method: "DELETE" });
      removeTask(id);
      formError.textContent = "";
    } catch (error) {
      if (error.status === 404) {
        removeTask(id);
      }
      formError.textContent = `삭제하지 못했습니다. ${error.message}`;
    } finally {
      pendingIds.delete(id);
      renderTasks();
    }
  }
});

// 수정 저장
taskList.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = getTaskId(event.target);
  if (pendingIds.has(id)) {
    return;
  }
  const item = event.target.closest(".task-item");
  const showEditError = (message) => {
    editError = message;
    // 다시 그리면 입력 중인 값이 사라지므로 오류 메시지만 바꾼다.
    item.querySelector(".form-error").textContent = message;
  };

  const fields = event.target.elements;
  const title = fields.title.value.trim();
  const description = fields.description.value;
  const priority = fields.priority.value;
  const dueDate = parseDueDate(fields.due_date.value);

  let error = validateTitle(title) || validateDescription(description);
  if (!error && !isValidPriority(priority)) {
    error = "우선순위를 선택하세요.";
  }
  if (!error && dueDate === undefined) {
    error = "마감일은 YYYY-MM-DD 형식의 날짜로 입력하세요.";
  }
  if (error) {
    showEditError(error);
    return;
  }

  pendingIds.add(id);
  setItemBusy(item, true);
  try {
    replaceTask(
      await request(`/tasks/${id}`, {
        method: "PATCH",
        body: { title, description, priority, due_date: dueDate },
      }),
    );
    editingId = null;
    editError = "";
  } catch (requestError) {
    if (requestError.status === 404) {
      removeTask(id);
      formError.textContent = `수정하지 못했습니다. ${requestError.message}`;
    } else {
      showEditError(`수정하지 못했습니다. ${requestError.message}`);
    }
  } finally {
    pendingIds.delete(id);
    renderTasks();
  }
});

loadTasks();
