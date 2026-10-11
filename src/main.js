const app = document.querySelector("#app");
const budget = window.budget;
const platform = window.budgetPlatform;
let currentState;
let pendingSave;
let saveTimer;
let saveQueue = Promise.resolve();
let saveError = "";
let saveRevision = 0;
let activityHistory;
let draggedType = "";
let draggedExpenseId = "";
let draggedGroupName = "";
let draggedGroupCategoryId = "";
let itemGroupDropMode = "";
let itemDropMode = "";
let groupItemDropMode = "";
let categoryDropMode = "";
let draggedCategoryId = "";
let withinGroupDropMode = "";
let crossCategoryDropMode = "";
let categoryToFocus = "";
let elementToScrollTo = "";
let moneyObserver;
const DELETE_CONFIRM_KEY = "MyBudgeter-delete-confirm-until";
const GROUP_PATH_SEPARATOR = budget.GROUP_SEPARATOR;

const id = () => crypto.randomUUID();

function applyCategoryColor(column, color) {
  column?.style.setProperty("--accent", color);
}

function resizeNotesTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  const borderHeight = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = textarea.scrollHeight + borderHeight + "px";
}

function updateBoardPeriod(state) {
  const summary = budget.getBudgetSummary(state);
  const label = budget.SUMMARY_PERIODS.find(
    ([key]) => key === state.app.boardPeriod,
  )[1];
  for (const category of summary.categories) {
    const column = document.querySelector(
      `[data-category-id="${category.id}"]`,
    );
    if (!column) continue;
    const metrics = budget.getCategoryPeriodMetrics(
      category,
      state.app.boardPeriod,
    );
    for (const [key, value] of Object.entries(metrics)) {
      const element = column.querySelector(`[data-category-${key}]`);
      element.textContent = budget.formatMoney(value);
      delete element.dataset.fullAmountText;
    }
  }
  document
    .querySelectorAll(".group-total[data-monthly-total]")
    .forEach((total) => {
      total.textContent = budget.formatGroupTotal(
        Number(total.dataset.monthlyTotal),
        state.app.boardPeriod,
      );
      delete total.dataset.fullAmountText;
    });
  const compact = document
    .querySelector("[data-toggle-budget-board]")
    ?.closest(".card")
    .querySelector(".collapsed-summary");
  const period = summary.periods[state.app.boardPeriod];
  if (compact)
    compact.textContent = `${state.categories.length} Categories · ${label} · Spending ${budget.formatMoney(period.expenses)} · Saving ${budget.formatMoney(period.savings)}`;
  fitMoneyDisplays();
}

function fitMoneyDisplays() {
  moneyObserver?.disconnect();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const targets = document.querySelectorAll(
    ".column-metrics strong, .expense-item .item-name-row .small, .group-total[data-monthly-total]",
  );
  const fit = (element) => {
    const full = element.dataset.fullAmountText || element.textContent;
    element.dataset.fullAmountText = full;
    element.title = full;
    element.setAttribute("aria-label", full);
    context.font = getComputedStyle(element).font;
    const parent = element.parentElement;
    const style = getComputedStyle(parent);
    let width =
      parent.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    if (parent.matches(".item-group-header")) {
      width -= [...parent.children]
        .filter((child) => child !== element)
        .reduce(
          (total, child) => total + child.getBoundingClientRect().width + parseFloat(style.columnGap || 0),
          0,
        );
    }
    if (width <= 0) return;
    const currency = budget.formatMoney(0).split("0")[0];
    const amounts = [...full.matchAll(/-?\d[\d,]*\.\d{2}/g)];
    const rest = full
      .replaceAll(currency, "")
      .replace(/-?\d[\d,]*\.\d{2}/g, "");
    const available =
      Math.max(width / 2, width - context.measureText(rest).width) /
      Math.max(1, amounts.length);
    element.textContent = full.replace(/-?\d[\d,]*\.\d{2}/g, (number) =>
      budget
        .formatMoneyToFit(
          Number(number.replaceAll(",", "")),
          (text) => context.measureText(text).width <= available,
        )
        .slice(currency.length),
    );
  };
  if (typeof ResizeObserver !== "undefined") {
    moneyObserver = new ResizeObserver(() => targets.forEach(fit));
    targets.forEach((element) => moneyObserver.observe(element.parentElement));
  }
  targets.forEach(fit);
}

window.addEventListener("resize", () =>
  resizeNotesTextarea(document.querySelector(".notes-textarea")),
);

function openCategoryColor(categoryId) {
  const category = currentState.categories.find(
    (entry) => entry.id === categoryId,
  );
  if (!category) return;
  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.className = "move-dialog category-color-dialog";
  dialog.setAttribute("aria-label", `Color for ${category.name}`);
  dialog.innerHTML = `
    <form>
      <h2>Category Color</h2>
      <label class="input-label">Choose Color<input name="picker" type="color" /></label>
      <label class="input-label">Hex Color<input name="hex" type="text" pattern="#[0-9a-fA-F]{6}" maxlength="7" required placeholder="#2563eb" /></label>
      <div class="actions"><button type="submit">Save</button><button type="button" class="secondary">Cancel</button></div>
    </form>`;
  const form = dialog.querySelector("form");
  const picker = form.elements.picker;
  const hex = form.elements.hex;
  picker.value = /^#[0-9a-f]{6}$/i.test(category.color)
    ? category.color
    : "#2563eb";
  hex.value = picker.value;
  picker.oninput = () => {
    hex.value = picker.value;
  };
  hex.oninput = () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) picker.value = hex.value;
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!budget.setCategoryColor(currentState, categoryId, hex.value)) return;
    applyCategoryColor(
      document.querySelector(`[data-category-id="${categoryId}"]`),
      category.color,
    );
    saveState(currentState);
    dialog.close();
  };
  dialog.querySelector("button.secondary").onclick = () => dialog.close();
  dialog.addEventListener("close", () => {
    dialog.remove();
    previousFocus?.focus({ preventScroll: true });
  });
  document.body.append(dialog);
  dialog.showModal();
}

function addDraftExpense(state, categoryId, group = "") {
  const expense = {
    id: id(),
    name: "New Item",
    amount: 0,
    multiplier: 1,
    frequency: "monthly",
    categoryId,
    group,
    sortOrder: state.expenses.length + 1,
  };
  state.expenses.push(expense);
  state.app.editingExpenseId = "";
  state.app.addingExpenseCategoryId = "";
  state.app.addingExpenseGroup = "";
  return expense.id;
}

function confirmDeletion(message, onConfirm) {
  if (Number(sessionStorage.getItem(DELETE_CONFIRM_KEY)) > Date.now()) {
    onConfirm();
    return;
  }
  const backdrop = document.createElement("div");
  backdrop.className = "delete-dialog-backdrop";
  const dialog = document.createElement("section");
  dialog.className = "delete-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-label", message);
  const text = document.createElement("p");
  text.textContent = message;
  const option = document.createElement("label");
  option.className = "check";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  option.append(checkbox, " Do Not Ask Again For 5 Minutes");
  const actions = document.createElement("div");
  actions.className = "actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "secondary";
  cancel.textContent = "Cancel";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "delete-button";
  remove.textContent = "Delete";
  actions.append(cancel, remove);
  dialog.append(text, option, actions);
  backdrop.append(dialog);
  document.body.append(backdrop);
  const previousFocus = document.activeElement;
  const close = () => {
    backdrop.remove();
    previousFocus?.focus();
  };
  cancel.focus();
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const controls = [checkbox, cancel, remove];
    const next =
      (controls.indexOf(document.activeElement) +
        (event.shiftKey ? -1 : 1) +
        controls.length) %
      controls.length;
    event.preventDefault();
    controls[next].focus();
  });
  cancel.addEventListener("click", close);
  remove.addEventListener("click", () => {
    if (checkbox.checked)
      sessionStorage.setItem(
        DELETE_CONFIRM_KEY,
        String(Date.now() + 5 * 60 * 1000),
      );
    close();
    onConfirm();
  });
}

function moveItemBesideGroup(state, categoryId, itemId, group, placement) {
  const item = state.expenses.find((expense) => expense.id === itemId);
  return Boolean(
    item &&
    budget.moveBudgetEntry(
      state,
      { type: "item", categoryId: item.categoryId, id: item.id },
      { categoryId, target: { type: "group", group }, placement },
    ),
  );
}

function moveItemBesideItem(state, categoryId, sourceId, targetId, placement) {
  const units = [];
  const byKey = new Map();
  budget
    .sortExpenses(
      state.expenses.filter((expense) => expense.categoryId === categoryId),
      "manual",
    )
    .forEach((expense) => {
      const key = expense.group
        ? `group:${expense.group}`
        : `item:${expense.id}`;
      if (!byKey.has(key)) {
        const unit = { key, items: [] };
        byKey.set(key, unit);
        units.push(unit);
      }
      byKey.get(key).items.push(expense);
    });
  const sourceIndex = units.findIndex(
    (unit) => unit.key === `item:${sourceId}`,
  );
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex(
    (unit) => unit.key === `item:${targetId}`,
  );
  if (targetIndex < 0) return false;
  units.splice(
    placement === "before" ? targetIndex : targetIndex + 1,
    0,
    source,
  );
  units
    .flatMap((unit) => unit.items)
    .forEach((expense, index) => {
      expense.sortOrder = index + 1;
    });
  return true;
}

function moveGroupBesideItem(state, categoryId, group, targetId, placement) {
  const units = [];
  const byKey = new Map();
  budget
    .sortExpenses(
      state.expenses.filter((expense) => expense.categoryId === categoryId),
      "manual",
    )
    .forEach((expense) => {
      const key = expense.group
        ? `group:${expense.group}`
        : `item:${expense.id}`;
      if (!byKey.has(key)) {
        const unit = { key, items: [] };
        byKey.set(key, unit);
        units.push(unit);
      }
      byKey.get(key).items.push(expense);
    });
  const sourceIndex = units.findIndex((unit) => unit.key === `group:${group}`);
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex(
    (unit) => unit.key === `item:${targetId}`,
  );
  if (targetIndex < 0) return false;
  units.splice(
    placement === "before" ? targetIndex : targetIndex + 1,
    0,
    source,
  );
  units
    .flatMap((unit) => unit.items)
    .forEach((expense, index) => {
      expense.sortOrder = index + 1;
    });
  return true;
}

function moveGroupBesideGroup(
  state,
  categoryId,
  sourceGroup,
  targetGroup,
  placement,
) {
  const units = [];
  const byKey = new Map();
  budget
    .sortExpenses(
      state.expenses.filter((expense) => expense.categoryId === categoryId),
      "manual",
    )
    .forEach((expense) => {
      const key = expense.group
        ? `group:${expense.group}`
        : `item:${expense.id}`;
      if (!byKey.has(key)) {
        const unit = { key, items: [] };
        byKey.set(key, unit);
        units.push(unit);
      }
      byKey.get(key).items.push(expense);
    });
  const sourceIndex = units.findIndex(
    (unit) => unit.key === `group:${sourceGroup}`,
  );
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex(
    (unit) => unit.key === `group:${targetGroup}`,
  );
  if (targetIndex < 0) return false;
  units.splice(
    placement === "before" ? targetIndex : targetIndex + 1,
    0,
    source,
  );
  units
    .flatMap((unit) => unit.items)
    .forEach((expense, index) => {
      expense.sortOrder = index + 1;
    });
  return true;
}

function nextGroupName(state, categoryId) {
  const groups = new Set(
    state.expenses
      .filter((expense) => expense.categoryId === categoryId)
      .map((expense) => expense.group)
      .filter(Boolean),
  );
  let index = 1;
  let name = "New Group";
  while (groups.has(name)) name = `New Group ${++index}`;
  return name;
}

function renderNestedGroups(list, state, categoryId) {
  const groupedItems = [...list.children].map((item) => ({
    item,
    expense: state.expenses.find(
      (expense) =>
        expense.id === (item.dataset.expenseId || item.dataset.editExpenseForm),
    ),
  }));
  if (
    !groupedItems.some(({ expense }) =>
      expense?.group?.includes(GROUP_PATH_SEPARATOR),
    )
  )
    return false;

  const root = { entries: [], children: new Map() };
  const addPath = (path) => {
    let parent = root;
    let fullPath = "";
    budget.splitGroupPath(path).forEach((name) => {
      fullPath = fullPath ? `${fullPath}${GROUP_PATH_SEPARATOR}${name}` : name;
      let group = parent.children.get(name);
      if (!group) {
        group = { name, path: fullPath, entries: [], children: new Map() };
        parent.children.set(name, group);
        parent.entries.push(group);
      }
      parent = group;
    });
    return parent;
  };

  groupedItems.forEach(({ item, expense }) => {
    if (!expense?.group?.trim()) root.entries.push(item);
    else addPath(expense.group).entries.push(item);
  });

  const renderGroup = (group) => {
    const groupKey = `${categoryId}:${group.path}`;
    const isCollapsed = state.app.collapsedGroups?.[groupKey] === true;
    const monthlyTotal = state.expenses
      .filter(
        (expense) =>
          expense.categoryId === categoryId &&
          budget.isGroupOrDescendant(expense.group?.trim(), group.path),
      )
      .reduce(
        (total, expense) =>
          total +
          budget.normalizeToMonthly(
            expense.amount * expense.multiplier,
            expense.frequency,
            state.app.paychecksPerMonth,
          ),
        0,
      );
    const container = document.createElement("section");
    container.className = `item-group${isCollapsed ? " collapsed" : ""}`;
    container.draggable = group.entries.some((entry) => entry.nodeType === 1);
    container.dataset.groupName = group.path;

    const header = document.createElement("div");
    header.className = "item-group-header";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ghost small-button group-toggle";
    toggle.dataset.toggleGroup = group.path;
    toggle.title = isCollapsed ? "Expand Group" : "Collapse Group";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-expanded", String(!isCollapsed));
    toggle.innerHTML = isCollapsed
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';
    const heading = document.createElement("h4");
    heading.textContent = group.name;
    const total = document.createElement("strong");
    total.className = "group-total";
    total.dataset.monthlyTotal = monthlyTotal;
    total.textContent = budget.formatGroupTotal(
      monthlyTotal,
      state.app.boardPeriod,
    );
    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "ghost small-button";
    rename.dataset.renameGroup = group.path;
    rename.textContent = "Edit";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost small-button";
    remove.dataset.removeGroup = group.path;
    remove.textContent = "×";
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(rename, remove);
    header.append(toggle, heading, total, actions);

    const items = document.createElement("div");
    items.className = "item-group-items";
    group.entries.forEach((entry) =>
      items.append(entry.nodeType === 1 ? entry : renderGroup(entry)),
    );
    const addItem = document.createElement("button");
    addItem.type = "button";
    addItem.className = "ghost expense-add-button group-add-button";
    addItem.dataset.addGroupItem = group.path;
    addItem.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';
    addItem.setAttribute("aria-label", `Add Item to ${group.path}`);
    addItem.title = "Add Item";
    container.append(header, items, addItem);
    return container;
  };

  list.replaceChildren(
    ...root.entries.map((entry) =>
      entry.nodeType === 1 ? entry : renderGroup(entry),
    ),
  );
  return true;
}

function moveCategory(state, sourceId, targetId, placement) {
  const categories = [...state.categories].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  );
  const sourceIndex = categories.findIndex(
    (category) => category.id === sourceId,
  );
  if (sourceIndex < 0) return false;
  const [source] = categories.splice(sourceIndex, 1);
  const targetIndex = categories.findIndex(
    (category) => category.id === targetId,
  );
  if (targetIndex < 0) return false;
  categories.splice(
    placement === "before" ? targetIndex : targetIndex + 1,
    0,
    source,
  );
  categories.forEach((category, index) => {
    category.sortOrder = index + 1;
  });
  return true;
}

function downloadSaveFile(state) {
  if (platform.isAndroid) {
    platform
      .exportFile(JSON.stringify(budget.createSavePayload(state), null, 2))
      .catch((error) => window.alert(error.message));
    return;
  }
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(budget.createSavePayload(state), null, 2)], {
      type: "application/json",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "MyBudgeter-save.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function loadState() {
  const raw = await platform.load();
  return raw
    ? budget.normalizeSaveState(JSON.parse(raw))
    : budget.createEmptyState();
}

function saveState(state, recordHistory = true) {
  if (recordHistory) activityHistory?.record(state);
  pendingSave = {
    value: JSON.stringify(budget.createSavePayload(state)),
    revision: ++saveRevision,
  };
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, platform.isAndroid ? 0 : 150);
}

function flushSave() {
  clearTimeout(saveTimer);
  if (!pendingSave) return saveQueue;
  const { value, revision } = pendingSave;
  pendingSave = null;
  saveQueue = saveQueue.then(async () => {
    try {
      await platform.save(value);
      saveError = "";
      document.querySelector(".storage-error")?.remove();
      showSaved();
    } catch (error) {
      if (revision === saveRevision) pendingSave ||= { value, revision };
      saveError = `Budget not saved: ${error.message}`;
      showStorageError();
    }
  });
  return saveQueue;
}

function showStorageError() {
  if (!saveError) return;
  document.querySelector(".storage-error")?.remove();
  const message = document.createElement("div");
  message.className = "storage-error card";
  message.setAttribute("role", "alert");
  message.textContent = saveError;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "Retry Save";
  retry.addEventListener("click", () => {
    saveState(currentState);
    flushSave();
  });
  message.append(retry);
  app.prepend(message);
}

async function importBudget(value) {
  if (value == null) return;
  try {
    const replacement = budget.normalizeSaveState(JSON.parse(value));
    if (
      !window.confirm("Importing will overwrite the current budget. Continue?")
    )
      return;
    app.inert = true;
    app.setAttribute("aria-busy", "true");
    await flushSave();
    const payload = JSON.stringify(budget.createSavePayload(replacement));
    await platform.save(payload);
    pendingSave = null;
    saveError = "";
    currentState = replacement;
    if (!platform.isMobile && !activityHistory)
      activityHistory = window.budgetHistory.create(currentState);
    else activityHistory?.record(currentState);
    render(currentState);
    showSaved();
    window.budgetMobile?.checkpoint(true);
  } catch (error) {
    window.alert(`Could not import the budget: ${error.message}`);
  } finally {
    app.inert = false;
    app.removeAttribute("aria-busy");
  }
}

function showSaved(message = "Saved") {
  const status = document.querySelector("[data-save-status]");
  if (!status) return;
  status.textContent = message;
  status.setAttribute("role", "status");
  status.classList.add("visible");
  setTimeout(() => status.classList.remove("visible"), 1400);
}

function render(state) {
  const scrollPosition = window.scrollY;
  const mobile = platform.isMobile || window.innerWidth <= 720;
  const anchor = mobile
    ? [...app.querySelectorAll(".expense-item")].find(
        (element) => element.getBoundingClientRect().bottom > 0,
      )
    : null;
  const anchorId = anchor?.dataset.expenseId;
  const anchorTop = anchor?.getBoundingClientRect().top;
  currentState = state;
  app.innerHTML = window.renderApp(
    state,
    budget.getBudgetSummary(state),
    budget.sortCategories(state),
    budget.sortExpenses(state.expenses, state.app.expenseSort),
  );
  wireEvents(state);
  const footer = document.createElement("footer");
  footer.className = "app-footer";
  footer.innerHTML = `Michael Yeh <span aria-hidden="true">&copy;</span> ${new Date().getFullYear()}`;
  app.append(footer);
  if (categoryToFocus) {
    document
      .querySelector(`[data-category-id="${categoryToFocus}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });
    categoryToFocus = "";
  }
  if (elementToScrollTo) {
    if (!mobile)
      document
        .querySelector(elementToScrollTo)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    elementToScrollTo = "";
  }
  state.categories.forEach((category) =>
    applyCategoryColor(
      document.querySelector(`[data-category-id="${category.id}"]`),
      category.color,
    ),
  );
  showStorageError();
  updateDragAvailability();
  window.dispatchEvent(new CustomEvent("budget-render", { detail: state }));
  fitMoneyDisplays();
  const restoredAnchor =
    anchorId && app.querySelector(`[data-expense-id="${anchorId}"]`);
  window.scrollTo(
    0,
    restoredAnchor
      ? window.scrollY + restoredAnchor.getBoundingClientRect().top - anchorTop
      : scrollPosition,
  );
}

function hasOpenBudgetEditor() {
  return Boolean(
    document.querySelector(
      '.expense-form, .expense-edit-form, .category-edit-form, .group-rename-form, .income-edit-form:not([hidden])',
    ),
  );
}

function updateDragAvailability() {
  const editing = hasOpenBudgetEditor();
  app.classList.toggle("editing-active", editing);
  if (editing) {
    app.querySelectorAll('[draggable="true"]').forEach((node) => {
      node.draggable = false;
    });
  }
}

function formValues(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    amount: Number(data.get("amount") || 0),
    multiplier: Math.max(0.01, Number(data.get("multiplier") || 1)),
    frequency: String(data.get("frequency") || "biweekly"),
  };
}

function showFormError(form, message) {
  let error = form.querySelector(".form-error");
  if (!error) {
    error = document.createElement("div");
    error.className = "form-error";
    form.append(error);
  }
  error.textContent = message;
}

function wireEvents(state) {
  document
    .querySelector("[data-income-period-select]")
    ?.addEventListener("change", (event) => {
      state.app.incomePeriod = event.target.value;
      document.querySelector("[data-income-total]").textContent =
        budget.formatMoney(
          budget.getBudgetSummary(state).periods[state.app.incomePeriod].income,
        );
      saveState(state);
    });
  document
    .querySelector("[data-summary-period-select]")
    ?.addEventListener("change", (event) => {
      state.app.summaryPeriod = event.target.value;
      document.querySelectorAll("[data-summary-period]").forEach((card) => {
        card.hidden = card.dataset.summaryPeriod !== state.app.summaryPeriod;
      });
      saveState(state);
    });
  if (state.app.expenseSort === "group") state.app.expenseSort = "manual";
  Object.keys(state.app.expenseSorts || {}).forEach((categoryId) => {
    if (state.app.expenseSorts[categoryId] === "group")
      state.app.expenseSorts[categoryId] = "manual";
  });
  const cards = [...document.querySelectorAll(".card")];
  const incomeToggle = document.querySelector("[data-toggle-income]");
  if (incomeToggle)
    cards[0]?.querySelector(".section-heading")?.append(incomeToggle);
  const formatCurrency = budget.formatMoney;
  const summary = budget.getBudgetSummary(state);
  const makeCollapsible = (card, stateKey, toggleName, details) => {
    if (!card) return;
    const heading = card.querySelector(".section-heading");
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "link-button hint";
    toggle.dataset[toggleName] = "true";
    heading?.append(toggle);
    const compact =
      details !== undefined ? document.createElement("div") : null;
    if (compact) {
      compact.className = "collapsed-summary";
      compact.textContent = details;
      card.append(compact);
    }
    const update = () => {
      const isOpen = state.app[stateKey] !== false;
      toggle.textContent =
        (platform.isMobile ? "Tap" : "Click") +
        " To " +
        (isOpen ? "Collapse" : "Expand");
      toggle.setAttribute("aria-expanded", String(isOpen));
      if (compact) compact.hidden = isOpen;
      [...card.children].forEach((child) => {
        if (child !== heading && child !== compact) child.hidden = !isOpen;
      });
      if (isOpen) resizeNotesTextarea(card.querySelector(".notes-textarea"));
    };
    toggle.onclick = (event) => {
      event.stopPropagation();
      state.app[stateKey] = state.app[stateKey] === false;
      update();
      saveState(state);
      window.budgetMobile?.checkpoint();
    };
    update();
  };
  makeCollapsible(
    cards[1],
    "isBudgetBoardOpen",
    "toggleBudgetBoard",
    `${state.categories.length} Categories · Spending ${formatCurrency(summary.monthlyExpenses)} · Saving ${formatCurrency(summary.monthlySavings)}`,
  );
  const notesCard = document.createElement("section");
  notesCard.className = "card notes-card";
  const notesHeading = document.createElement("div");
  notesHeading.className = "section-heading";
  notesHeading.innerHTML = "<h2>Notes</h2>";
  const notesEditor = document.createElement("textarea");
  notesEditor.className = "notes-textarea";
  notesEditor.rows = 2;
  notesEditor.value = state.notes || "";
  notesEditor.placeholder = "Write your notes here";
  notesEditor.addEventListener("input", () => {
    resizeNotesTextarea(notesEditor);
    state.notes = notesEditor.value;
    notesCard.querySelector(".notes-preview").textContent = state.notes;
    saveState(state);
  });
  notesCard.append(notesHeading, notesEditor);
  app?.append(notesCard);
  makeCollapsible(notesCard, "isNotesOpen", "toggleNotes", state.notes || "");
  notesCard.querySelector(".collapsed-summary").className = "notes-preview";
  const faqCard = document.createElement("section");
  faqCard.className = "card faq-card";
  faqCard.innerHTML = `
    <details>
      <summary class="section-heading"><h2>FAQs Section</h2><span class="link-button hint">click to expand</span></summary>
      <div class="faq-content">
        <details class="faq-question">
          <summary>How does MyBudgeter calculate my budget?</summary>
          <p>Enter each income source, expense, and savings contribution with its amount and frequency. MyBudgeter converts every recurring value to a monthly average so amounts with different schedules can be compared fairly. Category targets are calculated from your monthly net income and each category's budget percentage. The Budget Board shows actual spending or savings against that target, while Complete Summary shows the same plan across weekly, biweekly, monthly, quarterly, and annual views.</p>
          <p>Uncategorized is the portion of normalized income not yet assigned to expenses or savings. Total Unspent includes both your savings contributions and Uncategorized money. These figures are planning estimates based only on what you enter; they do not connect to or reconcile with a bank account.</p>
        </details>
        <details class="faq-question">
          <summary>What do the frequency options mean?</summary>
          <p>Frequency describes how often an entered amount occurs. Daily uses an average of 30.4375 days per month. Weekly uses 4.34524 weeks per month. Biweekly means once every two weeks, or about 2.17262 payments per month. Semi-monthly means exactly two payments each month, such as the 1st and 15th. Monthly is once per month, quarterly is once every three months, and annually is once per year.</p>
          <p>Choose Semi-monthly when a payment happens twice in every calendar month; choose Biweekly when it happens every 14 days. Those schedules are not the same over a full year. The app uses the selected frequency for income, expenses, and savings. If you use Quantity for an item, the item amount is multiplied by that quantity before the frequency is converted to a monthly amount.</p>
        </details>
        <details class="faq-question">
          <summary>What can I do in the app?</summary>
          <p>You can add and edit multiple income sources, including optional notes. Create expense and savings categories with a budget percentage, then add recurring items to each category. A category named Savings is automatically marked as a savings category unless you manually change that setting. You can track decimal quantities for prorated recurring costs, such as half of a biennial cost entered annually.</p>
          <p>You can organize items into groups and nested subgroups, rename or delete a whole group, and drag categories, groups, and items to manually reorder or move them between categories. The app also includes a Notes area, collapsed Net Income and Budget Board sections, category targets and usage, and a Complete Summary across several time periods.</p>
        </details>
        <details class="faq-question">
          <summary>How do saving, downloading, and importing work?</summary>
          <p>Your working budget automatically saves in this browser's local storage shortly after changes are made. Use Download Save File to create a JSON backup containing your income, categories, items, notes, organization, colors, and relevant preferences. Keep downloaded files somewhere you control if the information is important to you.</p>
          <p>Use Import Save File to restore a downloaded MyBudgeter JSON file or move a budget to another browser or device. Importing replaces the current budget after confirmation, so download a backup first if you may want to keep the existing budget. Save files record the app version and are designed to remain compatible within the same major version.</p>
        </details>
        <details class="faq-question">
          <summary>Where is my data stored and who can see it?</summary>
          <p>MyBudgeter is a client-side app with no server dependency. Your active budget is stored in the local storage for the browser and browser profile you use. It is not automatically uploaded to a MyBudgeter account because the app does not provide one.</p>
          <p>Clearing browser site data, using a different browser profile, or losing access to a device can remove that local copy. Download save files regularly to protect against that. Anyone with access to your browser profile or a downloaded save file may be able to view its contents, so treat backups as private financial information.</p>
        </details>
        <details class="faq-question">
          <summary>What can the app not do?</summary>
          <p>MyBudgeter does not connect to banks, credit cards, payroll systems, or other financial institutions. It cannot import transactions automatically, categorize purchases for you, send bill reminders, make payments, or reconcile planned amounts with an account balance. There is no cloud sync, account sign-in, shared household budget, or real-time collaboration.</p>
          <p>The app is a budgeting planner, not tax, legal, investment, or financial advice. It does not guarantee that a plan is affordable or that an entered schedule, tax withholding, debt balance, interest calculation, or exchange rate is correct. Review your entries and consult an appropriate professional when you need advice for a financial decision.</p>
        </details>
      </div>
    </details>
  `;
  app?.append(faqCard);
  const faqDetails = faqCard.querySelector(":scope > details");
  faqDetails.open = state.app.isFaqOpen === true;
  const updateFaq = () => {
    faqDetails.querySelector("summary span").textContent =
      (platform.isMobile ? "Tap" : "Click") +
      " To " +
      (faqDetails.open ? "Collapse" : "Expand");
  };
  updateFaq();
  faqDetails.addEventListener("toggle", () => {
    if (!faqDetails.isConnected) return;
    updateFaq();
    if (state.app.isFaqOpen === faqDetails.open) return;
    state.app.isFaqOpen = faqDetails.open;
    saveState(state);
    window.budgetMobile?.checkpoint();
  });
  const saveActions = document.querySelector("header .actions");
  if (saveActions && !platform.isAndroid) {
    const help = document.createElement("p");
    help.className = "save-help";
    help.innerHTML =
      "Download the autosave file for a safe backup.<br>Importing a save file replaces the current budget.";
    saveActions.append(help);
  }
  const categoryMeta = document.querySelector(".category-form-meta");
  if (categoryMeta) {
    const categoryTotal = budget.getCategoryPercentageTotal(state);
    const overage = categoryTotal - 100;
    categoryMeta.replaceChildren();
    const budgetTotal = document.createElement("span");
    budgetTotal.textContent = `Categories Total: ${categoryTotal.toFixed(1)}%`;
    categoryMeta.append(budgetTotal);
    if (overage > 0) {
      const warning = document.createElement("span");
      warning.className = "message";
      warning.textContent = `Warning: category targets exceed 100% by ${overage.toFixed(1)}%.`;
      document.querySelector(".budget-board-title")?.append(warning);
    }
  }
  summary.categories.forEach((category) => {
    const column = document.querySelector(
      `[data-category-id="${category.id}"]`,
    );
    const progress = column?.querySelector(".progress-bar");
    if (!progress) return;
    const label = document.createElement("strong");
    label.className = "progress-label";
    label.textContent = `${category.usagePercent.toFixed(1)}%`;
    progress.append(label);
    const heading = column.querySelector(".column-header p");
    if (heading)
      heading.textContent = `Budget ${category.percentage}% · Actual ${(summary.monthlyIncome ? (category.monthlySpent / summary.monthlyIncome) * 100 : 0).toFixed(1)}% · ${category.isSavings ? "Savings" : "Expenses"}`;
  });
  const addCategoryButton = document.querySelector("[data-show-category-form]");
  const board = document.querySelector(".board");
  if (board) {
    const periodLabel = document.createElement("label");
    periodLabel.className = "board-period-control";
    const periodName = document.createElement("span");
    periodName.textContent = "Budget Period";
    periodLabel.append(periodName);
    const periodSelect = document.createElement("select");
    periodSelect.dataset.boardPeriodSelect = "";
    for (const [key, label] of budget.SUMMARY_PERIODS) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      periodSelect.append(option);
    }
    periodSelect.value = state.app.boardPeriod;
    periodSelect.addEventListener("change", () => {
      state.app.boardPeriod = periodSelect.value;
      updateBoardPeriod(state);
      saveState(state);
    });
    periodLabel.append(periodSelect);
    categoryMeta?.append(periodLabel);
    updateBoardPeriod(state);
  }
  if (board && !platform.isMobile) {
    board.style.setProperty("--categories-per-row", state.app.categoriesPerRow);
    const layoutLabel = document.createElement("label");
    layoutLabel.className = "board-layout-control";
    layoutLabel.append("Categories Per Row ");
    const layoutSelect = document.createElement("select");
    for (const count of [1, 2, 3]) {
      const option = document.createElement("option");
      option.value = String(count);
      option.textContent = String(count);
      layoutSelect.append(option);
    }
    layoutSelect.value = String(state.app.categoriesPerRow);
    layoutSelect.addEventListener("change", () => {
      state.app.categoriesPerRow = Number(layoutSelect.value);
      board.dataset.categoriesPerRow = String(state.app.categoriesPerRow);
      board.style.setProperty(
        "--categories-per-row",
        state.app.categoriesPerRow,
      );
      saveState(state);
    });
    layoutLabel.append(layoutSelect);
    categoryMeta?.append(layoutLabel);
  }
  if (board && addCategoryButton) {
    const addCategoryRow = document.createElement("div");
    addCategoryRow.className = "category-add-row";
    addCategoryRow.append(addCategoryButton);
    board.append(addCategoryRow);
  }
  document.querySelectorAll(".expense-list").forEach((list) => {
    const categoryId = list.closest("[data-category-id]")?.dataset.categoryId;
    if (renderNestedGroups(list, state, categoryId)) return;
    const groups = new Map();
    const nodes = [];
    [...list.children].forEach((item) => {
      const expenseId = item.dataset.expenseId || item.dataset.editExpenseForm;
      const group = state.expenses
        .find((expense) => expense.id === expenseId)
        ?.group?.trim();
      if (!group) {
        nodes.push(item);
        return;
      }
      let container = groups.get(group);
      if (!container) {
        const groupKey = `${categoryId}:${group}`;
        const isCollapsed = state.app.collapsedGroups?.[groupKey] === true;
        const groupTotal = state.expenses
          .filter(
            (expense) =>
              expense.categoryId === categoryId &&
              expense.group?.trim() === group,
          )
          .reduce(
            (total, expense) =>
              total +
              budget.normalizeToMonthly(
                expense.amount * expense.multiplier,
                expense.frequency,
                state.app.paychecksPerMonth,
              ),
            0,
          );
        container = document.createElement("section");
        container.className = `item-group${isCollapsed ? " collapsed" : ""}`;
        container.draggable = true;
        container.dataset.groupName = group;
        const header = document.createElement("div");
        header.className = "item-group-header";
        const heading = document.createElement("h4");
        heading.textContent = group;
        const total = document.createElement("strong");
        total.className = "group-total";
        total.dataset.monthlyTotal = groupTotal;
        total.textContent = budget.formatGroupTotal(
          groupTotal,
          state.app.boardPeriod,
        );
        const rename = document.createElement("button");
        rename.type = "button";
        rename.className = "ghost small-button";
        rename.dataset.renameGroup = group;
        rename.textContent = "Edit";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "ghost small-button";
        remove.dataset.removeGroup = group;
        remove.textContent = "×";
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "ghost small-button group-toggle";
        toggle.dataset.toggleGroup = group;
        toggle.title = isCollapsed ? "Expand Group" : "Collapse Group";
        toggle.setAttribute("aria-label", toggle.title);
        toggle.setAttribute("aria-expanded", String(!isCollapsed));
        toggle.innerHTML = isCollapsed
          ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';
        const items = document.createElement("div");
        items.className = "item-group-items";
        const add = document.createElement("button");
        add.type = "button";
        add.className = "ghost expense-add-button group-add-button";
        add.dataset.addGroupItem = group;
        add.innerHTML =
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>';
        add.setAttribute("aria-label", `Add Item to ${group}`);
        add.title = "Add Item";
        const actions = document.createElement("div");
        actions.className = "actions";
        actions.append(rename, remove);
        header.append(toggle, heading, total, actions);
        container.append(header, items, add);
        groups.set(group, container);
        nodes.push(container);
      }
      container.querySelector(".item-group-items").append(item);
    });
    if (categoryId && groups.size) list.replaceChildren(...nodes);
  });
  document
    .querySelectorAll(".expense-form, [data-edit-expense-form]")
    .forEach((form) => {
      form.noValidate = true;
    });
  const editingCategory = state.categories.find(
    (category) => category.id === state.app.editingCategoryId,
  );
  if (editingCategory) {
    const header = document.querySelector(
      `[data-category-id="${editingCategory.id}"] .column-header`,
    );
    if (header) {
      const form = document.createElement("form");
      form.noValidate = true;
      form.className = "category-edit-form";
      form.dataset.editCategoryForm = editingCategory.id;
      const row = document.createElement("div");
      row.className = "field-row";
      const name = document.createElement("input");
      name.name = "name";
      name.value = editingCategory.name;
      name.defaultValue = name.value;
      name.required = true;
      const percentage = document.createElement("input");
      percentage.name = "percentage";
      percentage.type = "number";
      percentage.min = "0";
      percentage.step = "0.1";
      percentage.value = editingCategory.percentage;
      percentage.defaultValue = percentage.value;
      percentage.required = true;
      const savings = document.createElement("label");
      savings.className = "check";
      const checkbox = document.createElement("input");
      checkbox.name = "isSavings";
      checkbox.type = "checkbox";
      checkbox.checked =
        editingCategory.isSavings ||
        editingCategory.name.trim().toLowerCase() === "savings";
      checkbox.defaultChecked = checkbox.checked;
      savings.append(checkbox, " Savings Category");
      const actions = document.createElement("div");
      actions.className = "actions";
      const save = document.createElement("button");
      save.type = "submit";
      save.textContent = "Save";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "secondary";
      cancel.dataset.cancelEditCategory = "true";
      cancel.textContent = "Cancel";
      actions.append(save, cancel);
      row.append(name, percentage);
      form.append(row, savings, actions);
      header.replaceWith(form);
    }
  }
  document.querySelectorAll("form").forEach((form) => {
    form
      .querySelectorAll('input:not([type="checkbox"]), select, textarea')
      .forEach((field) => {
        if (field.name === "multiplier") {
          field.min = "1";
          field.step = "1";
          field.addEventListener("keydown", (event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            event.preventDefault();
            const value = Number(field.value) || 0;
            field.value =
              event.key === "ArrowUp"
                ? String(Math.floor(value) + 1)
                : String(Math.max(1, Math.ceil(value) - 1));
            field.dispatchEvent(new Event("input", { bubbles: true }));
          });
        }
        if (field.parentElement?.classList.contains("input-label")) return;
        const label = document.createElement("label");
        label.className = "input-label";
        label.textContent =
          field.name === "name" && form.classList.contains("income-edit-form")
            ? "Income Source"
            : {
                amount: "Amount",
                multiplier: "Quantity",
                frequency: "Frequency",
                notes: "Notes",
                percentage: "Budget Percentage",
                name: "Name",
              }[field.name] || "Value";
        field.replaceWith(label);
        label.append(field);
      });
  });
  document
    .querySelectorAll("[data-edit-category-form], #category-form")
    .forEach((form) => {
      const name = form.elements.name;
      const savings = form.elements.isSavings;
      if (!name || !savings) return;
      let manuallyChanged = false;
      savings.addEventListener("change", () => {
        manuallyChanged = true;
      });
      name.addEventListener("input", () => {
        if (!manuallyChanged && name.value.trim().toLowerCase() === "savings")
          savings.checked = true;
      });
    });
  document.querySelectorAll("[data-edit-category-form]").forEach((form) => {
    const category = state.categories.find(
      (item) => item.id === form.dataset.editCategoryForm,
    );
    if (!category) return;
    const saveDraft = () => {
      if (platform.isMobile) return;
      category.name = form.elements.name.value;
      category.percentage = Math.max(
        0,
        Number(form.elements.percentage.value) || 0,
      );
      category.isSavings = form.elements.isSavings.checked;
      saveState(state);
    };
    form.elements.name.addEventListener("input", saveDraft);
    form.elements.percentage.addEventListener("input", saveDraft);
    form.elements.isSavings.addEventListener("change", saveDraft);
  });
  document.querySelectorAll("[data-expense-id]").forEach((row) => {
    const expense = state.expenses.find(
      (item) => item.id === row.dataset.expenseId,
    );
    if (!expense || row.querySelector("form") || Number(expense.multiplier) === 1) return;
    const detail = row.querySelector(".small");
    if (detail)
      detail.textContent = `${formatCurrency(expense.amount)} × ${expense.multiplier} = ${formatCurrency(expense.amount * expense.multiplier)} / ${expense.frequency}`;
  });
  document.querySelectorAll("[data-edit-income-form]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const income = state.incomes.find(
        (item) => item.id === form.dataset.editIncomeForm,
      );
      const name = String(data.get("name") || "").trim();
      const amount = Number(data.get("amount") || 0);
      if (!income || !name || amount <= 0) return;
      Object.assign(income, {
        name,
        amount,
        frequency: String(data.get("frequency") || "monthly"),
        notes: String(data.get("notes") || "").trim(),
      });
      state.app.editingIncomeId = "";
      state.app.draftIncomeId = "";
      saveState(state);
      render(state);
    }),
  );
  document
    .querySelector("#category-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      const category = {
        id: id(),
        name: String(data.get("name") || "").trim(),
        percentage: Math.max(0, Number(data.get("percentage") || 0)),
        isSavings: data.get("isSavings") === "on",
        sortOrder: state.categories.length + 1,
      };
      if (!category.name || category.percentage <= 0) return;
      state.categories.push(category);
      state.app.isAddingCategory = false;
      saveState(state);
      render(state);
    });
  document.querySelectorAll("[data-edit-category-form]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const category = state.categories.find(
        (item) => item.id === form.dataset.editCategoryForm,
      );
      if (!category) return;
      const name = String(data.get("name") || "").trim();
      const percentage = Math.max(0, Number(data.get("percentage") || 0));
      if (!name || percentage <= 0) {
        form.elements.name.classList.toggle("invalid-field", !name);
        form.elements.percentage.classList.toggle(
          "invalid-field",
          percentage <= 0,
        );
        showFormError(
          form,
          "Enter a category name and a monthly target greater than 0%.",
        );
        return;
      }
      Object.assign(category, {
        name,
        percentage,
        isSavings: data.get("isSavings") === "on",
      });
      state.app.editingCategoryId = "";
      state.app.draftCategoryId = "";
      saveState(state);
      render(state);
    }),
  );
  document.querySelectorAll(".expense-form").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = formValues(form);
      if (!data.name || !Number.isFinite(data.amount) || data.amount < 0) return;
      state.expenses.push({
        ...data,
        id: id(),
        categoryId: form.dataset.categoryId,
        group: state.app.addingExpenseGroup || "",
        sortOrder: state.expenses.length + 1,
      });
      state.app.addingExpenseCategoryId = "";
      state.app.addingExpenseGroup = "";
      saveState(state);
      render(state);
    }),
  );
  document.querySelectorAll("[data-edit-expense-form]").forEach((form) =>
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = formValues(form);
      if (!data.name || !Number.isFinite(data.amount) || data.amount < 0) return;
      const expense = state.expenses.find(
        (item) => item.id === form.dataset.editExpenseForm,
      );
      if (!expense) return;
      Object.assign(expense, data, { group: expense.group });
      state.app.editingExpenseId = "";
      saveState(state);
      render(state);
    }),
  );
  document
    .querySelector("[data-import-save]")
    ?.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        await importBudget(await file.text());
      } catch (error) {
        window.alert(`Could not read the save file: ${error.message}`);
      } finally {
        event.target.value = "";
      }
    });
}

app?.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || !currentState) return;
  if (button.matches("[data-toggle-category]")) {
    const categoryId = button.dataset.toggleCategory;
    currentState.app.collapsedCategories ||= {};
    const collapsed = currentState.app.collapsedCategories[categoryId] !== true;
    currentState.app.collapsedCategories[categoryId] = collapsed;
    button
      .closest(".category-column")
      .classList.toggle("category-collapsed", collapsed);
    button.setAttribute("aria-expanded", String(!collapsed));
    const category = currentState.categories.find(
      (entry) => entry.id === categoryId,
    );
    button.title = collapsed ? "Expand Category" : "Collapse Category";
    button.setAttribute(
      "aria-label",
      `${collapsed ? "Expand" : "Collapse"} ${category?.name || ""} Category`,
    );
    button
      .querySelector("path")
      .setAttribute("d", collapsed ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6");
    saveState(currentState);
    window.budgetMobile?.checkpoint();
    return;
  }
  if (button.matches("[data-color-category]")) {
    openCategoryColor(button.dataset.colorCategory);
    return;
  }
  if (button.matches("[data-toggle-group]")) {
    const categoryId = button.closest("[data-category-id]")?.dataset.categoryId;
    const groupKey = `${categoryId}:${button.dataset.toggleGroup}`;
    currentState.app.collapsedGroups ||= {};
    currentState.app.collapsedGroups[groupKey] =
      currentState.app.collapsedGroups[groupKey] !== true;
    const isCollapsed = currentState.app.collapsedGroups[groupKey];
    button.closest(".item-group").classList.toggle("collapsed", isCollapsed);
    button.title = isCollapsed ? "Expand Group" : "Collapse Group";
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-expanded", String(!isCollapsed));
    button
      .querySelector("path")
      .setAttribute("d", isCollapsed ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6");
    saveState(currentState);
    window.budgetMobile?.checkpoint();
    return;
  }
  if (button.matches("[data-remove-category]")) {
    const categoryId = button.dataset.removeCategory;
    const category = currentState.categories.find(
      (item) => item.id === categoryId,
    );
    confirmDeletion(
      `Delete ${category?.name || "This"} Category And All Of Its Items?`,
      () => {
        delete currentState.app.collapsedCategories?.[categoryId];
        currentState.categories = currentState.categories.filter(
          (item) => item.id !== categoryId,
        );
        currentState.expenses = currentState.expenses.filter(
          (item) => item.categoryId !== categoryId,
        );
        saveState(currentState);
        render(currentState);
      },
    );
    return;
  }
  if (button.matches("[data-remove-expense]")) {
    const expenseId = button.dataset.removeExpense;
    confirmDeletion("Delete This Item?", () => {
      currentState.expenses = currentState.expenses.filter(
        (item) => item.id !== expenseId,
      );
      saveState(currentState);
      render(currentState);
    });
    return;
  }
  if (button.matches("[data-remove-group]")) {
    const group = button.dataset.removeGroup;
    const categoryId = button.closest("[data-category-id]")?.dataset.categoryId;
    confirmDeletion(`Delete The ${group} Group And Its Items?`, () => {
      currentState.expenses = currentState.expenses.filter(
        (item) =>
          item.categoryId !== categoryId ||
          !budget.isGroupOrDescendant(item.group, group),
      );
      saveState(currentState);
      render(currentState);
    });
    return;
  }
  if (button.matches("[data-add-group-item]")) {
    const expenseId = addDraftExpense(
      currentState,
      button.closest("[data-category-id]")?.dataset.categoryId || "",
      button.dataset.addGroupItem,
    );
    elementToScrollTo = `[data-expense-id="${expenseId}"]`;
    saveState(currentState);
    render(currentState);
    return;
  }
  if (button.matches("[data-rename-group]")) {
    const group = button.dataset.renameGroup;
    const categoryId = button.closest("[data-category-id]")?.dataset.categoryId;
    const header = button.closest(".item-group-header");
    if (!header || !categoryId) return;
    const form = document.createElement("form");
    form.className = "group-rename-form";
    form.dataset.renameGroup = group;
    const label = document.createElement("label");
    label.className = "input-label";
    label.textContent = "Group Name";
    const input = document.createElement("input");
    input.name = "groupName";
    input.value = budget.splitGroupPath(group).at(-1) || group;
    input.defaultValue = input.value;
    input.required = true;
    label.append(input);
    const actions = document.createElement("div");
    actions.className = "actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Save";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = "Cancel";
    actions.append(save, cancel);
    form.append(label, actions);
    form.addEventListener("submit", (submitEvent) => {
      submitEvent.preventDefault();
      const nextName = input.value.trim();
      if (!nextName) return;
      const parentPath = group.includes(GROUP_PATH_SEPARATOR)
        ? `${group.slice(0, group.lastIndexOf(GROUP_PATH_SEPARATOR))}${GROUP_PATH_SEPARATOR}`
        : "";
      const nextGroup = `${parentPath}${nextName}`;
      currentState.expenses.forEach((expense) => {
        if (
          expense.categoryId === categoryId &&
          budget.isGroupOrDescendant(expense.group, group)
        )
          expense.group = `${nextGroup}${expense.group.slice(group.length)}`;
      });
      const oldKey = `${categoryId}:${group}`;
      const newKey = `${categoryId}:${nextGroup}`;
      Object.keys(currentState.app.collapsedGroups || {}).forEach((key) => {
        if (!key.startsWith(oldKey)) return;
        currentState.app.collapsedGroups[
          `${newKey}${key.slice(oldKey.length)}`
        ] = currentState.app.collapsedGroups[key];
        delete currentState.app.collapsedGroups[key];
      });
      saveState(currentState);
      render(currentState);
    });
    cancel.addEventListener("click", () => render(currentState));
    header.replaceWith(form);
    updateDragAvailability();
    input.focus();
    return;
  }
  if (button.matches("[data-download-save]"))
    return downloadSaveFile(currentState);
  if (button.matches("[data-toggle-income]")) {
    currentState.app.isIncomeOpen = currentState.app.isIncomeOpen === false;
    button.closest("section").querySelector(".collapsible-body").hidden =
      !currentState.app.isIncomeOpen;
    button.textContent = `${platform.isMobile ? "Tap" : "Click"} To ${currentState.app.isIncomeOpen ? "Collapse" : "Expand"}`;
    button.setAttribute("aria-expanded", String(currentState.app.isIncomeOpen));
    saveState(currentState);
    window.budgetMobile?.checkpoint();
    return;
  } else if (button.matches("[data-add-income]")) {
    const income = {
      id: id(),
      name: "",
      amount: 0,
      frequency: "biweekly",
      notes: "",
    };
    currentState.incomes.push(income);
    currentState.app.editingIncomeId = income.id;
    currentState.app.draftIncomeId = income.id;
    elementToScrollTo = `[data-edit-income-form="${income.id}"]`;
  } else if (button.matches("[data-show-category-form]")) {
    const category = {
      id: id(),
      name: "",
      percentage: 0,
      isSavings: false,
      color:
        budget.CATEGORY_COLORS[
          currentState.categories.length % budget.CATEGORY_COLORS.length
        ],
      sortOrder: currentState.categories.length + 1,
    };
    currentState.categories.push(category);
    currentState.app.isAddingCategory = false;
    currentState.app.editingCategoryId = category.id;
    currentState.app.draftCategoryId = category.id;
    categoryToFocus = category.id;
  } else if (button.matches("[data-cancel-category]"))
    currentState.app.isAddingCategory = false;
  else if (button.matches("[data-edit-category]"))
    currentState.app.editingCategoryId = button.dataset.editCategory;
  else if (button.matches("[data-cancel-edit-category]")) {
    if (currentState.app.draftCategoryId === currentState.app.editingCategoryId)
      currentState.categories = currentState.categories.filter(
        (category) => category.id !== currentState.app.draftCategoryId,
      );
    currentState.app.editingCategoryId = "";
    currentState.app.draftCategoryId = "";
  } else if (button.matches("[data-edit-income]")) {
    currentState.app.editingIncomeId = button.dataset.editIncome;
    document.querySelectorAll("[data-edit-income-form]").forEach((form) => {
      form.hidden =
        form.dataset.editIncomeForm !== currentState.app.editingIncomeId;
      if (!form.hidden) form.elements.name.focus();
    });
    updateDragAvailability();
    saveState(currentState);
    window.budgetMobile?.checkpoint();
    return;
  } else if (button.matches("[data-cancel-edit-income]")) {
    if (currentState.app.draftIncomeId === currentState.app.editingIncomeId)
      currentState.incomes = currentState.incomes.filter(
        (income) => income.id !== currentState.app.draftIncomeId,
      );
    currentState.app.editingIncomeId = "";
    currentState.app.draftIncomeId = "";
  } else if (button.matches("[data-show-expense-form]")) {
    const expenseId = addDraftExpense(
      currentState,
      button.dataset.showExpenseForm,
    );
    elementToScrollTo = `[data-expense-id="${expenseId}"]`;
  } else if (button.matches("[data-cancel-expense]")) {
    currentState.app.addingExpenseCategoryId = "";
    currentState.app.addingExpenseGroup = "";
  } else if (button.matches("[data-edit-expense]"))
    currentState.app.editingExpenseId = button.dataset.editExpense;
  else if (button.matches("[data-cancel-edit-expense]"))
    currentState.app.editingExpenseId = "";
  else if (button.matches("[data-remove-income]"))
    currentState.incomes = currentState.incomes.filter(
      (item) => item.id !== button.dataset.removeIncome,
    );
  else if (button.matches("[data-remove-category]")) {
    delete currentState.app.collapsedCategories?.[button.dataset.removeCategory];
    currentState.categories = currentState.categories.filter(
      (item) => item.id !== button.dataset.removeCategory,
    );
    currentState.expenses = currentState.expenses.filter(
      (item) => item.categoryId !== button.dataset.removeCategory,
    );
  } else if (button.matches("[data-remove-expense]"))
    currentState.expenses = currentState.expenses.filter(
      (item) => item.id !== button.dataset.removeExpense,
    );
  else return;
  saveState(currentState);
  render(currentState);
});

const clearDropTargets = () => {
  document
    .querySelectorAll(
      ".drop-target, .ungroup-drop-target, .item-drop-target, .item-swap-target, .item-combine-target, .group-drop-target, .group-combine-target, .item-group-combine-target, .item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-drop-before, .category-drop-after, .category-swap-target, .category-transfer-target",
    )
    .forEach((item) =>
      item.classList.remove(
        "drop-target",
        "ungroup-drop-target",
        "item-drop-target",
        "item-swap-target",
        "item-combine-target",
        "group-drop-target",
        "group-combine-target",
        "item-group-combine-target",
        "item-drop-before",
        "item-drop-after",
        "group-drop-before",
        "group-drop-after",
        "category-drop-before",
        "category-drop-after",
        "category-swap-target",
        "category-transfer-target",
      ),
    );
  document
    .querySelectorAll(".ungroup-drop-zone")
    .forEach((item) => item.remove());
};

app?.addEventListener("dragstart", (event) => {
  if (hasOpenBudgetEditor()) {
    event.preventDefault();
    return;
  }
  const expenseItem = event.target.closest("[data-expense-id]");
  const group = event.target.closest("[data-group-name]");
  const category = event.target.closest("[data-category-id]");
  const target = expenseItem || group || category;
  if (!target) return;
  draggedType = expenseItem ? "expense" : group ? "group" : "category";
  draggedCategoryId = target.dataset.categoryId || "";
  draggedExpenseId = target.dataset.expenseId || "";
  draggedGroupName = group?.dataset.groupName || "";
  draggedGroupCategoryId =
    group?.closest("[data-category-id]")?.dataset.categoryId || "";
  const source = currentState.expenses.find(
    (expense) => expense.id === draggedExpenseId,
  );
  if (source?.group) {
    const list = target
      .closest("[data-category-id]")
      ?.querySelector(".expense-list");
    if (list) {
      const zone = document.createElement("div");
      zone.className = "ungroup-drop-zone";
      zone.textContent = "Drop Here To Move Out Of Group";
      list.append(zone);
    }
  }
  event.dataTransfer.setData(
    "text/plain",
    `${draggedType}:${target.dataset.categoryId || target.dataset.expenseId || draggedGroupName}`,
  );
});

function getCategoryGapTarget(hit, x, y) {
  if (!hit?.matches(".board")) return null;
  const categories = [...hit.querySelectorAll(":scope > .category-column")];
  const gap = budget.getCategoryGapDestination(
    categories.map((category) => category.getBoundingClientRect()),
    x,
    y,
  );
  return gap ? { ...gap, node: categories[gap.index] } : null;
}

function getEntryGapTarget(hit, y) {
  if (!hit?.matches(".expense-list, .item-group-items")) return null;
  const entries = [...hit.children].filter((entry) =>
    entry.matches(".expense-item, .item-group"),
  );
  const index = budget.getEntryGapIndex(
    entries.map((entry) => entry.getBoundingClientRect()),
    y,
  );
  return entries[index] || null;
}

app?.addEventListener("dragover", (event) => {
  const gapTarget =
    draggedType !== "category"
      ? getEntryGapTarget(event.target, event.clientY)
      : null;
  const categoryGap =
    draggedType === "category"
      ? getCategoryGapTarget(event.target, event.clientX, event.clientY)
      : null;
  const category = categoryGap?.node || event.target.closest("[data-category-id]");
  const item = gapTarget
    ? gapTarget.matches(".expense-item")
      ? gapTarget
      : null
    : event.target.closest("[data-expense-id]");
  const group = gapTarget
    ? gapTarget.matches(".item-group")
      ? gapTarget
      : null
    : event.target.closest("[data-group-name]");
  if (
    draggedType === "category" &&
    category &&
    category.dataset.categoryId !== draggedCategoryId
  ) {
    event.preventDefault();
    const rect = category.getBoundingClientRect();
    const axis =
      categoryGap?.axis ||
      (category.closest(".board").dataset.categoriesPerRow === "1"
        ? "vertical"
        : "horizontal");
    const position =
      axis === "vertical"
        ? (event.clientY - rect.top) / rect.height
        : (event.clientX - rect.left) / rect.width;
    categoryDropMode =
      categoryGap?.placement || budget.getEntryDropPlacement(position, "swap");
    category.dataset.categoryDropAxis = axis;
    document
      .querySelectorAll(
        ".category-drop-before, .category-drop-after, .category-swap-target",
      )
      .forEach((target) =>
        target.classList.remove(
          "category-drop-before",
          "category-drop-after",
          "category-swap-target",
        ),
      );
    category.classList.add(
      categoryDropMode === "swap"
        ? "category-swap-target"
        : `category-drop-${categoryDropMode}`,
    );
    return;
  }
  if (
    draggedType === "group" &&
    category &&
    category.dataset.categoryId !== draggedGroupCategoryId
  ) {
    event.preventDefault();
    crossCategoryDropMode = "";
    const dropTarget = group || item;
    if (dropTarget) {
      const rect = dropTarget.getBoundingClientRect();
      const position = (event.clientY - rect.top) / rect.height;
      crossCategoryDropMode = budget.getEntryDropPlacement(position, "into");
      document
        .querySelectorAll(
          ".item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-transfer-target",
        )
        .forEach((target) =>
          target.classList.remove(
            "item-drop-before",
            "item-drop-after",
            "group-drop-before",
            "group-drop-after",
            "category-transfer-target",
          ),
        );
      if (
        crossCategoryDropMode === "before" ||
        crossCategoryDropMode === "after"
      )
        dropTarget.classList.add(
          group
            ? `item-drop-${crossCategoryDropMode}`
            : `group-drop-${crossCategoryDropMode}`,
        );
      else category.classList.add("category-transfer-target");
    } else {
      document
        .querySelectorAll(".category-transfer-target")
        .forEach((target) =>
          target.classList.remove("category-transfer-target"),
        );
      category.classList.add("category-transfer-target");
    }
    return;
  }
  if (
    draggedType === "group" &&
    ((group && group.dataset.groupName !== draggedGroupName) ||
      (!group && item))
  ) {
    event.preventDefault();
    groupItemDropMode = "";
    document
      .querySelectorAll(
        ".group-drop-target, .group-combine-target, .item-group-combine-target, .item-drop-target, .group-drop-before, .group-drop-after, .item-drop-before, .item-drop-after",
      )
      .forEach((target) =>
        target.classList.remove(
          "group-drop-target",
          "group-combine-target",
          "item-group-combine-target",
          "item-drop-target",
          "group-drop-before",
          "group-drop-after",
          "item-drop-before",
          "item-drop-after",
        ),
      );
    if (group) {
      const position =
        (event.clientY - group.getBoundingClientRect().top) /
        group.getBoundingClientRect().height;
      if (budget.getEntryDropPlacement(position) === "before") {
        groupItemDropMode = "before";
        group.classList.add("item-drop-before");
      } else if (budget.getEntryDropPlacement(position) === "after") {
        groupItemDropMode = "after";
        group.classList.add("item-drop-after");
      } else {
        groupItemDropMode = "combine";
        group.classList.add("group-combine-target");
      }
    } else {
      const rect = item.getBoundingClientRect();
      const position = (event.clientY - rect.top) / rect.height;
      if (budget.getEntryDropPlacement(position) === "before") {
        groupItemDropMode = "before";
        item.classList.add("group-drop-before");
      } else if (budget.getEntryDropPlacement(position) === "after") {
        groupItemDropMode = "after";
        item.classList.add("group-drop-after");
      } else {
        groupItemDropMode = "combine";
        item.classList.add("item-group-combine-target");
      }
    }
    return;
  }
  if (draggedType !== "expense" || (!item && !category)) return;
  event.preventDefault();
  const source = currentState.expenses.find(
    (expense) => expense.id === draggedExpenseId,
  );
  if (source && category && category.dataset.categoryId !== source.categoryId) {
    crossCategoryDropMode = "";
    const dropTarget = group || item;
    if (dropTarget) {
      const rect = dropTarget.getBoundingClientRect();
      const position = (event.clientY - rect.top) / rect.height;
      crossCategoryDropMode = budget.getEntryDropPlacement(position, "into");
      document
        .querySelectorAll(
          ".item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-transfer-target",
        )
        .forEach((target) =>
          target.classList.remove(
            "item-drop-before",
            "item-drop-after",
            "group-drop-before",
            "group-drop-after",
            "category-transfer-target",
          ),
        );
      if (
        crossCategoryDropMode === "before" ||
        crossCategoryDropMode === "after"
      )
        dropTarget.classList.add(
          group
            ? `item-drop-${crossCategoryDropMode}`
            : `group-drop-${crossCategoryDropMode}`,
        );
      else category.classList.add("category-transfer-target");
    } else {
      document
        .querySelectorAll(".category-transfer-target")
        .forEach((target) =>
          target.classList.remove("category-transfer-target"),
        );
      category.classList.add("category-transfer-target");
    }
    return;
  }
  const destination = currentState.expenses.find(
    (expense) => expense.id === item?.dataset.expenseId,
  );
  itemGroupDropMode = "";
  itemDropMode = "";
  withinGroupDropMode = "";
  document
    .querySelectorAll(
      ".item-drop-target, .item-swap-target, .item-combine-target, .group-drop-target, .item-drop-before, .item-drop-after",
    )
    .forEach((target) =>
      target.classList.remove(
        "item-drop-target",
        "item-swap-target",
        "item-combine-target",
        "group-drop-target",
        "item-drop-before",
        "item-drop-after",
      ),
    );
  if (
    source &&
    destination &&
    destination.group &&
    source.categoryId === destination.categoryId &&
    source.id !== destination.id
  ) {
    const rect = item.getBoundingClientRect();
    const position = (event.clientY - rect.top) / rect.height;
    withinGroupDropMode = budget.getEntryDropPlacement(position);
    item.classList.add(
      withinGroupDropMode === "combine"
        ? "item-combine-target"
        : `item-drop-${withinGroupDropMode}`,
    );
  } else if (
    source &&
    group &&
    group.closest("[data-category-id]")?.dataset.categoryId ===
      source.categoryId
  ) {
    const position =
      (event.clientY - group.getBoundingClientRect().top) /
      group.getBoundingClientRect().height;
    if (budget.getEntryDropPlacement(position) === "before") {
      itemGroupDropMode = "before";
      group.classList.add("item-drop-before");
    } else if (budget.getEntryDropPlacement(position) === "after") {
      itemGroupDropMode = "after";
      group.classList.add("item-drop-after");
    } else if (source.group !== group.dataset.groupName) {
      itemGroupDropMode = "into";
      group.classList.add("group-drop-target");
    }
  } else if (
    source &&
    destination &&
    !source.group &&
    !destination.group &&
    source.categoryId === destination.categoryId &&
    source.id !== destination.id
  ) {
    const rect = item.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    itemDropMode =
      x < 0.2 || budget.getEntryDropPlacement(y) === "before"
        ? "before"
        : x > 0.8 || budget.getEntryDropPlacement(y) === "after"
          ? "after"
          : "combine";
    item.classList.add(
      itemDropMode === "combine"
        ? "item-combine-target"
        : `item-drop-${itemDropMode}`,
    );
  } else if (
    source?.group &&
    destination &&
    destination.categoryId === source.categoryId &&
    !destination.group &&
    destination.id !== source.id
  ) {
    const rect = item.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    itemDropMode =
      x < 0.2 || budget.getEntryDropPlacement(y) === "before"
        ? "before"
        : x > 0.8 || budget.getEntryDropPlacement(y) === "after"
          ? "after"
          : "combine";
    item.classList.add(
      itemDropMode === "combine"
        ? "item-combine-target"
        : `item-drop-${itemDropMode}`,
    );
  } else if (
    source?.group &&
    category?.dataset.categoryId === source.categoryId &&
    !event.target.closest(".item-group")
  )
    (
      event.target.closest(".expense-list") ||
      category.querySelector(".expense-list")
    )?.classList.add("ungroup-drop-target");
  else if (item && item.dataset.expenseId !== draggedExpenseId)
    item.classList.add("item-drop-target");
});

app?.addEventListener("dragleave", (event) => {
  const category = event.target.closest("[data-category-id]");
  if (category && !category.contains(event.relatedTarget))
    category.classList.remove("drop-target");
});
app?.addEventListener("dragend", () => {
  draggedType = "";
  draggedExpenseId = "";
  draggedGroupName = "";
  draggedGroupCategoryId = "";
  itemGroupDropMode = "";
  itemDropMode = "";
  withinGroupDropMode = "";
  groupItemDropMode = "";
  crossCategoryDropMode = "";
  categoryDropMode = "";
  draggedCategoryId = "";
  clearDropTargets();
});

app?.addEventListener("drop", (event) => {
  const target =
    (draggedType === "category" &&
      getCategoryGapTarget(event.target, event.clientX, event.clientY)?.node) ||
    (draggedType !== "category" &&
      getEntryGapTarget(event.target, event.clientY)) ||
    event.target.closest(
      "[data-group-name], [data-category-id], [data-expense-id]",
    );
  const sourceGroup = draggedGroupName;
  const sourceGroupCategoryId = draggedGroupCategoryId;
  const groupDropMode = itemGroupDropMode;
  const nextItemDropMode = itemDropMode;
  const nextWithinGroupDropMode = withinGroupDropMode;
  const nextGroupItemDropMode = groupItemDropMode;
  const nextCrossCategoryDropMode = crossCategoryDropMode;
  const nextCategoryDropMode = categoryDropMode;
  clearDropTargets();
  draggedType = "";
  draggedExpenseId = "";
  draggedGroupName = "";
  draggedGroupCategoryId = "";
  itemGroupDropMode = "";
  itemDropMode = "";
  withinGroupDropMode = "";
  groupItemDropMode = "";
  crossCategoryDropMode = "";
  categoryDropMode = "";
  draggedCategoryId = "";
  const value = event.dataTransfer.getData("text/plain");
  if (!target || !value) return;
  event.preventDefault();
  const [type, sourceId] = value.split(":");
  if (
    type === "expense" &&
    nextWithinGroupDropMode &&
    target.dataset.expenseId
  ) {
    const source = currentState.expenses.find((item) => item.id === sourceId);
    const destination = currentState.expenses.find(
      (item) => item.id === target.dataset.expenseId,
    );
    if (
      source &&
      destination &&
      destination.group &&
      source.categoryId === destination.categoryId &&
      budget.moveBudgetEntry(
        currentState,
        { type: "item", categoryId: source.categoryId, id: source.id },
        {
          categoryId: destination.categoryId,
          target: { type: "item", id: destination.id },
          placement: nextWithinGroupDropMode,
        },
      )
    ) {
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
      saveState(currentState);
      render(currentState);
      return;
    }
  }
  if (type === "expense" && nextItemDropMode && target.dataset.expenseId) {
    const source = currentState.expenses.find((item) => item.id === sourceId);
    const destination = currentState.expenses.find(
      (item) => item.id === target.dataset.expenseId,
    );
    if (
      source?.group &&
      destination &&
      !destination.group &&
      source.categoryId === destination.categoryId
    ) {
      if (nextItemDropMode === "before" || nextItemDropMode === "after") {
        source.group = "";
        if (
          !moveItemBesideItem(
            currentState,
            source.categoryId,
            source.id,
            destination.id,
            nextItemDropMode,
          )
        )
          return;
      } else if (nextItemDropMode === "combine") {
        const group = nextGroupName(currentState, source.categoryId);
        source.group = group;
        destination.group = group;
      } else return;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
      saveState(currentState);
      render(currentState);
      return;
    }
  }
  if (
    type === "expense" &&
    (groupDropMode === "before" || groupDropMode === "after")
  ) {
    const source = currentState.expenses.find((item) => item.id === sourceId);
    const destinationGroup =
      target.closest("[data-group-name]")?.dataset.groupName;
    const targetCategoryId =
      target.dataset.categoryId ||
      target.closest("[data-category-id]")?.dataset.categoryId;
    if (source && source.categoryId === targetCategoryId && destinationGroup) {
      if (
        moveItemBesideGroup(
          currentState,
          source.categoryId,
          source.id,
          destinationGroup,
          groupDropMode,
        )
      ) {
        currentState.app.expenseSorts ||= {};
        currentState.app.expenseSorts[source.categoryId] = "manual";
        saveState(currentState);
        render(currentState);
        return;
      }
    }
  }
  if (
    type === "expense" &&
    (nextCrossCategoryDropMode === "before" ||
      nextCrossCategoryDropMode === "after")
  ) {
    const source = currentState.expenses.find((item) => item.id === sourceId);
    const destinationGroup =
      target.closest("[data-group-name]")?.dataset.groupName;
    const targetCategoryId =
      target.dataset.categoryId ||
      target.closest("[data-category-id]")?.dataset.categoryId;
    const destination = currentState.expenses.find(
      (item) => item.id === target.dataset.expenseId,
    );
    if (source && targetCategoryId && source.categoryId !== targetCategoryId) {
      const sourceCategoryId = source.categoryId;
      source.categoryId = targetCategoryId;
      source.group = "";
      const moved = destinationGroup
        ? moveItemBesideGroup(
            currentState,
            targetCategoryId,
            source.id,
            destinationGroup,
            nextCrossCategoryDropMode,
          )
        : destination
          ? moveItemBesideItem(
              currentState,
              targetCategoryId,
              source.id,
              destination.id,
              nextCrossCategoryDropMode,
            )
          : false;
      if (moved) {
        currentState.app.expenseSorts ||= {};
        currentState.app.expenseSorts[sourceCategoryId] = "manual";
        currentState.app.expenseSorts[targetCategoryId] = "manual";
        saveState(currentState);
        render(currentState);
        return;
      }
    }
  }
  if (
    type === "group" &&
    (nextCrossCategoryDropMode === "before" ||
      nextCrossCategoryDropMode === "after")
  ) {
    const destinationGroup = target.closest("[data-group-name]");
    const targetCategoryId = (destinationGroup || target).closest(
      "[data-category-id]",
    )?.dataset.categoryId;
    const destination = currentState.expenses.find(
      (item) => item.id === target.dataset.expenseId,
    );
    if (targetCategoryId && targetCategoryId !== sourceGroupCategoryId) {
      if (
        !budget.moveGroupToCategory(
          currentState,
          sourceGroupCategoryId,
          sourceGroup,
          targetCategoryId,
        )
      )
        return;
      const moved = destinationGroup
        ? moveGroupBesideGroup(
            currentState,
            targetCategoryId,
            sourceGroup,
            destinationGroup.dataset.groupName,
            nextCrossCategoryDropMode,
          )
        : destination
          ? moveGroupBesideItem(
              currentState,
              targetCategoryId,
              sourceGroup,
              destination.id,
              nextCrossCategoryDropMode,
            )
          : false;
      if (moved) {
        currentState.app.expenseSorts ||= {};
        currentState.app.expenseSorts[sourceGroupCategoryId] = "manual";
        currentState.app.expenseSorts[targetCategoryId] = "manual";
        saveState(currentState);
        render(currentState);
        return;
      }
    }
  }
  if (type === "category" && target.dataset.categoryId !== sourceId) {
    if (nextCategoryDropMode === "swap") {
      const source = currentState.categories.find(
        (item) => item.id === sourceId,
      );
      const destination = currentState.categories.find(
        (item) => item.id === target.dataset.categoryId,
      );
      if (!source || !destination) return;
      const order = source.sortOrder;
      source.sortOrder = destination.sortOrder;
      destination.sortOrder = order;
    } else if (
      !moveCategory(
        currentState,
        sourceId,
        target.dataset.categoryId,
        nextCategoryDropMode || "after",
      )
    )
      return;
  } else if (type === "group") {
    const destinationGroup = target.closest("[data-group-name]");
    const categoryId = (destinationGroup || target).closest(
      "[data-category-id]",
    )?.dataset.categoryId;
    if (!categoryId) return;
    if (categoryId !== sourceGroupCategoryId) {
      const movedIntoGroup =
        destinationGroup &&
        nextCrossCategoryDropMode !== "before" &&
        nextCrossCategoryDropMode !== "after" &&
        budget.moveGroupIntoGroup(
          currentState,
          sourceGroupCategoryId,
          sourceGroup,
          categoryId,
          destinationGroup.dataset.groupName,
        );
      let sortOrder = Math.max(
        0,
        ...currentState.expenses
          .filter((item) => item.categoryId === categoryId)
          .map((item) => item.sortOrder || 0),
      );
      if (!movedIntoGroup) {
        if (
          !budget.moveGroupToCategory(
            currentState,
            sourceGroupCategoryId,
            sourceGroup,
            categoryId,
          )
        )
          return;
        currentState.expenses
          .filter(
            (item) =>
              item.categoryId === categoryId &&
              budget.isGroupOrDescendant(item.group, sourceGroup),
          )
          .forEach((item) => {
            item.sortOrder = ++sortOrder;
          });
      }
      if (
        nextCrossCategoryDropMode === "before" ||
        nextCrossCategoryDropMode === "after"
      ) {
        const moved = destinationGroup
          ? moveGroupBesideGroup(
              currentState,
              categoryId,
              sourceGroup,
              destinationGroup.dataset.groupName,
              nextCrossCategoryDropMode,
            )
          : target.dataset.expenseId
            ? moveGroupBesideItem(
                currentState,
                categoryId,
                sourceGroup,
                target.dataset.expenseId,
                nextCrossCategoryDropMode,
              )
            : false;
        if (!moved) return;
      }
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[sourceGroupCategoryId] = "manual";
      currentState.app.expenseSorts[categoryId] = "manual";
    } else if (destinationGroup) {
      if (
        nextGroupItemDropMode === "before" ||
        nextGroupItemDropMode === "after"
      ) {
        if (
          !moveGroupBesideGroup(
            currentState,
            categoryId,
            sourceGroup,
            destinationGroup.dataset.groupName,
            nextGroupItemDropMode,
          )
        )
          return;
      } else if (
        !budget.moveGroupIntoGroup(
          currentState,
          sourceGroupCategoryId,
          sourceGroup,
          categoryId,
          destinationGroup.dataset.groupName,
        )
      )
        return;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[categoryId] = "manual";
    } else if (target.dataset.expenseId) {
      if (
        nextGroupItemDropMode === "before" ||
        nextGroupItemDropMode === "after"
      ) {
        if (
          !moveGroupBesideItem(
            currentState,
            categoryId,
            sourceGroup,
            target.dataset.expenseId,
            nextGroupItemDropMode,
          )
        )
          return;
      } else {
        const destination = currentState.expenses.find(
          (item) => item.id === target.dataset.expenseId,
        );
        if (!destination) return;
        destination.group = sourceGroup;
      }
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[categoryId] = "manual";
    } else return;
  } else if (type === "expense") {
    const source = currentState.expenses.find((item) => item.id === sourceId);
    const destination = currentState.expenses.find(
      (item) => item.id === target.dataset.expenseId,
    );
    const destinationGroup =
      target.closest("[data-group-name]")?.dataset.groupName;
    const targetCategoryId =
      target.dataset.categoryId ||
      target.closest("[data-category-id]")?.dataset.categoryId;
    if (!source || target.dataset.expenseId === sourceId || !targetCategoryId)
      return;
    if (
      destinationGroup &&
      (source.categoryId !== targetCategoryId ||
        source.group !== destinationGroup)
    ) {
      const sourceCategoryId = source.categoryId;
      if (
        !budget.moveBudgetEntry(
          currentState,
          { type: "item", categoryId: sourceCategoryId, id: source.id },
          {
            categoryId: targetCategoryId,
            group: destinationGroup,
            placement: "append",
          },
        )
      )
        return;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[sourceCategoryId] = "manual";
      currentState.app.expenseSorts[targetCategoryId] = "manual";
      saveState(currentState);
      render(currentState);
      return;
    }
    if (source.categoryId !== targetCategoryId) {
      const sourceCategoryId = source.categoryId;
      source.categoryId = targetCategoryId;
      source.sortOrder =
        Math.max(
          0,
          ...currentState.expenses
            .filter(
              (item) =>
                item.categoryId === targetCategoryId && item.id !== source.id,
            )
            .map((item) => item.sortOrder || 0),
        ) + 1;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[sourceCategoryId] = "manual";
      currentState.app.expenseSorts[targetCategoryId] = "manual";
    } else if (
      destination &&
      nextItemDropMode === "combine" &&
      !source.group &&
      !destination.group &&
      source.categoryId === destination.categoryId
    ) {
      const group = nextGroupName(currentState, source.categoryId);
      source.group = group;
      destination.group = group;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
    } else if (
      destination &&
      (nextItemDropMode === "before" || nextItemDropMode === "after") &&
      !source.group &&
      !destination.group &&
      source.categoryId === destination.categoryId
    ) {
      if (
        !moveItemBesideItem(
          currentState,
          source.categoryId,
          source.id,
          destination.id,
          nextItemDropMode,
        )
      )
        return;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
    } else if (
      destinationGroup &&
      groupDropMode &&
      groupDropMode !== "into" &&
      !source.group &&
      source.categoryId === targetCategoryId
    ) {
      if (
        !moveItemBesideGroup(
          currentState,
          source.categoryId,
          source.id,
          destinationGroup,
          groupDropMode,
        )
      )
        return;
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
    } else if (destination) {
      const order = source.sortOrder;
      source.sortOrder = destination.sortOrder;
      destination.sortOrder = order;
      if (
        source.categoryId === destination.categoryId &&
        source.group &&
        !destination.group
      )
        source.group = "";
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
      currentState.app.expenseSorts[destination.categoryId] = "manual";
    } else if (
      source.group &&
      source.categoryId === targetCategoryId &&
      !target.closest(".item-group")
    ) {
      source.group = "";
      currentState.app.expenseSorts ||= {};
      currentState.app.expenseSorts[source.categoryId] = "manual";
    } else return;
  } else return;
  saveState(currentState);
  render(currentState);
});

window.addEventListener("budget-document-result", (event) => {
  const result = event.detail;
  if (result.error) window.alert(result.error);
  else if (result.operation === "import") importBudget(result.value);
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave();
});
window.addEventListener("pagehide", flushSave);

document.addEventListener("keydown", (event) => {
  if (!activityHistory || app.inert || draggedType) return;
  const action = window.budgetHistory.shortcut(event);
  if (!action) return;
  event.preventDefault();
  if (!activityHistory[action === "undo" ? "canUndo" : "canRedo"]) return;
  const dirty = [
    ...app.querySelectorAll(
      ".expense-form, .expense-edit-form, .category-edit-form, .group-rename-form, .income-edit-form:not([hidden])",
    ),
  ].some((form) =>
    [...form.elements].some((field) =>
      field.type === "checkbox"
        ? field.checked !== field.defaultChecked
        : field.matches("input,textarea,select") &&
          field.value !==
            (field.tagName === "SELECT"
              ? [...field.options].find((option) => option.defaultSelected)?.value
              : field.defaultValue),
    ),
  );
  if (dirty && !window.confirm("Discard unsaved form changes before undo/redo?"))
    return;
  currentState = activityHistory[action]();
  categoryToFocus = "";
  elementToScrollTo = "";
  saveState(currentState, false);
  render(currentState);
  showSaved(action === "undo" ? "Undone" : "Redone");
});

async function startApp() {
  try {
    const display = await platform.displayCurrency();
    budget.setCurrencyDisplay(display.locale, display.currency);
    currentState = await loadState();
    currentState.app.editingIncomeId = "";
    if (!platform.isMobile)
      activityHistory = window.budgetHistory.create(currentState);
    render(currentState);
    await window.budgetMobile?.restore();
  } catch (error) {
    const card = document.createElement("section");
    card.className = "card recovery-card";
    const heading = document.createElement("h1");
    heading.textContent = "Budget Recovery";
    const message = document.createElement("p");
    message.textContent = `Your saved budget could not be loaded and has not been overwritten. ${error.message}`;
    const retry = document.createElement("button");
    retry.textContent = "Retry Loading";
    retry.onclick = () => {
      app.replaceChildren();
      startApp();
    };
    const recover = document.createElement(
      platform.isAndroid ? "button" : "input",
    );
    if (platform.isAndroid) {
      recover.textContent = "Import Backup";
      recover.onclick = async () => {
        try {
          await importBudget(await platform.importFile());
        } catch (error) {
          window.alert(error.message);
        }
      };
    } else {
      recover.type = "file";
      recover.accept = "application/json,.json";
      recover.setAttribute("aria-label", "Import Backup");
      recover.onchange = async () => {
        if (recover.files[0]) await importBudget(await recover.files[0].text());
      };
    }
    card.append(heading, message, retry, recover);
    app.replaceChildren(card);
  }
  await platform.ready();
  window.budgetReady = true;
}

startApp();
