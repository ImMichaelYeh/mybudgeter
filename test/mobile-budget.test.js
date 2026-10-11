const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function fixture() {
  const context = { window: {} };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../src/budget.js"), "utf8"),
    context,
  );
  const budget = context.window.budget;
  const state = budget.createEmptyState();
  state.expenses = [
    {
      id: "a",
      name: "Rent",
      categoryId: "default-needs",
      group: "Home",
      amount: 100,
      frequency: "monthly",
      multiplier: 1,
      sortOrder: 1,
    },
    {
      id: "b",
      name: "Power",
      categoryId: "default-needs",
      group: "Home / Utilities",
      amount: 20,
      frequency: "monthly",
      multiplier: 0.5,
      sortOrder: 2,
    },
    {
      id: "c",
      name: "Travel",
      categoryId: "default-needs",
      group: "",
      amount: 40,
      frequency: "weekly",
      multiplier: 1,
      sortOrder: 3,
    },
    {
      id: "d",
      name: "Leisure",
      categoryId: "default-wants",
      group: "Fun",
      amount: 15,
      frequency: "annually",
      multiplier: 1,
      sortOrder: 1,
    },
  ];
  state.app.collapsedGroups = {
    "default-needs:Home": true,
    "default-needs:Home / Utilities": true,
    "default-needs:Home Office": true,
  };
  return { budget, state };
}
const plain = (value) => JSON.parse(JSON.stringify(value));

test("save normalization preserves expanded and collapsed group preferences", () => {
  const { budget, state } = fixture();
  state.app.collapsedGroups["default-needs:Home"] = false;
  state.app.collapsedGroups["default-needs:Home / Utilities"] = true;
  const saved = JSON.parse(JSON.stringify(budget.createSavePayload(state)));
  const restored = budget.normalizeSaveState(saved);
  assert.deepEqual(
    plain(restored.app.collapsedGroups),
    plain(state.app.collapsedGroups),
  );
  assert.deepEqual(plain(restored.expenses), plain(state.expenses));
});

test("desktop group-edge insertion joins the subgroup's parent without moving its siblings", () => {
  const main = fs.readFileSync(path.join(__dirname, "../src/main.js"), "utf8");
  for (const placement of ["before", "after"]) {
    const { budget, state } = fixture();
    state.expenses = [
      { ...state.expenses[2], id: "source", sortOrder: 1 },
      { ...state.expenses[1], sortOrder: 2 },
      { ...state.expenses[2], id: "tail", sortOrder: 3 },
    ];
    const context = { budget };
    vm.runInNewContext(
      main.slice(
        main.indexOf("function moveItemBesideGroup("),
        main.indexOf("function moveItemBesideItem("),
      ),
      context,
    );
    assert.equal(
      context.moveItemBesideGroup(
        state,
        "default-needs",
        "source",
        "Home / Utilities",
        placement,
      ),
      true,
    );
    assert.equal(state.expenses[0].group, "Home");
    assert.deepEqual(
      plain(budget.sortExpenses(state.expenses).map((item) => item.id)),
      placement === "before"
        ? ["source", "b", "tail"]
        : ["b", "source", "tail"],
    );
  }
});

test("adding earlier or cross-category items keeps the destination group in place", () => {
  for (const crossCategory of [false, true]) {
    const { budget, state } = fixture();
    state.expenses.push(
      { ...state.expenses[2], id: "before", sortOrder: 5 },
      { ...state.expenses[0], id: "target", group: "Later", sortOrder: 6 },
      { ...state.expenses[2], id: "after", sortOrder: 7 },
    );
    const source = state.expenses.find(
      (item) => item.id === (crossCategory ? "d" : "c"),
    );
    assert.equal(
      budget.moveBudgetEntry(
        state,
        { type: "item", categoryId: source.categoryId, id: source.id },
        { categoryId: "default-needs", group: "Later", placement: "append" },
      ),
      true,
    );
    const ordered = budget.sortExpenses(
      state.expenses.filter((item) => item.categoryId === "default-needs"),
    );
    assert.ok(
      ordered.findIndex((item) => item.id === "before") <
        ordered.findIndex((item) => item.id === "target"),
    );
    assert.ok(
      ordered.findIndex((item) => item.id === "target") <
        ordered.findIndex((item) => item.id === source.id),
    );
    assert.ok(
      ordered.findIndex((item) => item.id === source.id) <
        ordered.findIndex((item) => item.id === "after"),
    );
    assert.equal(source.group, "Later");
    assert.equal(state.app.collapsedGroups["default-needs:Home"], true);
  }
});

test("combining group members creates a subgroup without disturbing siblings or collapse preferences", () => {
  const { budget, state } = fixture();
  state.expenses.push(
    { ...state.expenses[0], id: "peer", name: "Insurance", sortOrder: 4 },
    {
      ...state.expenses[0],
      id: "existing",
      group: "Home / New Group 1",
      sortOrder: 5,
    },
  );
  const collapsed = plain(state.app.collapsedGroups);
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "item", categoryId: "default-needs", id: "peer" },
      {
        categoryId: "default-needs",
        target: { type: "item", id: "a" },
        placement: "combine",
      },
    ),
    true,
  );
  assert.equal(
    state.expenses.find((item) => item.id === "a").group,
    "Home / New Group 2",
  );
  assert.equal(
    state.expenses.find((item) => item.id === "peer").group,
    "Home / New Group 2",
  );
  assert.equal(
    state.expenses.find((item) => item.id === "b").group,
    "Home / Utilities",
  );
  assert.equal(
    state.expenses.find((item) => item.id === "existing").group,
    "Home / New Group 1",
  );
  assert.deepEqual(plain(state.app.collapsedGroups), collapsed);
  assert.equal(state.expenses.length, 6);
});

test("edge drop ordering preserves mixed siblings, hierarchy and collapsed subtrees", () => {
  const { budget, state } = fixture();
  const original = plain(state);
  const group = { type: "group", categoryId: "default-needs", group: "Home" };
  const target = { type: "item", id: "c" };
  assert.equal(
    budget.moveBudgetEntry(state, group, {
      categoryId: group.categoryId,
      target,
      placement: "after",
    }),
    true,
  );
  assert.deepEqual(
    Array.from(
      budget.sortExpenses(
        state.expenses.filter((item) => item.categoryId === group.categoryId),
      ),
      (item) => item.id,
    ),
    ["c", "a", "b"],
  );
  const nested = { ...group, group: "Home / Utilities" };
  assert.equal(
    budget.moveBudgetEntry(state, nested, {
      categoryId: nested.categoryId,
      target: { type: "item", id: "a" },
      placement: "before",
    }),
    true,
  );
  assert.deepEqual(
    Array.from(
      budget.sortExpenses(
        state.expenses.filter((item) => item.categoryId === group.categoryId),
      ),
      (item) => item.id,
    ),
    ["c", "b", "a"],
  );
  assert.deepEqual(
    plain(state.app.collapsedGroups),
    original.app.collapsedGroups,
  );
  assert.deepEqual(
    state.expenses.map((item) => [item.id, item.categoryId, item.group]),
    original.expenses.map((item) => [item.id, item.categoryId, item.group]),
  );
});

test("mobile category moves support insertion and swapping without changing colors", () => {
  const { budget, state } = fixture();
  const color = state.categories[0].color;
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "category", id: "default-needs" },
      { categoryId: "default-savings", placement: "after" },
    ),
    true,
  );
  assert.deepEqual(
    plain(budget.sortCategories(state).map((entry) => entry.id)),
    ["default-wants", "default-savings", "default-needs"],
  );
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "category", id: "default-needs" },
      { categoryId: "default-wants", placement: "swap" },
    ),
    true,
  );
  assert.equal(state.categories[0].color, color);
  assert.equal(budget.sortCategories(state)[0].id, "default-needs");
});

test("mobile subtree moves transfer descendants and exact collapse preferences", () => {
  const { budget, state } = fixture();
  const before = budget.getBudgetSummary(state);
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "group", categoryId: "default-needs", group: "Home" },
      {
        categoryId: "default-wants",
        target: { type: "group", group: "Fun" },
        placement: "combine",
      },
    ),
    true,
  );
  assert.equal(state.expenses[0].group, "Fun / Home");
  assert.equal(state.expenses[1].group, "Fun / Home / Utilities");
  assert.equal(state.expenses[1].categoryId, "default-wants");
  assert.equal(
    state.expenses.filter((entry) => entry.categoryId === "default-needs")
      .length,
    1,
  );
  assert.equal(
    state.app.collapsedGroups["default-wants:Fun / Home / Utilities"],
    true,
  );
  assert.equal(state.app.collapsedGroups["default-needs:Home"], undefined);
  assert.equal(state.app.collapsedGroups["default-needs:Home Office"], true);
  assert.equal(
    budget.getBudgetSummary(state).monthlyExpenses,
    before.monthlyExpenses,
  );
});

test("invalid destinations do not mutate the budget", () => {
  const { budget, state } = fixture();
  const original = JSON.stringify(state);
  const source = { type: "group", categoryId: "default-needs", group: "Home" };
  for (const destination of [
    {
      categoryId: "default-needs",
      group: "Home / Utilities",
      placement: "append",
    },
    {
      categoryId: "default-needs",
      target: { type: "group", group: "Home / Utilities" },
      placement: "before",
    },
    { categoryId: "missing", placement: "append" },
    {
      categoryId: "default-wants",
      target: { type: "item", id: "missing" },
      placement: "after",
    },
  ]) {
    assert.equal(budget.moveBudgetEntry(state, source, destination), false);
    assert.equal(JSON.stringify(state), original);
  }
});

test("items can leave groups, reorder among members, and combine with regular items", () => {
  const { budget, state } = fixture();
  const source = { type: "item", categoryId: "default-needs", id: "b" };
  assert.equal(
    budget.moveBudgetEntry(state, source, {
      categoryId: "default-needs",
      target: { type: "item", id: "a" },
      placement: "before",
    }),
    true,
  );
  assert.equal(state.expenses[1].group, "Home");
  assert.ok(state.expenses[1].sortOrder < state.expenses[0].sortOrder);
  assert.equal(
    budget.moveBudgetEntry(state, source, {
      categoryId: "default-needs",
      placement: "append",
    }),
    true,
  );
  assert.equal(state.expenses[1].group, "");
  assert.equal(
    budget.moveBudgetEntry(state, source, {
      categoryId: "default-needs",
      target: { type: "item", id: "c" },
      placement: "combine",
    }),
    true,
  );
  assert.equal(state.expenses[1].group, state.expenses[2].group);
  assert.match(state.expenses[1].group, /^New Group /);
});

test("nested subgroups can move to the category root and retain descendant collapse state", () => {
  const { budget, state } = fixture();
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "group", categoryId: "default-needs", group: "Home / Utilities" },
      {
        categoryId: "default-needs",
        target: { type: "item", id: "c" },
        placement: "before",
      },
    ),
    true,
  );
  assert.equal(state.expenses[1].group, "Utilities");
  assert.equal(state.app.collapsedGroups["default-needs:Utilities"], true);
});

test("matching destination groups retain every moved item", () => {
  const { budget, state } = fixture();
  state.expenses[3].group = "Home";
  const ids = state.expenses.map((entry) => entry.id).sort();
  assert.equal(
    budget.moveBudgetEntry(
      state,
      { type: "group", categoryId: "default-needs", group: "Home" },
      {
        categoryId: "default-wants",
        placement: "append",
      },
    ),
    true,
  );
  assert.deepEqual(state.expenses.map((entry) => entry.id).sort(), ids);
  assert.equal(
    budget
      .getOrganizationTargets(state, "default-wants")
      .filter((entry) => entry.type === "group" && entry.group === "Home")
      .length,
    1,
  );
});

test("v1 JSON round trips preserve organization, notes, colors, quantities, and totals", () => {
  const { budget, state } = fixture();
  state.notes = "Private notes\nSecond line";
  const imported = budget.normalizeSaveState(
    JSON.parse(JSON.stringify(budget.createSavePayload(state))),
  );
  assert.deepEqual(plain(imported.expenses), plain(state.expenses));
  assert.deepEqual(plain(imported.categories), plain(state.categories));
  assert.deepEqual(
    plain(imported.app.collapsedGroups),
    plain(state.app.collapsedGroups),
  );
  assert.equal(imported.notes, state.notes);
  assert.deepEqual(
    plain(budget.getBudgetSummary(imported)),
    plain(budget.getBudgetSummary(state)),
  );
});

test("malformed save fields and unsafe identifiers are rejected before replacement", () => {
  const { budget, state } = fixture();
  for (const corrupt of [
    { ...state, incomes: {} },
    { ...state, notes: {} },
    { ...state, expenses: [{ ...state.expenses[0], amount: "Infinity" }] },
    {
      ...state,
      expenses: [{ ...state.expenses[0], id: '\" onclick=\"alert(1)' }],
    },
    { ...state, expenses: [state.expenses[0], state.expenses[0]] },
    { ...state, app: { collapsedGroups: [] } },
  ])
    assert.throws(() => budget.normalizeSaveState(corrupt), /Invalid/);
});

test("all shared scripts parse together without conflicting globals", () => {
  const source = ["budget", "platform", "app-template", "main", "mobile"]
    .map((name) =>
      fs.readFileSync(path.join(__dirname, `../src/${name}.js`), "utf8"),
    )
    .join("\n");
  assert.doesNotThrow(() => new vm.Script(source));
});

test("adjacent category swaps preserve items and collapse preferences", () => {
  const { budget, state } = fixture();
  const original = plain(state);
  const ids = () =>
    Array.from(budget.sortCategories(state), (category) => category.id);
  const source = { type: "category", id: "default-needs" };
  assert.equal(
    budget.moveBudgetEntry(state, source, {
      categoryId: "default-wants",
      placement: "swap",
    }),
    true,
  );
  assert.deepEqual(ids(), [
    "default-wants",
    "default-needs",
    "default-savings",
  ]);
  assert.deepEqual(plain(state.expenses), original.expenses);
  assert.deepEqual(
    plain(state.app.collapsedGroups),
    original.app.collapsedGroups,
  );
  assert.equal(
    budget.moveBudgetEntry(state, source, {
      categoryId: "default-wants",
      placement: "swap",
    }),
    true,
  );
  assert.deepEqual(ids(), [
    "default-needs",
    "default-wants",
    "default-savings",
  ]);
});
