const STORAGE_KEY = "allowance-pool-v1";
const TYPE_LABELS = {
  expense: "花費",
  income: "收入",
  save: "存起來",
  adjust: "調整",
};
const TYPE_SIGNS = {
  expense: -1,
  income: 1,
  save: 1,
  adjust: 1,
};
const CATEGORIES = {
  expense: ["餐飲", "文具", "交通", "玩具", "娛樂", "其他"],
  income: ["零用金", "獎勵", "禮物", "退款", "其他"],
  save: ["存錢目標", "撲滿", "銀行", "其他"],
  adjust: ["家長修正", "期初金額", "其他"],
};

let state = loadState();
let session = null;
let activeRole = "parent";
let activeView = "Home";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const els = {
  setupPanel: $("#setupPanel"),
  loginPanel: $("#loginPanel"),
  summaryPanel: $("#summaryPanel"),
  setupForm: $("#setupForm"),
  loginForm: $("#loginForm"),
  loginChild: $("#loginChild"),
  entryForm: $("#entryForm"),
  entryChild: $("#entryChild"),
  entryChildWrap: $("#entryChildWrap"),
  categorySelect: $("#categorySelect"),
  quickActions: $("#quickActions"),
  recentRecords: $("#recentRecords"),
  recordList: $("#recordList"),
  filterChild: $("#filterChild"),
  filterType: $("#filterType"),
  familyTools: $("#familyTools"),
  childForm: $("#childForm"),
  editDialog: $("#editDialog"),
  editForm: $("#editForm"),
  toast: $("#toast"),
};

init();

function init() {
  document.documentElement.dataset.theme = localStorage.getItem("allowance-theme") || "light";
  bindEvents();
  if (!state) {
    state = null;
    showSetup();
    render();
    return;
  }
  showLogin();
  render();
}

function bindEvents() {
  $("#themeToggle").addEventListener("click", toggleTheme);
  els.setupForm.addEventListener("submit", setupFamily);
  els.loginForm.addEventListener("submit", login);
  els.entryForm.addEventListener("submit", saveEntry);
  els.childForm.addEventListener("submit", addChild);
  $("#logoutButton").addEventListener("click", logout);
  $("#showAllRecords").addEventListener("click", () => switchView("Records"));
  $("#exportCsv").addEventListener("click", exportCsv);
  $("#exportJson").addEventListener("click", exportJson);
  $("#importJson").addEventListener("change", importJson);
  $("#saveEdit").addEventListener("click", saveEdit);
  $("#deleteRecord").addEventListener("click", deleteEditedRecord);
  els.filterChild.addEventListener("change", renderRecords);
  els.filterType.addEventListener("change", renderRecords);
  els.entryForm.querySelectorAll('[name="type"]').forEach((radio) => radio.addEventListener("change", renderCategories));

  $$(".role-button").forEach((button) => {
    button.addEventListener("click", () => {
      activeRole = button.dataset.role;
      $$(".role-button").forEach((item) => item.classList.toggle("active", item === button));
      renderLoginChildren();
    });
  });

  $$(".nav-button").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

function setupFamily(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const parentPin = cleanPin(form.get("parentPin"));
  const childPin = cleanPin(form.get("childPin"));
  if (!validPin(parentPin) || !validPin(childPin)) return toast("密碼請使用 4 到 8 位數字。");

  const childId = crypto.randomUUID();
  const initialBalance = Number(form.get("initialBalance")) || 0;
  state = {
    familyName: form.get("familyName").trim(),
    parentPin,
    children: [{ id: childId, name: form.get("childName").trim(), pin: childPin, createdAt: nowIso() }],
    records: [],
    createdAt: nowIso(),
  };
  if (initialBalance > 0) {
    state.records.push(makeRecord({
      childId,
      actor: "parent",
      type: "adjust",
      amount: initialBalance,
      category: "期初金額",
      date: today(),
      note: "建立零用金池",
    }));
  }
  persist();
  session = { role: "parent", childId };
  showApp();
  render();
  toast("家庭零用金池建立好了。");
}

function login(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const childId = form.get("childId");
  const pin = cleanPin(form.get("pin"));
  if (activeRole === "parent") {
    if (pin !== state.parentPin) return toast("家長密碼不正確。");
    session = { role: "parent", childId: childId || state.children[0]?.id };
  } else {
    const child = state.children.find((item) => item.id === childId);
    if (!child || pin !== child.pin) return toast("小孩密碼不正確。");
    session = { role: "child", childId };
  }
  event.currentTarget.reset();
  showApp();
  render();
}

function logout() {
  session = null;
  activeView = "Home";
  showLogin();
  render();
}

function saveEntry(event) {
  event.preventDefault();
  if (!session) return;
  const form = new FormData(event.currentTarget);
  const type = form.get("type");
  const childId = session.role === "child" ? session.childId : form.get("childId");
  const amount = Number(form.get("amount"));
  if (!amount || amount <= 0) return toast("請輸入正確金額。");
  if (type === "adjust" && session.role !== "parent") return toast("只有爸媽可以調整帳。");

  const balance = getBalance(childId);
  if (type === "expense" && balance - amount < 0) {
    return toast("零用金池餘額不足，先請爸媽補充或修正。");
  }

  state.records.push(makeRecord({
    childId,
    actor: session.role,
    type,
    amount,
    category: form.get("category"),
    date: form.get("date"),
    note: form.get("note").trim(),
  }));
  persist();
  event.currentTarget.reset();
  setDefaultEntryValues();
  render();
  toast(isBackdate(form.get("date")) ? "補登完成，已放進正確日期。" : "今天的紀錄已儲存。");
}

function addChild(event) {
  event.preventDefault();
  if (session?.role !== "parent") return toast("只有爸媽可以新增孩子。");
  const form = new FormData(event.currentTarget);
  const pin = cleanPin(form.get("pin"));
  if (!validPin(pin)) return toast("密碼請使用 4 到 8 位數字。");

  const childId = crypto.randomUUID();
  state.children.push({ id: childId, name: form.get("name").trim(), pin, createdAt: nowIso() });
  const balance = Number(form.get("balance")) || 0;
  if (balance > 0) {
    state.records.push(makeRecord({
      childId,
      actor: "parent",
      type: "adjust",
      amount: balance,
      category: "期初金額",
      date: today(),
      note: "新增孩子",
    }));
  }
  persist();
  event.currentTarget.reset();
  render();
  toast("孩子已加入零用金池。");
}

function render() {
  if (!state) {
    els.summaryPanel.innerHTML = welcomeSummary();
    return;
  }
  renderSelectors();
  renderSummary();
  renderQuickActions();
  renderRecent();
  renderRecords();
  renderFamily();
  renderCategories();
  setDefaultEntryValues();
  updatePermissions();
}

function renderSummary() {
  const visibleChildren = getVisibleChildren();
  const balance = visibleChildren.reduce((sum, child) => sum + getBalance(child.id), 0);
  const monthExpense = sumRecords({ children: visibleChildren, type: "expense", month: currentMonth() });
  const monthIncome = sumRecords({ children: visibleChildren, types: ["income", "save", "adjust"], month: currentMonth() });
  const backfills = getRecordsForChildren(visibleChildren).filter((record) => isBackdate(record.date)).length;
  const name = session?.role === "child" ? childName(session.childId) : state.familyName;
  els.summaryPanel.innerHTML = `
    <div class="hero-card">
      <div class="hero-main">
        <div>
          <p class="eyebrow">${session ? "目前帳戶" : "請先登入"}</p>
          <div class="balance">${money(balance)}</div>
          <span class="child-pill">${name || "家庭零用金池"}</span>
        </div>
      </div>
      <div class="stat-strip">
        <div class="stat"><small>本月花費</small><strong>${money(monthExpense)}</strong></div>
        <div class="stat"><small>本月進帳</small><strong>${money(monthIncome)}</strong></div>
        <div class="stat"><small>補登筆數</small><strong>${backfills}</strong></div>
      </div>
    </div>
  `;
}

function renderQuickActions() {
  const isParent = session?.role === "parent";
  const actions = [
    ["＋", isParent ? "發零用金" : "記收入", isParent ? "給孩子補充金額" : "獎勵、禮物都能記", () => prepEntry(isParent ? "income" : "income")],
    ["−", "記花費", "每日支出與補登", () => prepEntry("expense")],
    ["◎", "存錢", "把錢放進目標池", () => prepEntry("save")],
    ["☷", "看流水", "查餘額變化", () => switchView("Records")],
  ];
  els.quickActions.innerHTML = actions.map(([icon, title, hint], index) => `
    <button class="quick-card" type="button" data-quick="${index}">
      <span>${icon}</span><strong>${title}</strong><small>${hint}</small>
    </button>
  `).join("");
  $$(".quick-card").forEach((button) => {
    button.addEventListener("click", () => actions[Number(button.dataset.quick)][3]());
  });
}

function renderRecent() {
  const records = getScopedRecords().slice(0, 5);
  els.recentRecords.innerHTML = records.length ? records.map(recordCard).join("") : emptyState("還沒有紀錄，先新增一筆吧。");
  bindRecordButtons(els.recentRecords);
}

function renderRecords() {
  if (!state) return;
  const childFilter = els.filterChild.value || "all";
  const typeFilter = els.filterType.value || "all";
  let records = getScopedRecords();
  if (childFilter !== "all") records = records.filter((record) => record.childId === childFilter);
  if (typeFilter !== "all") records = records.filter((record) => record.type === typeFilter);
  els.recordList.innerHTML = records.length ? records.map(recordCard).join("") : emptyState("這個篩選沒有紀錄。");
  bindRecordButtons(els.recordList);
}

function renderFamily() {
  if (!state) return;
  if (session?.role !== "parent") {
    els.familyTools.innerHTML = emptyState("小孩可以看自己的帳，家庭設定請爸媽登入。");
    els.childForm.hidden = true;
    $(".backup-row").hidden = true;
    return;
  }
  els.childForm.hidden = false;
  $(".backup-row").hidden = false;
  els.familyTools.innerHTML = state.children.map((child) => `
    <div class="child-row">
      <div>
        <strong>${escapeHtml(child.name)}</strong>
        <p>餘額 ${money(getBalance(child.id))}，共 ${state.records.filter((record) => record.childId === child.id).length} 筆</p>
      </div>
      <button class="secondary-action" type="button" data-login-child="${child.id}">查看</button>
    </div>
  `).join("");
  $$("[data-login-child]").forEach((button) => {
    button.addEventListener("click", () => {
      session.childId = button.dataset.loginChild;
      switchView("Home");
      render();
    });
  });
}

function renderSelectors() {
  const childOptions = state.children.map((child) => `<option value="${child.id}">${escapeHtml(child.name)}</option>`).join("");
  els.loginChild.innerHTML = childOptions;
  els.entryChild.innerHTML = childOptions;
  const filterOptions = `<option value="all">全部孩子</option>${childOptions}`;
  els.filterChild.innerHTML = filterOptions;
  if (session?.childId) {
    els.entryChild.value = session.childId;
    els.filterChild.value = session.role === "child" ? session.childId : "all";
  }
}

function renderLoginChildren() {
  if (!state) return;
  els.loginChild.parentElement.hidden = activeRole === "parent" && state.children.length <= 1;
}

function renderCategories() {
  const type = new FormData(els.entryForm).get("type") || "expense";
  els.categorySelect.innerHTML = CATEGORIES[type].map((item) => `<option value="${item}">${item}</option>`).join("");
}

function recordCard(record) {
  const signed = signedAmount(record);
  const canEdit = session?.role === "parent" || record.actor === "child";
  return `
    <article class="record-card">
      <div class="record-title">
        <strong>${escapeHtml(record.category)} · ${TYPE_LABELS[record.type]}</strong>
        <small>${escapeHtml(childName(record.childId))} / ${formatDate(record.date)}${isBackdate(record.date) ? " / 補登" : ""}</small>
      </div>
      <div class="amount ${record.type}">${signed >= 0 ? "+" : "-"}${money(Math.abs(signed))}</div>
      <div class="record-meta">${escapeHtml(record.note || "沒有備註")} · ${record.actor === "parent" ? "爸媽" : "小孩"}</div>
      ${canEdit ? `<div class="record-actions"><button type="button" data-edit="${record.id}">修改</button></div>` : ""}
    </article>
  `;
}

function bindRecordButtons(scope) {
  scope.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openEdit(button.dataset.edit));
  });
}

function openEdit(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  if (session.role !== "parent" && record.actor !== "child") return toast("這筆需要爸媽修改。");
  els.editForm.id.value = record.id;
  els.editForm.amount.value = record.amount;
  els.editForm.date.value = record.date;
  els.editForm.note.value = record.note || "";
  els.editDialog.showModal();
}

function saveEdit() {
  const id = els.editForm.id.value;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  const previous = { amount: record.amount, date: record.date, note: record.note };
  record.amount = Number(els.editForm.amount.value);
  record.date = els.editForm.date.value;
  record.note = els.editForm.note.value.trim();
  if (getBalance(record.childId) < 0) {
    Object.assign(record, previous);
    return toast("修改後餘額會不足，請先補充零用金。");
  }
  record.updatedAt = nowIso();
  persist();
  els.editDialog.close();
  render();
  toast("紀錄已更新。");
}

function deleteEditedRecord() {
  const id = els.editForm.id.value;
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  state.records = state.records.filter((record) => record.id !== id);
  if (getBalance(record.childId) < 0) {
    state.records.push(record);
    return toast("刪除後餘額會不足，請先補充零用金。");
  }
  persist();
  els.editDialog.close();
  render();
  toast("紀錄已刪除。");
}

function prepEntry(type) {
  switchView("Entry");
  const target = els.entryForm.querySelector(`[name="type"][value="${type}"]`);
  if (target) target.checked = true;
  renderCategories();
}

function switchView(view) {
  activeView = view;
  $$(".content-view").forEach((item) => item.classList.toggle("active", item.id === `view${view}`));
  $$(".nav-button").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
}

function updatePermissions() {
  const loggedIn = Boolean(session);
  els.setupPanel.hidden = Boolean(state);
  els.loginPanel.hidden = !state || loggedIn;
  $$(".content-view, .bottom-nav").forEach((item) => item.hidden = !loggedIn);
  $("#adjustTypeOption").hidden = session?.role !== "parent";
  els.entryChildWrap.hidden = session?.role !== "parent";
  if (session?.role !== "parent" && new FormData(els.entryForm).get("type") === "adjust") {
    els.entryForm.querySelector('[name="type"][value="expense"]').checked = true;
  }
}

function showSetup() {
  session = null;
  els.setupPanel.hidden = false;
  els.loginPanel.hidden = true;
  $$(".content-view, .bottom-nav").forEach((item) => item.hidden = true);
}

function showLogin() {
  els.setupPanel.hidden = true;
  els.loginPanel.hidden = false;
  $$(".content-view, .bottom-nav").forEach((item) => item.hidden = true);
  renderLoginChildren();
}

function showApp() {
  els.setupPanel.hidden = true;
  els.loginPanel.hidden = true;
  $$(".content-view, .bottom-nav").forEach((item) => item.hidden = false);
  switchView(activeView);
}

function setDefaultEntryValues() {
  if (!els.entryForm.date.value) els.entryForm.date.value = today();
  if (session?.childId) els.entryChild.value = session.childId;
}

function getScopedRecords() {
  const records = session?.role === "child"
    ? state.records.filter((record) => record.childId === session.childId)
    : state.records;
  return [...records].sort((a, b) => `${b.date}${b.createdAt}`.localeCompare(`${a.date}${a.createdAt}`));
}

function getVisibleChildren() {
  if (!state) return [];
  if (session?.role === "child") return state.children.filter((child) => child.id === session.childId);
  return state.children;
}

function getRecordsForChildren(children) {
  const ids = new Set(children.map((child) => child.id));
  return state.records.filter((record) => ids.has(record.childId));
}

function getBalance(childId) {
  return state.records
    .filter((record) => record.childId === childId)
    .reduce((sum, record) => sum + signedAmount(record), 0);
}

function sumRecords({ children, type, types, month }) {
  const allowedTypes = types || [type];
  return getRecordsForChildren(children)
    .filter((record) => allowedTypes.includes(record.type) && record.date.startsWith(month))
    .reduce((sum, record) => sum + Math.abs(signedAmount(record)), 0);
}

function signedAmount(record) {
  const sign = TYPE_SIGNS[record.type] || 1;
  return sign * Number(record.amount || 0);
}

function makeRecord({ childId, actor, type, amount, category, date, note }) {
  return {
    id: crypto.randomUUID(),
    childId,
    actor,
    type,
    amount: Math.round(Number(amount)),
    category,
    date,
    note,
    createdAt: nowIso(),
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function exportJson() {
  download(`allowance-backup-${today()}.json`, JSON.stringify(state, null, 2), "application/json");
}

function importJson(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported.familyName || !Array.isArray(imported.children) || !Array.isArray(imported.records)) {
        throw new Error("bad shape");
      }
      state = imported;
      persist();
      session = null;
      showLogin();
      render();
      toast("備份已匯入，請重新登入。");
    } catch {
      toast("備份檔格式不正確。");
    }
  };
  reader.readAsText(file);
  event.target.value = "";
}

function exportCsv() {
  const header = ["日期", "孩子", "類型", "分類", "金額", "登記者", "備註"];
  const rows = getScopedRecords().map((record) => [
    record.date,
    childName(record.childId),
    TYPE_LABELS[record.type],
    record.category,
    signedAmount(record),
    record.actor === "parent" ? "爸媽" : "小孩",
    record.note || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  download(`allowance-records-${today()}.csv`, "\ufeff" + csv, "text/csv;charset=utf-8");
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function toggleTheme() {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("allowance-theme", next);
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("show"), 2200);
}

function welcomeSummary() {
  return `
    <div class="hero-card">
      <div>
        <p class="eyebrow">手機家庭帳本</p>
        <div class="balance">NT$0</div>
        <span class="child-pill">先建立家庭帳本</span>
      </div>
      <div class="stat-strip">
        <div class="stat"><small>爸媽</small><strong>發放</strong></div>
        <div class="stat"><small>小孩</small><strong>記帳</strong></div>
        <div class="stat"><small>忘記</small><strong>補登</strong></div>
      </div>
    </div>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${text}</div>`;
}

function childName(id) {
  return state.children.find((child) => child.id === id)?.name || "未知";
}

function money(value) {
  return `NT$${Number(value || 0).toLocaleString("zh-TW")}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-TW", { month: "short", day: "numeric", weekday: "short" }).format(new Date(`${value}T00:00:00`));
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return today().slice(0, 7);
}

function nowIso() {
  return new Date().toISOString();
}

function isBackdate(date) {
  return date < today();
}

function cleanPin(value) {
  return String(value || "").replace(/\D/g, "");
}

function validPin(value) {
  return /^\d{4,8}$/.test(value);
}

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
