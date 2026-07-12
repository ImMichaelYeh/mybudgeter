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
    !budget.FREQUENCY_OPTIONS.some(({ value }) => value === "per-paycheck"),
  );
});

test("normalizes income and recurring costs to monthly and period amounts", () => {
  const budget = loadBudget();

  assertClose(budget.normalizeToMonthly(1000, "biweekly"), 2172.62);
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
