const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadBudget() {
  const context = { window: {} };
  const source = fs.readFileSync(
    path.join(__dirname, "../src/budget.js"),
    "utf8",
  );
  vm.runInNewContext(source, context);
  return context.window.budget;
}

function assertClose(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.000001,
    `${actual} should equal ${expected}`,
  );
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("category collapse preferences round trip, validate, and render accessible controls", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  const categoryId = state.categories[0].id;
  assert.deepEqual(plain(state.app.collapsedCategories), {});
  state.app.collapsedCategories[categoryId] = true;
  const restored = budget.normalizeSaveState(
    JSON.parse(JSON.stringify(budget.createSavePayload(state))),
  );
  assert.equal(restored.app.collapsedCategories[categoryId], true);
  const context = { window: { budget } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/app-template.js"), "utf8"),
    context,
  );
  const html = context.window.renderApp(
    restored,
    budget.getBudgetSummary(restored),
    budget.sortCategories(restored),
    [],
  );
  assert.match(html, /class="category-column category-collapsed"/);
  assert.match(html, /data-toggle-category="default-needs" aria-expanded="false"/);
  for (const invalid of [
    null,
    [],
    true,
    { [categoryId]: "true" },
    { "bad:id": true },
  ]) {
    assert.throws(
      () => budget.normalizeSaveState({
        ...state,
        app: { ...state.app, collapsedCategories: invalid },
      }),
      /Invalid category collapse/,
    );
  }
  delete state.app.collapsedCategories;
  assert.deepEqual(
    plain(budget.normalizeSaveState(state).app.collapsedCategories),
    {},
  );
});

test("open editors disable native card dragging and closing them clears editing mode", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const helpers = main.slice(
    main.indexOf("function hasOpenBudgetEditor()"),
    main.indexOf("function formValues(form)"),
  );
  let editor = null;
  let editing = false;
  const cards = [{ draggable: true }, { draggable: true }];
  const context = {
    document: {
      querySelector: (selector) => {
        assert.match(selector, /group-rename-form/);
        assert.match(selector, /income-edit-form:not\(\[hidden\]\)/);
        assert.doesNotMatch(selector, /notes/);
        return editor;
      },
    },
    app: {
      classList: {
        toggle: (_, value) => {
          editing = value;
        },
      },
      querySelectorAll: () => cards,
    },
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);
  editor = {};
  vm.runInContext("updateDragAvailability()", context);
  assert.equal(editing, true);
  assert.ok(cards.every((card) => !card.draggable));
  editor = null;
  cards.forEach((card) => {
    card.draggable = true;
  });
  vm.runInContext("updateDragAvailability()", context);
  assert.equal(editing, false);
  assert.ok(cards.every((card) => card.draggable));
});

test("item create and edit handlers save zero amounts and reject invalid amounts", () => {
  const budget = loadBudget();
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  const handlers = main.slice(
    main.indexOf('  document.querySelectorAll(".expense-form")'),
    main.indexOf('  document\n    .querySelector("[data-import-save]")'),
  );
  assert.ok(handlers.includes("[data-edit-expense-form]"));
  for (const isSavings of [false, true]) {
    const state = budget.createEmptyState();
    const category = state.categories.find(
      (entry) => Boolean(entry.isSavings) === isSavings,
    );
    const listeners = {};
    const form = {
      dataset: { categoryId: category.id, editExpenseForm: "zero-item" },
      addEventListener: (_, handler) => {
        listeners[selector] = handler;
      },
    };
    let selector;
    let values;
    let saves = 0;
    vm.runInNewContext(handlers, {
      document: {
        querySelectorAll: (value) => {
          selector = value;
          return [form];
        },
      },
      state,
      formValues: () => values,
      id: () => "zero-item",
      saveState: () => {
        saves++;
      },
      render: () => {},
    });
    const event = { preventDefault() {} };
    values = {
      name: "Placeholder",
      amount: 0,
      multiplier: 1,
      frequency: "monthly",
      group: "",
    };
    listeners[".expense-form"](event);
    assert.equal(state.expenses.length, 1);
    assert.equal(state.expenses[0].amount, 0);
    state.expenses[0].amount = 100;
    listeners["[data-edit-expense-form]"](event);
    assert.equal(state.expenses[0].amount, 0);
    assert.equal(saves, 2);
    const restored = budget.normalizeSaveState(
      JSON.parse(JSON.stringify(budget.createSavePayload(state))),
    );
    assert.equal(restored.expenses[0].amount, 0);
    assert.equal(budget.getBudgetSummary(restored).periods.monthly.expenses, 0);
    assert.equal(budget.getBudgetSummary(restored).periods.monthly.savings, 0);
    for (const amount of [-1, NaN, Infinity]) {
      values = { ...values, amount };
      listeners[".expense-form"](event);
      listeners["[data-edit-expense-form]"](event);
    }
    assert.equal(state.expenses.length, 1);
    assert.equal(state.expenses[0].amount, 0);
    assert.equal(saves, 2);
  }
});

test("group totals show the selected budget period with comma-formatted amounts", () => {
  const budget = loadBudget();
  assert.equal(
    budget.formatGroupTotal(10000, "monthly"),
    "$10,000.00 / Monthly",
  );
  assert.equal(
    budget.formatGroupTotal(10000, "semi-monthly"),
    "$5,000.00 / Semi-monthly",
  );
  assert.equal(
    budget.formatGroupTotal(10000, "annual"),
    "$120,000.00 / Annually",
  );
  assert.equal(
    budget.formatGroupTotal(123.45, "quarterly"),
    "$370.35 / Quarterly",
  );
  assert.equal(budget.formatGroupTotal(434.524, "weekly"), "$100.00 / Weekly");
  assert.equal(
    budget.formatGroupTotal(434.524, "biweekly"),
    "$200.00 / Biweekly",
  );
});

test("category target periods scale all metrics together and preserve independent preferences", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  state.incomes = [
    { id: "work", name: "Work", amount: 2000, frequency: "monthly" },
  ];
  state.expenses = [
    {
      id: "bill",
      name: "Bill",
      amount: 240,
      multiplier: 0.5,
      frequency: "monthly",
      categoryId: "default-needs",
    },
  ];
  const category = budget.getBudgetSummary(state).categories[0];
  const expectedFactors = {
    weekly: 1 / 4.34524,
    biweekly: 1 / 2.17262,
    "semi-monthly": 0.5,
    monthly: 1,
    quarterly: 3,
    annual: 12,
  };
  for (const [period, factor] of Object.entries(expectedFactors)) {
    const metrics = budget.getCategoryPeriodMetrics(category, period);
    assertClose(metrics.target, 1000 * factor);
    assertClose(metrics.spent, 120 * factor);
    assertClose(metrics.remaining, 880 * factor);
    assertClose(metrics.spent / metrics.target, category.usagePercent / 100);
    state.app.boardPeriod = period;
    const imported = budget.normalizeSaveState(
      JSON.parse(JSON.stringify(budget.createSavePayload(state))),
    );
    assert.equal(imported.app.boardPeriod, period);
    assert.equal(imported.app.summaryPeriod, "monthly");
  }
  delete state.app.boardPeriod;
  assert.equal(budget.normalizeSaveState(state).app.boardPeriod, "monthly");
  state.app.boardPeriod = "invalid";
  assert.throws(() => budget.normalizeSaveState(state), /Invalid board period/);
});

test("summary periods include half-month totals and display only the saved selection", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  state.incomes = [
    { id: "work", name: "Work", amount: 2000, frequency: "monthly" },
  ];
  state.expenses = [
    {
      id: "bill",
      name: "Bill",
      amount: 200,
      multiplier: 0.5,
      frequency: "monthly",
      categoryId: "default-needs",
    },
    {
      id: "save",
      name: "Save",
      amount: 200,
      multiplier: 1,
      frequency: "monthly",
      categoryId: "default-savings",
    },
  ];
  const summary = budget.getBudgetSummary(state);
  assert.deepEqual(plain(summary.periods["semi-monthly"]), {
    income: 1000,
    expenses: 50,
    savings: 100,
    remaining: 850,
  });
  assertClose(budget.toPeriodAmount(2400, "annually", "semi-monthly"), 100);
  assert.notEqual(
    summary.periods.biweekly.income,
    summary.periods["semi-monthly"].income,
  );
  const context = { window: { budget } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/app-template.js"), "utf8"),
    context,
  );
  assert.equal(state.app.summaryPeriod, "monthly");
  for (const [period] of budget.SUMMARY_PERIODS) {
    state.app.summaryPeriod = period;
    const imported = budget.normalizeSaveState(
      JSON.parse(JSON.stringify(budget.createSavePayload(state))),
    );
    assert.equal(imported.app.summaryPeriod, period);
    const html = context.window.renderApp(
      imported,
      summary,
      budget.sortCategories(imported),
      imported.expenses,
    );
    assert.equal(
      (html.match(/data-summary-period="[^"]+" hidden/g) || []).length,
      5,
    );
    assert.match(html, new RegExp(`data-summary-period="${period}" >`));
    assert.match(html, /<option value="semi-monthly"/);
    assert.match(
      html,
      /class="summary-card"[^>]*>\s*<div class="summary-metrics">/,
    );
  }
  delete state.app.summaryPeriod;
  assert.equal(budget.normalizeSaveState(state).app.summaryPeriod, "monthly");
  state.app.summaryPeriod = "invalid";
  assert.throws(
    () => budget.normalizeSaveState(state),
    /Invalid summary period/,
  );
});

test("custom category colors validate and persist", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  assert.equal(
    budget.setCategoryColor(state, "default-needs", "#ABCDEF"),
    true,
  );
  assert.equal(state.categories[0].color, "#abcdef");
  const saved = JSON.parse(JSON.stringify(budget.createSavePayload(state)));
  assert.equal(budget.normalizeSaveState(saved).categories[0].color, "#abcdef");
  for (const color of ["red", "#fff", "#12345g", "#123456;", ""]) {
    assert.equal(budget.setCategoryColor(state, "default-needs", color), false);
    assert.equal(state.categories[0].color, "#abcdef");
  }
  assert.equal(budget.setCategoryColor(state, "missing", "#123456"), false);
});

test("money displays comma separators and two decimals without changing amounts", () => {
  const budget = loadBudget();
  for (const [amount, expected] of [
    [0, "$0.00"],
    [999.5, "$999.50"],
    [10000, "$10,000.00"],
    [1234567.89, "$1,234,567.89"],
    [-10000.5, "$-10,000.50"],
    [1234.567, "$1,234.57"],
  ]) {
    assert.equal(budget.formatMoney(amount), expected);
  }
});

test("desktop category row preference defaults to three and round trips valid choices", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  assert.equal(state.app.categoriesPerRow, 3);
  delete state.app.categoriesPerRow;
  assert.equal(budget.normalizeSaveState(state).app.categoriesPerRow, 3);
  for (const count of [1, 2, 3]) {
    state.app.categoriesPerRow = count;
    const saved = JSON.parse(JSON.stringify(budget.createSavePayload(state)));
    assert.equal(budget.normalizeSaveState(saved).app.categoriesPerRow, count);
  }
  for (const invalid of [0, 4, 1.5, "2", null]) {
    state.app.categoriesPerRow = invalid;
    assert.throws(
      () => budget.normalizeSaveState(state),
      /Invalid categories per row/,
    );
  }
});

test("income defaults to collapsed while save normalization retains compatible preferences", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  assert.equal(state.app.isIncomeOpen, false);
  delete state.app.isIncomeOpen;
  assert.equal(budget.normalizeSaveState(state).app.isIncomeOpen, false);
  state.app.isIncomeOpen = true;
  assert.equal(budget.normalizeSaveState(state).app.isIncomeOpen, true);
  state.app.isIncomeOpen = false;
  assert.equal(budget.normalizeSaveState(state).app.isIncomeOpen, false);
});

test("shared income and category delete icons retain accessible names", () => {
  const budget = loadBudget();
  const context = { window: { budget } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/app-template.js"), "utf8"),
    context,
  );
  const state = budget.createEmptyState();
  state.app.isIncomeOpen = true;
  state.incomes = [
    { id: "income", name: 'Work & "Life"', amount: 100, frequency: "monthly" },
  ];
  const html = context.window.renderApp(
    state,
    budget.getBudgetSummary(state),
    budget.sortCategories(state),
    [],
  );
  assert.match(
    html,
    /data-remove-income="income" aria-label="Delete Work &amp; &quot;Life&quot; Income" title="Delete Income">&times;/,
  );
  assert.match(
    html,
    /data-remove-category="default-needs" aria-label="Delete Needs Category" title="Delete Category">&times;/,
  );
  assert.doesNotMatch(html, />Remove<\/button>/);
});

test("opening the app preserves section and group preferences and resets only Income editing", async () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  state.app.isIncomeOpen = true;
  state.app.boardPeriod = "annual";
  state.app.summaryPeriod = "weekly";
  state.app.isBudgetBoardOpen = false;
  state.app.isNotesOpen = false;
  state.app.isFaqOpen = true;
  state.app.collapsedGroups = {
    "default-needs:Home": false,
    "default-needs:Home / Child": true,
  };
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  state.app.editingIncomeId = "saved-editor";
  const rendered = [];
  const context = {
    budget,
    window: {},
    loadState: async () => state,
    render: (value) =>
      rendered.push([value.app.isIncomeOpen, value.app.boardPeriod]),
    platform: { ready: async () => {} },
  };
  await vm.runInNewContext(
    main.slice(main.indexOf("async function startApp()")),
    context,
  );
  assert.deepEqual(rendered, [[true, "annual"]]);
  assert.deepEqual(plain(state.app.collapsedGroups), {
    "default-needs:Home": false,
    "default-needs:Home / Child": true,
  });
  assert.equal(state.app.summaryPeriod, "weekly");
  assert.equal(state.app.isIncomeOpen, true);
  assert.equal(state.app.isBudgetBoardOpen, false);
  assert.equal(state.app.isNotesOpen, false);
  assert.equal(state.app.isFaqOpen, true);
  assert.equal(state.app.editingIncomeId, "");
  assert.equal(context.window.budgetReady, true);
});

test("section collapse preferences round trip and older saves receive defaults", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  const keys = [
    "isIncomeOpen",
    "isBudgetBoardOpen",
    "isNotesOpen",
    "isFaqOpen",
  ];
  for (const open of [false, true]) {
    for (const key of keys) state.app[key] = open;
    const restored = budget.normalizeSaveState(
      JSON.parse(JSON.stringify(budget.createSavePayload(state))),
    );
    for (const key of keys) assert.equal(restored.app[key], open);
  }
  for (const key of keys) delete state.app[key];
  const defaults = budget.normalizeSaveState(state).app;
  assert.equal(defaults.isIncomeOpen, false);
  assert.equal(defaults.isBudgetBoardOpen, true);
  assert.equal(defaults.isNotesOpen, true);
  assert.equal(defaults.isFaqOpen, false);
  state.app.isSummaryOpen = false;
  assert.equal(budget.normalizeSaveState(state).app.isSummaryOpen, undefined);
  state.app.isNotesOpen = "false";
  assert.throws(
    () => budget.normalizeSaveState(state),
    /Invalid section collapse preference/,
  );
  assert.equal(
    budget.SUMMARY_PERIODS.find(([key]) => key === "annual")[1],
    "Annually",
  );
});

test("default state has the intended categories and savings setup", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();

  assert.deepEqual(
    plain(
      state.categories.map(({ name, percentage, isSavings }) => ({
        name,
        percentage,
        isSavings,
      })),
    ),
    [
      { name: "Needs", percentage: 50, isSavings: false },
      { name: "Wants", percentage: 30, isSavings: false },
      { name: "Savings", percentage: 20, isSavings: true },
    ],
  );
  assert.equal(state.app.paychecksPerMonth, 2);
  assert.equal(budget.getCategoryPercentageTotal(state), 100);
  assert.ok(budget.FREQUENCY_OPTIONS.some(({ value }) => value === "biweekly"));
  assert.ok(
    budget.FREQUENCY_OPTIONS.some(({ value }) => value === "semi-monthly"),
  );
  assert.ok(
    !budget.FREQUENCY_OPTIONS.some(({ value }) => value === "per-paycheck"),
  );
});

test("imports current and legacy MyBudgeter save files", () => {
  const budget = loadBudget();
  const currentSave = budget.createEmptyState();
  currentSave.incomes = [
    { id: "income-1", name: "Work", amount: 1000, frequency: "biweekly" },
  ];
  currentSave.expenses = [
    {
      id: "expense-1",
      name: "Rent",
      amount: 1200,
      multiplier: 1,
      frequency: "monthly",
      categoryId: "default-needs",
      group: "Home",
      sortOrder: 1,
    },
  ];

  const exportedSave = budget.createSavePayload(currentSave);
  const importedCurrent = budget.normalizeSaveState(exportedSave);
  assert.equal(exportedSave.version, budget.APP_VERSION);
  assert.equal(exportedSave.schema, budget.SAVE_FILE_SCHEMA);
  assert.equal(importedCurrent.schema, exportedSave.schema);
  assert.match(importedCurrent.exportedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(plain(importedCurrent.incomes), plain(currentSave.incomes));
  assert.deepEqual(
    plain(importedCurrent.categories),
    plain(currentSave.categories),
  );
  assert.deepEqual(
    plain(importedCurrent.expenses),
    plain(currentSave.expenses),
  );

  const legacySave = {
    ...currentSave,
    version: 1,
    schema: "mybudgeter-budget-v1",
    expenses: [
      {
        id: "expense-2",
        name: "Membership",
        amount: "20",
        frequency: "monthly",
        categoryId: "default-wants",
      },
    ],
  };
  const importedLegacy = budget.normalizeSaveState(legacySave);
  assert.equal(importedLegacy.version, budget.APP_VERSION);
  assert.equal(importedLegacy.schema, budget.SAVE_FILE_SCHEMA);
  assert.deepEqual(plain(importedLegacy.expenses[0]), {
    ...legacySave.expenses[0],
    amount: 20,
    multiplier: 1,
    sortOrder: 1,
    group: "",
  });
});

test("rejects files that are not MyBudgeter save files", () => {
  const budget = loadBudget();
  assert.throws(
    () => budget.normalizeSaveState({ schema: "another-app-v1" }),
    /Unsupported save file/,
  );
  assert.throws(
    () => budget.normalizeSaveState({ schema: "MyBudgeter-budget-v2" }),
    /Unsupported save file/,
  );
});

test("normalizes income and recurring costs to monthly and period amounts", () => {
  const budget = loadBudget();

  assertClose(budget.normalizeToMonthly(1000, "biweekly"), 2172.62);
  assertClose(budget.normalizeToMonthly(1000, "semi-monthly"), 2000);
  assertClose(budget.normalizeToMonthly(100, "weekly"), 434.524);
  assertClose(budget.normalizeToMonthly(1200, "annually"), 100);
  assertClose(budget.toPeriodAmount(100, "monthly", "annual"), 1200);
  assertClose(budget.toPeriodAmount(1200, "annually", "monthly"), 100);
});

test("group paths support nested subgroups without matching similarly named groups", () => {
  const budget = loadBudget();

  assert.deepEqual(plain(budget.splitGroupPath("Home / Utilities / Power")), [
    "Home",
    "Utilities",
    "Power",
  ]);
  assert.equal(budget.isGroupOrDescendant("Home / Utilities", "Home"), true);
  assert.equal(budget.isGroupOrDescendant("Home", "Home"), true);
  assert.equal(budget.isGroupOrDescendant("Home Office", "Home"), false);
});

test("dropping a group on another group nests its full subtree", () => {
  const budget = loadBudget();
  const state = {
    expenses: [
      { id: "1", categoryId: "needs", group: "Home", sortOrder: 1 },
      { id: "2", categoryId: "needs", group: "Home / Utilities", sortOrder: 2 },
      { id: "3", categoryId: "needs", group: "Travel", sortOrder: 3 },
    ],
  };

  assert.equal(
    budget.moveGroupIntoGroup(state, "needs", "Home", "needs", "Travel"),
    true,
  );
  assert.deepEqual(plain(state.expenses.map(({ group }) => group)), [
    "Travel / Home",
    "Travel / Home / Utilities",
    "Travel",
  ]);
  assert.equal(
    budget.moveGroupIntoGroup(
      state,
      "needs",
      "Travel",
      "needs",
      "Travel / Home",
    ),
    false,
  );
});

test("moving a group to another category transfers its full subtree", () => {
  const budget = loadBudget();
  const state = {
    expenses: [
      { id: "1", categoryId: "needs", group: "Home" },
      { id: "2", categoryId: "needs", group: "Home / Utilities" },
      { id: "3", categoryId: "needs", group: "Travel" },
    ],
  };

  assert.equal(
    budget.moveGroupToCategory(state, "needs", "Home", "wants"),
    true,
  );
  assert.deepEqual(plain(state.expenses.map(({ categoryId }) => categoryId)), [
    "wants",
    "wants",
    "needs",
  ]);
});

test("browser scripts have no conflicting top-level declarations", () => {
  const budgetSource = fs.readFileSync(
    path.join(__dirname, "../src/budget.js"),
    "utf8",
  );
  const mainSource = fs.readFileSync(
    path.join(__dirname, "../src/main.js"),
    "utf8",
  );

  assert.doesNotThrow(() => new vm.Script(`${budgetSource}\n${mainSource}`));
});

test("summary separates expenses, savings, unspent money, and category usage", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();

  state.incomes = [{ amount: 1000, frequency: "biweekly" }];
  state.expenses = [
    {
      amount: 100,
      multiplier: 1.5,
      frequency: "weekly",
      categoryId: "default-needs",
    },
    {
      amount: 200,
      multiplier: 1,
      frequency: "monthly",
      categoryId: "default-savings",
    },
  ];

  const summary = budget.getBudgetSummary(state);
  const needs = summary.categories.find(
    (category) => category.id === "default-needs",
  );

  assertClose(summary.monthlyIncome, 2172.62);
  assertClose(summary.monthlyExpenses, 651.786);
  assertClose(summary.monthlySavings, 200);
  assertClose(summary.monthlyRemaining, 1320.834);
  assertClose(needs.monthlyTarget, 1086.31);
  assertClose(needs.usagePercent, 60);
  assertClose(summary.periods.annual.income, 26071.44);
  assertClose(summary.periods.annual.expenses, 7821.432);
  assertClose(summary.periods.annual.savings, 2400);
});

test("item summaries show amount and frequency inline with the name without percentages", () => {
  const budget = loadBudget();
  const context = { window: { budget } };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/app-template.js"), "utf8"),
    context,
  );
  const state = budget.createEmptyState();
  state.expenses = [
    {
      id: "simple",
      name: "Rent",
      amount: 125,
      multiplier: 1,
      frequency: "monthly",
      categoryId: "default-needs",
      group: "Home",
    },
  ];
  const html = context.window.renderApp(
    state,
    budget.getBudgetSummary(state),
    budget.sortCategories(state),
    state.expenses,
  );
  const item = html.match(
    /data-expense-id="simple"[\s\S]*?<div class="item-name-row">\s*<strong>Rent<\/strong>\s*<span class="small">([\s\S]*?)<\/span>\s*<\/div>/,
  )[1];
  assert.match(item, /\$125\.00 \/ monthly/);
  assert.doesNotMatch(item, /%/);
  assert.doesNotMatch(html, /class="tag"/);
  assert.match(html, /Spending<\/span>/);
  assert.match(html, /Saving<\/span>/);
  assert.doesNotMatch(html, /Monthly Spend|Monthly Saving/);
  assert.match(
    html,
    /data-show-category-form><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" \/><\/svg>Add category<\/button>/,
  );
  assert.equal(state.expenses[0].group, "Home");
  assert.match(
    html,
    /class="ghost expense-add-button"[^>]*aria-label="Add Expense" title="Add Expense"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" \/><\/svg><\/button>/,
  );
  assert.match(
    html,
    /class="ghost expense-add-button"[^>]*aria-label="Add Savings" title="Add Savings"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" \/><\/svg><\/button>/,
  );
});

test("category and item sorting follows the selected rule without changing input order", () => {
  const budget = loadBudget();
  const state = budget.createEmptyState();
  state.categories = [
    { id: "one", name: "Zoo", percentage: 10, sortOrder: 2 },
    { id: "two", name: "Alpha", percentage: 50, sortOrder: 1 },
  ];
  assert.deepEqual(plain(budget.sortCategories(state).map(({ id }) => id)), [
    "two",
    "one",
  ]);
  state.app.categorySort = "name";
  assert.deepEqual(plain(budget.sortCategories(state).map(({ id }) => id)), [
    "two",
    "one",
  ]);
  assert.deepEqual(
    state.categories.map(({ id }) => id),
    ["one", "two"],
  );

  const expenses = [
    {
      name: "Later",
      amount: 10,
      multiplier: 1,
      frequency: "monthly",
      sortOrder: 2,
    },
    {
      name: "First",
      amount: 20,
      multiplier: 0.5,
      frequency: "annual",
      sortOrder: 1,
    },
  ];
  assert.deepEqual(
    plain(budget.sortExpenses(expenses, "amount").map(({ name }) => name)),
    ["Later", "First"],
  );
  assert.deepEqual(
    plain(budget.sortExpenses(expenses).map(({ name }) => name)),
    ["First", "Later"],
  );
});
