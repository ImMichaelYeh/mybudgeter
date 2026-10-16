const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function setup(storage = { value: null }) {
  const context = { window: {} };
  const source = (name) =>
    fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
  for (const name of ["budget.js", "library.js"])
    vm.runInNewContext(source(name), context);
  const state = context.window.budget.createEmptyState();
  state.expenses.push({
    id: "rent",
    name: "Rent",
    amount: 100,
    multiplier: 1,
    frequency: "monthly",
    categoryId: "default-needs",
    group: "",
  });
  state.app.editingExpenseId = "rent";
  const field = { name: "name", value: "Rent", checked: false };
  const form = {
    offsetParent: {},
    className: "expense-edit-form",
    dataset: { editExpenseForm: "rent" },
    closest: (selector) =>
      selector === "dialog"
        ? null
        : { dataset: { categoryId: "default-needs" } },
    querySelectorAll: () => [field],
  };
  const first = { id: "one", recoveryId: "one" };
  Object.assign(context, {
    budget: context.window.budget,
    budgetTransition: false,
    currentState: state,
    entry: first,
    sessionTimer: null,
    restoring: false,
    checkpointValue: "",
    sessions: { schema: "MyBudgeter-sessions-v1", budgets: {} },
    sessionsLoaded: false,
    sessionLoad: null,
    sessionQueue: Promise.resolve(),
    checkpointWrite: Promise.resolve(),
    saveError: "",
    clearTimeout() {},
    flushSave: async () => {},
    showStorageError() {},
    activeBudget: () => context.entry,
    render: (value) => {
      context.currentState = value;
    },
    document: { querySelectorAll: () => [form], querySelector: () => null },
    platform: {
      loadSession: async () => storage.value,
      saveSession: async (value) => {
        storage.value = value;
      },
    },
    requestAnimationFrame: (callback) => callback(),
  });
  context.window.scrollY = 123;
  context.window.scrollTo = () => {};
  context.window.alert = () => {};
  const mobile = source("mobile.js");
  vm.runInNewContext(
    mobile.slice(
      mobile.indexOf("  function editorForms("),
      mobile.indexOf("  function handleBack("),
    ),
    context,
  );
  return { context, storage, state, field, form, first };
}

test("drafts persist after reload and do not leak between budgets with identical item IDs", async () => {
  const { context, storage, field, first } = setup();
  await context.restore();
  field.value = "Unfinished rent";
  await context.checkpoint(false, true);
  assert.equal(
    JSON.parse(storage.value).budgets.one.forms[0].fields[0].value,
    "Unfinished rent",
  );
  context.entry = { id: "two", recoveryId: "two" };
  field.value = "Rent";
  await context.restore();
  assert.equal(field.value, "Rent");
  field.value = "Second budget draft";
  await context.checkpoint(false, true);
  context.entry = first;
  await context.restore();
  assert.equal(field.value, "Unfinished rent");
  const restarted = setup(storage);
  await restarted.context.restore();
  assert.equal(restarted.field.value, "Unfinished rent");
  assert.equal(restarted.context.currentState.expenses[0].name, "Rent");
});

test("changed data, preferences and import identity reject stale recovery", async () => {
  const { context, storage, field } = setup();
  await context.restore();
  field.value = "Stale draft";
  await context.checkpoint(false, true);
  for (const change of [
    (next) => {
      next.context.currentState.notes = "Newer committed notes";
    },
    (next) => {
      next.context.currentState.app.boardPeriod = "weekly";
    },
    (next) => {
      next.context.entry.recoveryId = "imported";
    },
  ]) {
    const next = setup(storage);
    change(next);
    await next.context.restore();
    assert.equal(next.field.value, "Rent");
  }
});

test("draft fields inside collapsed groups and sections remain recoverable", async () => {
  const { context, field, form, storage } = setup();
  await context.restore();
  form.offsetParent = null;
  form.matches = () => false;
  field.value = "Collapsed editor draft";
  await context.checkpoint(false, true);
  assert.equal(
    JSON.parse(storage.value).budgets.one.forms[0].fields[0].value,
    "Collapsed editor draft",
  );
});

test("draft write failures reject a critical checkpoint and can be retried", async () => {
  const { context, field, storage } = setup();
  await context.restore();
  field.value = "Keep this draft";
  const save = context.platform.saveSession;
  context.platform.saveSession = async () => {
    throw new Error("Quota exceeded");
  };
  await assert.rejects(context.checkpoint(false, true), /Quota exceeded/);
  assert.match(context.saveError, /Editor recovery/);
  context.platform.saveSession = save;
  await context.checkpoint(false, true);
  assert.equal(context.saveError, "");
  assert.equal(
    JSON.parse(storage.value).budgets.one.forms[0].fields[0].value,
    "Keep this draft",
  );
  await context.clearRecovery("one");
  assert.equal(Object.hasOwn(JSON.parse(storage.value).budgets, "one"), false);
});

test("queued draft writes retain a field reverted while another checkpoint is pending", async () => {
  const { context, field, storage } = setup();
  await context.restore();
  await context.checkpoint(false, true);
  const save = context.platform.saveSession;
  let release;
  context.platform.saveSession = async (value) => {
    await new Promise((resolve) => {
      release = resolve;
    });
    await save(value);
  };
  field.value = "Temporary change";
  const pending = context.checkpoint(false, true);
  await Promise.resolve();
  context.platform.saveSession = save;
  field.value = "Rent";
  const reverted = context.checkpoint(false, true);
  release();
  await Promise.all([pending, reverted]);
  assert.equal(
    JSON.parse(storage.value).budgets.one.forms[0].fields[0].value,
    "Rent",
  );
});

test("unreadable recovery is preserved and a transient load failure can retry without losing working fields", async () => {
  const corrupted = setup({ value: "unreadable recovery" });
  await corrupted.context.restore();
  corrupted.field.value = "Working draft";
  await assert.rejects(corrupted.context.checkpoint(false, true));
  assert.equal(corrupted.storage.value, "unreadable recovery");
  assert.equal(corrupted.field.value, "Working draft");

  const original = setup();
  await original.context.restore();
  original.field.value = "Other budget draft";
  await original.context.checkpoint(false, true);
  const stored = JSON.parse(original.storage.value);
  stored.budgets.two = {
    ...stored.budgets.one,
    budgetId: "two",
    recoveryId: "two",
  };
  original.storage.value = JSON.stringify(stored);
  const retried = setup(original.storage);
  const load = retried.context.platform.loadSession;
  retried.context.platform.loadSession = async () => {
    throw new Error("Temporarily unavailable");
  };
  await retried.context.restore();
  retried.field.value = "Current working draft";
  retried.context.platform.loadSession = load;
  await retried.context.checkpoint(false, true);
  assert.equal(
    JSON.parse(original.storage.value).budgets.one.forms[0].fields[0].value,
    "Current working draft",
  );
  assert.equal(
    JSON.parse(original.storage.value).budgets.two.forms[0].fields[0].value,
    "Other budget draft",
  );
});
