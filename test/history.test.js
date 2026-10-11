const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setup() {
  const context = { window: {} };
  for (const file of ["budget.js", "history.js"])
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src", file), "utf8"), context);
  const budget = context.window.budget;
  const state = budget.createEmptyState();
  const history = context.window.budgetHistory.create(state);
  return { context, budget, state, history };
}

test("history retains long undo/redo chains, isolates snapshots, and branches after undo", () => {
  const { state, history } = setup();
  assert.equal(history.undo(), null);
  assert.equal(history.redo(), null);
  for (let index = 1; index <= 1200; index++) {
    state.notes = String(index);
    history.record(state);
  }
  for (let index = 1199; index >= 0; index--)
    assert.equal(history.undo().notes, index ? String(index) : "");
  assert.equal(history.canUndo, false);
  for (let index = 1; index <= 1200; index++)
    assert.equal(history.redo().notes, String(index));
  assert.equal(history.canRedo, false);
  const restored = history.undo();
  restored.notes = "branch";
  history.record(restored);
  restored.notes = "outside mutation";
  assert.equal(history.canRedo, false);
  assert.equal(history.undo().notes, "1199");
  assert.equal(history.redo().notes, "branch");
});

test("no-op saves and editor identities do not consume steps or clear redo", () => {
  const { state, history } = setup();
  state.notes = "saved";
  history.record(state);
  const restored = history.undo();
  restored.exportedAt = "different timestamp";
  restored.app.editingCategoryId = restored.categories[0].id;
  restored.app.editingExpenseId = "item";
  restored.app.categoryMessage = "validation message";
  history.record(restored);
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);
  assert.equal(history.redo().app.editingCategoryId, "");
});

test("uncommitted new income/category drafts are excluded until saved", () => {
  const { state, history } = setup();
  state.incomes.push({ id: "draft-income", name: "", amount: 0 });
  state.app.draftIncomeId = "draft-income";
  state.categories.push({ id: "draft-category", name: "", percentage: 0 });
  state.app.draftCategoryId = "draft-category";
  history.record(state);
  assert.equal(history.canUndo, false);
  state.incomes[0].name = "Salary";
  state.incomes[0].amount = 100;
  state.app.draftIncomeId = "";
  history.record(state);
  assert.equal(history.undo().incomes.length, 0);
  assert.equal(history.redo().incomes[0].amount, 100);
});

test("moves, subtree deletion, preferences, and imported replacements restore exact values", () => {
  const { budget, state } = setup();
  const categoryId = state.categories[0].id;
  state.incomes = [{ id: "salary", name: "Salary", amount: 4321.23, frequency: "biweekly", notes: "Net" }];
  state.expenses = [
    { id: "zero", name: "Zero", amount: 0, multiplier: 1, frequency: "monthly", categoryId, group: "Parent", sortOrder: 1 },
    { id: "fraction", name: "Fraction", amount: 123.45, multiplier: 0.5, frequency: "annually", categoryId, group: "Parent / Child", sortOrder: 2 },
  ];
  state.app.collapsedGroups[`${categoryId}:Parent / Child`] = true;
  const history = setup().context.window.budgetHistory.create(state);
  const original = JSON.stringify(state.expenses);
  assert.equal(budget.moveBudgetEntry(state,
    { type: "group", categoryId, group: "Parent" },
    { categoryId: state.categories[1].id, placement: "append" }), true);
  state.categories[0].color = "#123456";
  state.app.boardPeriod = "weekly";
  state.app.isBudgetBoardOpen = false;
  state.notes = "Line one\nLine two";
  history.record(state);
  state.expenses = [];
  history.record(state);
  assert.equal(history.undo().expenses.length, 2);
  const restored = history.undo();
  assert.equal(JSON.stringify(restored.expenses), original);
  assert.equal(restored.app.collapsedGroups[`${categoryId}:Parent / Child`], true);
  const moved = history.redo();
  assert.equal(moved.expenses[1].multiplier, 0.5);
  assert.equal(moved.categories[0].color, "#123456");
  assert.equal(moved.app.boardPeriod, "weekly");
  assert.equal(moved.app.isBudgetBoardOpen, false);
  const imported = budget.normalizeSaveState(budget.createSavePayload(budget.createEmptyState()));
  history.record(imported);
  assert.equal(history.undo().notes, "Line one\nLine two");
  assert.equal(history.redo().expenses.length, 0);
});

test("shortcuts support Ctrl/Command and preserve native text editing and dialogs", () => {
  const shortcut = setup().context.window.budgetHistory.shortcut;
  const event = { key: "z", ctrlKey: true, target: { closest: () => null } };
  assert.equal(shortcut(event), "undo");
  assert.equal(shortcut({ ...event, shiftKey: true }), "redo");
  assert.equal(shortcut({ ...event, key: "Y" }), "redo");
  assert.equal(shortcut({ ...event, ctrlKey: false, metaKey: true }), "undo");
  for (const override of [
    { altKey: true }, { ctrlKey: false }, { defaultPrevented: true },
    { key: "a" }, { key: "y", shiftKey: true },
    { target: { closest: () => ({}) } },
  ]) assert.equal(shortcut({ ...event, ...override }), "");
  assert.equal(shortcut({ ...event, target: {} }), "undo");
});

test("app undo autosaves, failed saves remain retryable, and only successful imports enter history", async () => {
  const { context, budget, state, history } = setup();
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const writes = [];
  let failed = false;
  let confirmed = true;
  let keydown;
  Object.assign(context, {
    budget, currentState: state, activityHistory: history,
    saveRevision: 0, saveQueue: Promise.resolve(), saveError: "", saveTimer: null,
    pendingSave: null, draggedType: "", categoryToFocus: "", elementToScrollTo: "",
    setTimeout: () => 0, clearTimeout: () => {},
    render: () => {}, showStorageError: () => {},
    app: { inert: false, setAttribute: () => {}, removeAttribute: () => {}, querySelectorAll: () => [] },
    document: {
      querySelector: () => null,
      addEventListener: (_, handler) => { keydown = handler; },
    },
    platform: {
      isMobile: false, isAndroid: false,
      save: async (value) => {
        if (failed) throw Error("Write failed");
        writes.push(JSON.parse(value));
      },
    },
  });
  context.window.confirm = () => confirmed;
  context.window.alert = () => {};
  vm.runInNewContext(
    main.slice(main.indexOf("function saveState("), main.indexOf("function showStorageError(")) +
    main.slice(main.indexOf("async function importBudget("), main.indexOf("function render(")) +
    main.slice(main.indexOf('document.addEventListener("keydown", (event) => {'), main.indexOf("async function startApp()")),
    context,
  );
  state.notes = "Change";
  context.saveState(state);
  await context.flushSave();
  assert.equal(writes.at(-1).notes, "Change");
  failed = true;
  keydown({ key: "z", ctrlKey: true, preventDefault() {} });
  await context.flushSave();
  assert.equal(context.currentState.notes, "");
  assert.ok(context.pendingSave);
  failed = false;
  await context.flushSave();
  assert.equal(writes.at(-1).notes, "");
  assert.equal(context.saveError, "");
  keydown({ key: "y", ctrlKey: true, preventDefault() {} });
  await context.flushSave();
  const imported = budget.createEmptyState();
  imported.notes = "Import";
  const payload = JSON.stringify(budget.createSavePayload(imported));
  confirmed = false;
  await context.importBudget(payload);
  assert.equal(context.currentState.notes, "Change");
  confirmed = true;
  failed = true;
  await context.importBudget(payload);
  assert.equal(context.currentState.notes, "Change");
  failed = false;
  await context.importBudget(payload);
  assert.equal(context.currentState.notes, "Import");
  keydown({ key: "z", ctrlKey: true, preventDefault() {} });
  assert.equal(context.currentState.notes, "Change");
  keydown({ key: "z", ctrlKey: true, preventDefault() {} });
  assert.equal(context.currentState.notes, "");
  keydown({ key: "y", ctrlKey: true, preventDefault() {} });
  keydown({ key: "y", ctrlKey: true, preventDefault() {} });
  await context.flushSave();
  assert.equal(writes.at(-1).notes, "Import");
});
