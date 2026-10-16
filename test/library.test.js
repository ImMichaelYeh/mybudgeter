const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = (name) =>
  fs.readFileSync(path.join(__dirname, "../src", name), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function setup() {
  const context = { window: {} };
  for (const name of ["budget.js", "library.js", "history.js"])
    vm.runInNewContext(source(name), context);
  return {
    context,
    library: context.window.budgetLibrary,
    budget: context.window.budget,
  };
}

test("templates create exact targets, savings flags and independent empty budgets", () => {
  const { library } = setup();
  for (const template of library.templates) {
    const state = library.templateState(template.id);
    assert.deepEqual(
      plain(state.categories.map((entry) => [entry.name, entry.percentage])),
      plain(template.categories),
    );
    assert.deepEqual(
      plain(state.categories.map((entry) => entry.isSavings)),
      plain(template.categories.map(([name]) => name === "Savings")),
    );
    assert.equal(state.incomes.length + state.expenses.length, 0);
    assert.equal(state.notes, "");
    assert.equal(
      state.categories.reduce((sum, entry) => sum + entry.percentage, 0),
      template.id === "blank" ? 0 : 100,
    );
  }
  assert.equal(library.templateState().categories[0].percentage, 50);
  assert.throws(() => library.templateState("missing"), /Unknown/);
  const first = library.templateState();
  first.categories[0].name = "Changed";
  assert.equal(library.templateState().categories[0].name, "Needs");
});

test("legacy migration preserves budget content and validates every library entry", () => {
  const { library, budget } = setup();
  const state = budget.createEmptyState();
  state.notes = "Preserve me";
  state.app.collapsedCategories["default-needs"] = true;
  const migrated = library.normalize(state, () => "legacy-budget");
  assert.equal(migrated.activeBudgetId, "legacy-budget");
  assert.equal(migrated.budgets[0].name, "My Budget");
  assert.equal(migrated.budgets[0].data.notes, state.notes);
  assert.equal(
    migrated.budgets[0].data.app.collapsedCategories["default-needs"],
    true,
  );
  assert.deepEqual(plain(library.normalize(migrated)), plain(migrated));
  for (const change of [
    (value) => {
      value.activeBudgetId = "unknown";
    },
    (value) => {
      value.budgets.push(value.budgets[0]);
    },
    (value) => {
      value.budgets[0].id = "../bad";
    },
    (value) => {
      value.budgets[0].name = " ";
    },
    (value) => {
      value.budgets[0].data.expenses = {};
    },
    (value) => {
      value.budgets[0].recoveryId = "../bad";
    },
  ]) {
    const malformed = plain(migrated);
    change(malformed);
    assert.throws(() => library.normalize(malformed));
  }
  assert.throws(
    () =>
      library.normalize({
        schema: library.schema,
        activeBudgetId: "missing",
        budgets: [],
      }),
    /active/,
  );
  assert.throws(() => library.normalize({ schema: "unknown" }), /Unsupported/);
});

test("names are trimmed, bounded and unique; suggested names remain valid", () => {
  const { library } = setup();
  const collection = library.add(
    library.normalize(null),
    " My Budget ",
    library.templateState(),
    "one",
  );
  assert.equal(collection.budgets[0].name, "My Budget");
  assert.throws(
    () => library.validateName(collection, "my budget"),
    /already exists/,
  );
  assert.equal(
    library.validateName(collection, "my budget", "one"),
    "my budget",
  );
  for (const name of ["", " ", null, "a".repeat(101)])
    assert.throws(() => library.validateName(collection, name));
  assert.equal(library.suggestName(collection), "My Budget 2");
  const long = library.add(
    collection,
    "a".repeat(100),
    library.templateState(),
    "two",
  );
  assert.equal(library.suggestName(long, "a".repeat(100)).length, 100);
});

test("duplication isolates committed data and deletion chooses the first surviving budget", () => {
  const { library, budget } = setup();
  const state = library.templateState();
  state.notes = "Original";
  state.incomes.push({
    id: "draft",
    name: "Unfinished",
    amount: 0,
    frequency: "monthly",
  });
  state.app.draftIncomeId = "draft";
  state.app.editingIncomeId = "draft";
  let collection = library.add(library.normalize(null), "First", state, "one");
  collection = library.add(
    collection,
    "First Copy",
    library.committedState(state),
    "two",
  );
  assert.equal(collection.budgets[1].data.incomes.length, 0);
  assert.equal(collection.budgets[1].data.app.editingIncomeId, "");
  collection.budgets[1].data.categories[0].name = "Changed";
  assert.equal(collection.budgets[0].data.categories[0].name, "Needs");
  assert.equal(library.remove(collection, "one").activeBudgetId, "two");
  collection = library.remove(collection, "two");
  assert.equal(collection.activeBudgetId, "one");
  collection = library.remove(collection, "one");
  assert.equal(collection.activeBudgetId, "");
  assert.equal(collection.budgets.length, 0);
  const payload = budget.createSavePayload(state);
  assert.equal(payload.schema, "MyBudgeter-budget-v1");
  for (const key of ["budgets", "activeBudgetId", "recoveryId", "budgetId"])
    assert.equal(Object.hasOwn(payload, key), false);
});

function controller() {
  const { context, library, budget } = setup();
  const writes = [];
  const alerts = [];
  let failSave = false;
  let failRecovery = false;
  const first = library.add(
    library.normalize(null),
    "First",
    library.templateState(),
    "one",
  );
  Object.assign(context, {
    budget,
    budgetCollection: library.add(
      first,
      "Second",
      library.templateState("blank"),
      "two",
    ),
    currentState: null,
    activityHistory: null,
    budgetHistories: new Map(),
    budgetTransition: false,
    saveRevision: 0,
    saveQueue: Promise.resolve(),
    saveError: "",
    saveTimer: null,
    pendingSave: null,
    categoryToFocus: "",
    elementToScrollTo: "",
    id: () => "new-recovery",
    setTimeout: () => 0,
    clearTimeout: () => {},
    app: { inert: false, setAttribute() {}, removeAttribute() {} },
    render() {},
    showStorageError() {},
    document: { querySelector: () => null },
    platform: {
      isMobile: false,
      isAndroid: false,
      save: async (value) => {
        if (failSave) throw new Error("Disk full");
        writes.push(JSON.parse(value));
      },
    },
  });
  context.window.confirm = () => true;
  context.window.alert = (message) => alerts.push(message);
  context.window.budgetMobile = {
    checkpoint: async () => {
      if (failRecovery) throw new Error("Draft write failed");
    },
    clearRecovery: async () => {},
    restore: async () => {},
  };
  const main = source("main.js");
  vm.runInNewContext(
    main.slice(
      main.indexOf("function activeBudget()"),
      main.indexOf("function applyCategoryColor("),
    ) +
      main.slice(
        main.indexOf("function saveState("),
        main.indexOf("function showStorageError("),
      ) +
      main.slice(
        main.indexOf("async function importBudget("),
        main.indexOf("function render("),
      ),
    context,
  );
  context.selectBudgetState();
  return {
    context,
    writes,
    alerts,
    failSave: (value) => {
      failSave = value;
    },
    failRecovery: (value) => {
      failRecovery = value;
    },
  };
}

test("switches flush pending content to its original budget and isolate desktop history", async () => {
  const { context, writes } = controller();
  context.currentState.notes = "Second changed";
  context.saveState(context.currentState);
  const secondHistory = context.activityHistory;
  assert.equal(
    await context.changeBudgetLibrary((next) => {
      next.activeBudgetId = "one";
      return next;
    }),
    true,
  );
  assert.equal(writes[0].budgets[1].data.notes, "Second changed");
  assert.equal(context.currentState.notes, "");
  assert.equal(context.activityHistory.canUndo, false);
  context.currentState.notes = "First changed";
  context.saveState(context.currentState);
  await context.changeBudgetLibrary((next) => {
    next.activeBudgetId = "two";
    return next;
  });
  assert.equal(context.currentState.notes, "Second changed");
  assert.equal(context.activityHistory, secondHistory);
  assert.equal(context.activityHistory.undo().notes, "");
  assert.equal(context.budgetCollection.budgets[0].data.notes, "First changed");
});

test("failed save or draft capture prevents switching and remains retryable", async () => {
  const { context, failSave, failRecovery } = controller();
  const switchToFirst = (next) => {
    next.activeBudgetId = "one";
    return next;
  };
  failRecovery(true);
  assert.equal(await context.changeBudgetLibrary(switchToFirst), false);
  assert.equal(context.budgetCollection.activeBudgetId, "two");
  failRecovery(false);
  context.currentState.notes = "Keep working copy";
  context.saveState(context.currentState);
  failSave(true);
  assert.equal(await context.changeBudgetLibrary(switchToFirst), false);
  assert.equal(context.currentState.notes, "Keep working copy");
  assert.ok(context.pendingSave);
  failSave(false);
  assert.equal(await context.changeBudgetLibrary(switchToFirst), true);
  assert.equal(
    context.budgetCollection.budgets[1].data.notes,
    "Keep working copy",
  );
  assert.equal(context.app.inert, false);
});

test("imports replace only the originating active budget and rotate draft recovery identity", async () => {
  const { context, alerts, failSave } = controller();
  const replacement = context.budget.createEmptyState();
  replacement.notes = "Imported";
  const payload = JSON.stringify(replacement);
  await context.importBudget(payload, "one");
  assert.match(alerts.at(-1), /selected budget changed/);
  assert.equal(context.currentState.notes, "");
  failSave(true);
  await context.importBudget(payload, "two");
  assert.equal(context.currentState.notes, "");
  failSave(false);
  await context.importBudget(payload, "two");
  assert.equal(context.currentState.notes, "Imported");
  assert.equal(context.activeBudget().name, "Second");
  assert.equal(context.activeBudget().recoveryId, "new-recovery");
  assert.equal(context.budgetCollection.budgets[0].data.notes, "");
});

test("failed migration preserves legacy storage and retries without creating a default budget", async () => {
  const { context, budget, library } = setup();
  const legacy = budget.createEmptyState();
  legacy.notes = "Existing budget";
  let stored = JSON.stringify(legacy);
  let failed = true;
  Object.assign(context, {
    budget,
    crypto: { randomUUID: () => "migrated-budget" },
    platform: {
      load: async () => stored,
      save: async (value) => {
        if (failed) throw new Error("Quota exceeded");
        stored = value;
      },
    },
    selectBudgetState: () => {
      context.currentState = context.budgetCollection.budgets[0].data;
    },
  });
  const main = source("main.js");
  vm.runInNewContext(
    main.slice(
      main.indexOf("async function loadState()"),
      main.indexOf("function saveState("),
    ),
    context,
  );
  await assert.rejects(context.loadState(), /Quota exceeded/);
  assert.equal(JSON.parse(stored).schema, budget.SAVE_FILE_SCHEMA);
  assert.equal(JSON.parse(stored).notes, "Existing budget");
  failed = false;
  const recovered = await context.loadState();
  assert.equal(recovered.notes, "Existing budget");
  assert.equal(JSON.parse(stored).schema, library.schema);
  assert.equal(JSON.parse(stored).budgets.length, 1);
  for (const invalid of ["null", "", "[]", "{}"]) {
    stored = invalid;
    await assert.rejects(context.loadState());
    assert.equal(stored, invalid);
  }
});
