const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "semi-monthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const DEFAULT_PAYCHECKS_PER_MONTH = 2;
const SUMMARY_PERIODS = [
  ["weekly", "Weekly"],
  ["biweekly", "Biweekly"],
  ["semi-monthly", "Semi-monthly"],
  ["monthly", "Monthly"],
  ["quarterly", "Quarterly"],
  ["annual", "Annually"],
];
const APP_VERSION = "1.8.1";
const SAVE_FILE_SCHEMA = `MyBudgeter-budget-v${APP_VERSION.split(".")[0]}`;
const GROUP_SEPARATOR = " / ";
const CATEGORY_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#059669",
  "#ea580c",
  "#dc2626",
  "#0891b2",
];
const MONTHLY_FACTORS = {
  daily: 30.4375,
  weekly: 4.34524,
  biweekly: 2.17262,
  "semi-monthly": 2,
  monthly: 1,
  quarterly: 1 / 3,
  annually: 1 / 12,
  "per-paycheck": 1,
};
const DEFAULT_CATEGORIES = [
  {
    id: "default-needs",
    name: "Needs",
    percentage: 50,
    sortOrder: 1,
    isSavings: false,
    color: CATEGORY_COLORS[0],
  },
  {
    id: "default-wants",
    name: "Wants",
    percentage: 30,
    sortOrder: 2,
    isSavings: false,
    color: CATEGORY_COLORS[1],
  },
  {
    id: "default-savings",
    name: "Savings",
    percentage: 20,
    sortOrder: 3,
    isSavings: true,
    color: CATEGORY_COLORS[2],
  },
];

function createEmptyState() {
  return {
    version: APP_VERSION,
    schema: SAVE_FILE_SCHEMA,
    exportedAt: new Date().toISOString(),
    app: {
      paychecksPerMonth: DEFAULT_PAYCHECKS_PER_MONTH,
      expenseSort: "manual",
      expenseSorts: {},
      collapsedGroups: {},
      collapsedCategories: {},
      categoryMessage: "",
      isIncomeOpen: false,
      isBudgetBoardOpen: true,
      isNotesOpen: true,
      isFaqOpen: false,
      categoriesPerRow: 3,
      summaryPeriod: "monthly",
      boardPeriod: "monthly",
      incomePeriod: "monthly",
      isAddingCategory: false,
      editingCategoryId: "",
      draftCategoryId: "",
      editingIncomeId: "",
      draftIncomeId: "",
      addingExpenseCategoryId: "",
      addingExpenseGroup: "",
      editingExpenseId: "",
    },
    incomes: [],
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    expenses: [],
    notes: "",
  };
}

function createSeedState() {
  return createEmptyState();
}

function createSavePayload(state) {
  return {
    ...state,
    version: APP_VERSION,
    schema: SAVE_FILE_SCHEMA,
    exportedAt: new Date().toISOString(),
  };
}

let currencySymbol = "$";

function setCurrencyDisplay(locale, currency) {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
  });
  currencySymbol = formatter.formatToParts(0)
    .find((part) => part.type === "currency").value;
}

function formatMoney(value) {
  return `${currencySymbol}${Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMoneyToFit(value, fits) {
  const full = formatMoney(value);
  if (fits(full)) return full;
  const amount = Number(value || 0);
  if (Math.abs(amount) < 1000) return full;
  const suffixes = ["", "k", "m", "b", "t", "q", "Q"];
  const magnitude = Math.min(
    suffixes.length - 1,
    Math.max(1, Math.floor(Math.log10(Math.abs(amount)) / 3)),
  );
  for (let scale = magnitude; scale < suffixes.length; scale++) {
    const scaled = amount / 1000 ** scale;
    if (Math.abs(scaled) >= 1000) continue;
    if (Math.abs(scaled) < 0.01) break;
    for (const precision of [2, 1, 0]) {
      const factor = 10 ** precision;
      const truncated = Math.trunc(scaled * factor) / factor;
      if (truncated === 0) continue;
      const text = `${currencySymbol}${truncated.toFixed(precision)}${suffixes[scale]}`;
      if (fits(text)) return text;
    }
  }
  return `${currencySymbol}${amount.toExponential(2)}`;
}

function setCategoryColor(state, categoryId, color) {
  const category = state.categories.find((entry) => entry.id === categoryId);
  if (!category || !/^#[0-9a-f]{6}$/i.test(color)) return false;
  category.color = color.toLowerCase();
  return true;
}

function splitGroupPath(group) {
  return String(group || "")
    .split(GROUP_SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
}

function isGroupOrDescendant(group, ancestor) {
  return (
    group === ancestor || group?.startsWith(`${ancestor}${GROUP_SEPARATOR}`)
  );
}

function moveGroupIntoGroup(
  state,
  sourceCategoryId,
  sourceGroup,
  destinationCategoryId,
  destinationGroup,
) {
  if (
    !sourceGroup ||
    !destinationGroup ||
    (sourceCategoryId === destinationCategoryId &&
      (isGroupOrDescendant(destinationGroup, sourceGroup) ||
        isGroupOrDescendant(sourceGroup, destinationGroup)))
  )
    return false;

  const sourceItems = state.expenses.filter(
    (expense) =>
      expense.categoryId === sourceCategoryId &&
      isGroupOrDescendant(expense.group, sourceGroup),
  );
  if (!sourceItems.length) return false;

  const nestedGroup = `${destinationGroup}${GROUP_SEPARATOR}${sourceGroup}`;
  sourceItems.forEach((expense) => {
    expense.group = `${nestedGroup}${expense.group.slice(sourceGroup.length)}`;
    expense.categoryId = destinationCategoryId;
  });
  return true;
}

function moveGroupToCategory(
  state,
  sourceCategoryId,
  sourceGroup,
  destinationCategoryId,
) {
  const sourceItems = state.expenses.filter(
    (expense) =>
      expense.categoryId === sourceCategoryId &&
      isGroupOrDescendant(expense.group, sourceGroup),
  );
  if (
    !sourceGroup ||
    sourceCategoryId === destinationCategoryId ||
    !sourceItems.length
  )
    return false;

  sourceItems.forEach((expense) => {
    expense.categoryId = destinationCategoryId;
  });
  return true;
}

function normalizeToMonthly(
  amount,
  frequency,
  paychecksPerMonth = DEFAULT_PAYCHECKS_PER_MONTH,
) {
  return (
    (Number(amount) || 0) *
    (frequency === "per-paycheck"
      ? paychecksPerMonth
      : MONTHLY_FACTORS[frequency] || 1)
  );
}

function toPeriodAmount(
  amount,
  frequency,
  period,
  paychecksPerMonth = DEFAULT_PAYCHECKS_PER_MONTH,
) {
  const monthlyAmount = normalizeToMonthly(
    amount,
    frequency,
    paychecksPerMonth,
  );
  return (
    {
      annual: monthlyAmount * 12,
      quarterly: monthlyAmount * 3,
      monthly: monthlyAmount,
      weekly: monthlyAmount / 4.34524,
      biweekly: monthlyAmount / 2.17262,
      "semi-monthly": monthlyAmount / 2,
      "per-paycheck": monthlyAmount / paychecksPerMonth,
    }[period] ?? monthlyAmount
  );
}

function getBudgetSummary(state) {
  const monthlyIncome = state.incomes.reduce(
    (sum, item) =>
      sum +
      normalizeToMonthly(
        item.amount,
        item.frequency,
        state.app.paychecksPerMonth,
      ),
    0,
  );
  const monthlyExpenses = state.expenses.reduce((sum, item) => {
    const category = state.categories.find(
      (candidate) => candidate.id === item.categoryId,
    );
    return (
      sum +
      (category?.isSavings
        ? 0
        : normalizeToMonthly(
            item.amount * (item.multiplier || 1),
            item.frequency,
            state.app.paychecksPerMonth,
          ))
    );
  }, 0);
  const monthlySavings = state.expenses.reduce((sum, item) => {
    const category = state.categories.find(
      (candidate) => candidate.id === item.categoryId,
    );
    return (
      sum +
      (category?.isSavings
        ? normalizeToMonthly(
            item.amount * (item.multiplier || 1),
            item.frequency,
            state.app.paychecksPerMonth,
          )
        : 0)
    );
  }, 0);
  const categories = state.categories.map((category) => {
    const monthlySpent = state.expenses
      .filter((item) => item.categoryId === category.id)
      .reduce(
        (sum, item) =>
          sum +
          normalizeToMonthly(
            item.amount * (item.multiplier || 1),
            item.frequency,
            state.app.paychecksPerMonth,
          ),
        0,
      );
    const monthlyTarget =
      (monthlyIncome * (Number(category.percentage) || 0)) / 100;
    return {
      ...category,
      monthlyTarget,
      monthlySpent,
      monthlyRemaining: monthlyTarget - monthlySpent,
      usagePercent: monthlyTarget ? (monthlySpent / monthlyTarget) * 100 : 0,
    };
  });
  const periods = SUMMARY_PERIODS.reduce((result, [period]) => {
    const income = state.incomes.reduce(
      (sum, item) =>
        sum +
        toPeriodAmount(
          item.amount,
          item.frequency,
          period,
          state.app.paychecksPerMonth,
        ),
      0,
    );
    const expenses = state.expenses.reduce((sum, item) => {
      const category = state.categories.find(
        (candidate) => candidate.id === item.categoryId,
      );
      return (
        sum +
        (category?.isSavings
          ? 0
          : toPeriodAmount(
              item.amount * (item.multiplier || 1),
              item.frequency,
              period,
              state.app.paychecksPerMonth,
            ))
      );
    }, 0);
    const savings = state.expenses.reduce((sum, item) => {
      const category = state.categories.find(
        (candidate) => candidate.id === item.categoryId,
      );
      return (
        sum +
        (category?.isSavings
          ? toPeriodAmount(
              item.amount * (item.multiplier || 1),
              item.frequency,
              period,
              state.app.paychecksPerMonth,
            )
          : 0)
      );
    }, 0);
    result[period] = {
      income,
      expenses,
      savings,
      remaining: income - expenses - savings,
    };
    return result;
  }, {});
  return {
    monthlyIncome,
    monthlyExpenses,
    monthlySavings,
    monthlyRemaining: monthlyIncome - monthlyExpenses - monthlySavings,
    categories,
    periods,
  };
}

function getCategoryPercentageTotal(state) {
  return state.categories.reduce(
    (sum, category) => sum + (Number(category.percentage) || 0),
    0,
  );
}

function getCategoryPeriodMetrics(category, period) {
  return {
    target: toPeriodAmount(category.monthlyTarget, "monthly", period),
    spent: toPeriodAmount(category.monthlySpent, "monthly", period),
    remaining: toPeriodAmount(category.monthlyRemaining, "monthly", period),
  };
}

function formatGroupTotal(monthlyTotal, period) {
  const label = SUMMARY_PERIODS.find(([key]) => key === period)[1];
  return `${formatMoney(toPeriodAmount(monthlyTotal, "monthly", period))} / ${label}`;
}

function sortCategories(state) {
  const sorted = [...state.categories];
  sorted.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return sorted;
}

function sortExpenses(expenses, sort = "manual") {
  const sorted = [...expenses];
  sorted.sort((a, b) =>
    sort === "amount"
      ? b.amount * (b.multiplier || 1) - a.amount * (a.multiplier || 1)
      : sort === "frequency"
        ? a.frequency.localeCompare(b.frequency)
        : sort === "group"
          ? (a.group || "").localeCompare(b.group || "") ||
            a.name.localeCompare(b.name)
          : sort === "name"
            ? a.name.localeCompare(b.name)
            : (a.sortOrder || 0) - (b.sortOrder || 0),
  );
  return sorted;
}

function normalizeSaveState(value) {
  const base = createEmptyState();
  if (
    !value ||
    String(value.schema).toLowerCase() !== base.schema.toLowerCase()
  ) {
    throw new Error("Unsupported save file");
  }
  validateSaveFields(value);
  const savedApp = { ...value.app };
  delete savedApp.isSummaryOpen;
  return {
    ...base,
    ...value,
    version: APP_VERSION,
    schema: SAVE_FILE_SCHEMA,
    app: {
      ...base.app,
      ...savedApp,
      isAddingCategory: false,
      categorySort: "manual",
      expenseSort: "manual",
      expenseSorts: {},
    },
    incomes: Array.isArray(value.incomes) ? value.incomes : [],
    categories: (Array.isArray(value.categories)
      ? value.categories
      : base.categories
    ).map((item, index) => ({
      ...item,
      sortOrder: item.sortOrder || index + 1,
      isSavings: Boolean(item.isSavings) || item.id === "default-savings",
      color: item.color || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
    })),
    expenses: (Array.isArray(value.expenses) ? value.expenses : []).map(
      (item, index) => ({
        ...item,
        amount: Number(item.amount) || 0,
        multiplier: Math.max(0.01, Number(item.multiplier) || 1),
        sortOrder: item.sortOrder || index + 1,
        group: item.group || "",
      }),
    ),
  };
}

function validateSaveFields(value) {
  const validId = (id) => typeof id === "string" && /^[a-zA-Z0-9_-]+$/.test(id);
  const numeric = (number) =>
    (typeof number === "number" || typeof number === "string") &&
    Number.isFinite(Number(number)) &&
    Number(number) >= 0;
  const collapsedCategories = value.app?.collapsedCategories;
  if (
    collapsedCategories !== undefined &&
    (!collapsedCategories ||
      typeof collapsedCategories !== "object" ||
      Array.isArray(collapsedCategories) ||
      Object.entries(collapsedCategories).some(
        ([id, collapsed]) => !validId(id) || typeof collapsed !== "boolean",
      ))
  )
    throw new Error("Invalid category collapse preferences");
  for (const key of ["incomes", "categories", "expenses"]) {
    if (value[key] !== undefined && !Array.isArray(value[key]))
      throw new Error(`Invalid ${key} list`);
    const ids = new Set();
    for (const entry of value[key] || []) {
      if (!entry || !validId(entry.id) || ids.has(entry.id))
        throw new Error(`Invalid or duplicate ${key} ID`);
      ids.add(entry.id);
      for (const name of ["name", "notes", "group", "color"]) {
        if (entry[name] !== undefined && typeof entry[name] !== "string")
          throw new Error(`Invalid ${name}`);
      }
      for (const name of ["amount", "percentage", "multiplier", "sortOrder"]) {
        if (entry[name] !== undefined && !numeric(entry[name]))
          throw new Error(`Invalid ${name}`);
      }
      if (entry.categoryId !== undefined && !validId(entry.categoryId))
        throw new Error("Invalid category reference");
      if (
        entry.frequency !== undefined &&
        !Object.hasOwn(MONTHLY_FACTORS, entry.frequency)
      )
        throw new Error("Invalid frequency");
    }
  }
  if (value.notes !== undefined && typeof value.notes !== "string")
    throw new Error("Invalid notes");
  if (
    value.app !== undefined &&
    (!value.app || typeof value.app !== "object" || Array.isArray(value.app))
  )
    throw new Error("Invalid app preferences");
  for (const name of [
    "isIncomeOpen",
    "isBudgetBoardOpen",
    "isNotesOpen",
    "isFaqOpen",
  ]) {
    if (value.app?.[name] !== undefined && typeof value.app[name] !== "boolean")
      throw new Error("Invalid section collapse preference");
  }
  if (
    value.app?.categoriesPerRow !== undefined &&
    ![1, 2, 3].includes(value.app.categoriesPerRow)
  )
    throw new Error("Invalid categories per row");
  for (const name of ["summaryPeriod", "boardPeriod", "incomePeriod"]) {
    if (
      value.app?.[name] !== undefined &&
      !SUMMARY_PERIODS.some(([period]) => period === value.app[name])
    )
      throw new Error(
        `Invalid ${name.replace("Period", "")} period`,
      );
  }
  for (const name of [
    "editingCategoryId",
    "draftCategoryId",
    "editingIncomeId",
    "draftIncomeId",
    "addingExpenseCategoryId",
    "editingExpenseId",
  ]) {
    const id = value.app?.[name];
    if (id && !validId(id)) throw new Error("Invalid editor reference");
  }
  if (
    value.app?.collapsedGroups !== undefined &&
    (!value.app.collapsedGroups ||
      typeof value.app.collapsedGroups !== "object" ||
      Array.isArray(value.app.collapsedGroups))
  )
    throw new Error("Invalid group preferences");
}

function organizationTree(state, categoryId) {
  const root = { type: "root", group: "", children: [] };
  for (const expense of sortExpenses(
    state.expenses.filter((item) => item.categoryId === categoryId),
  )) {
    let parent = root;
    let path = "";
    for (const name of splitGroupPath(expense.group)) {
      path = path ? `${path}${GROUP_SEPARATOR}${name}` : name;
      let node = parent.children.find(
        (child) => child.type === "group" && child.group === path,
      );
      if (!node) {
        node = { type: "group", group: path, children: [] };
        parent.children.push(node);
      }
      parent = node;
    }
    parent.children.push({ type: "item", id: expense.id, expense });
  }
  return root;
}

function findOrganizationNode(parent, target) {
  for (const node of parent.children) {
    if (
      node.type === target.type &&
      (node.type === "item"
        ? node.id === target.id
        : node.group === target.group)
    ) {
      return { parent, node };
    }
    if (node.children) {
      const found = findOrganizationNode(node, target);
      if (found) return found;
    }
  }
  return null;
}

function getOrganizationTargets(state, categoryId) {
  const targets = [];
  const visit = (parent) => {
    for (const node of parent.children) {
      targets.push(
        node.type === "group"
          ? { type: "group", group: node.group, label: node.group }
          : {
              type: "item",
              id: node.id,
              group: parent.group,
              label: `${parent.group ? `${parent.group}${GROUP_SEPARATOR}` : ""}${node.expense.name}`,
            },
      );
      if (node.children) visit(node);
    }
  };
  visit(organizationTree(state, categoryId));
  return targets;
}

function moveBudgetEntry(state, source, destination) {
  if (source.type === "category") {
    const categories = sortCategories(state);
    const from = categories.findIndex((category) => category.id === source.id);
    const to = categories.findIndex(
      (category) => category.id === destination.categoryId,
    );
    if (
      from < 0 ||
      to < 0 ||
      from === to ||
      !["before", "after", "swap"].includes(destination.placement)
    )
      return false;
    if (destination.placement === "swap")
      [categories[from], categories[to]] = [categories[to], categories[from]];
    else {
      const [category] = categories.splice(from, 1);
      const index = categories.findIndex(
        (item) => item.id === destination.categoryId,
      );
      categories.splice(
        index + (destination.placement === "after" ? 1 : 0),
        0,
        category,
      );
    }
    categories.forEach((category, index) => {
      category.sortOrder = index + 1;
    });
    return true;
  }
  if (
    !state.categories.some((category) => category.id === source.categoryId) ||
    !state.categories.some(
      (category) => category.id === destination.categoryId,
    ) ||
    !["append", "before", "after", "combine"].includes(destination.placement)
  )
    return false;
  const sourceRoot = organizationTree(state, source.categoryId);
  const destinationRoot =
    source.categoryId === destination.categoryId
      ? sourceRoot
      : organizationTree(state, destination.categoryId);
  const found = findOrganizationNode(sourceRoot, source);
  if (!found) return false;
  const target = destination.target
    ? findOrganizationNode(destinationRoot, destination.target)
    : null;
  let parent = destination.group
    ? findOrganizationNode(destinationRoot, {
        type: "group",
        group: destination.group,
      })?.node
    : destinationRoot;
  if (destination.placement !== "append") {
    if (!target) return false;
    parent =
      destination.placement === "combine" && target.node.type === "group"
        ? target.node
        : target.parent;
  }
  if (!parent || target?.node === found.node) return false;
  if (
    source.type === "group" &&
    source.categoryId === destination.categoryId &&
    (isGroupOrDescendant(parent.group, source.group) ||
      (target?.node.type === "group" &&
        isGroupOrDescendant(target.node.group, source.group)))
  )
    return false;

  found.parent.children.splice(found.parent.children.indexOf(found.node), 1);
  if (destination.placement === "combine" && target.node.type === "item") {
    let number = 1;
    let name;
    const existing = getOrganizationTargets(
      state,
      destination.categoryId,
    ).filter((entry) => entry.type === "group");
    do {
      name = `${parent.group ? `${parent.group}${GROUP_SEPARATOR}` : ""}New Group ${number++}`;
    } while (existing.some((entry) => entry.group === name));
    const group = {
      type: "group",
      group: name,
      children: [target.node, found.node],
    };
    parent.children.splice(parent.children.indexOf(target.node), 1, group);
  } else {
    const index =
      destination.placement === "append" || destination.placement === "combine"
        ? parent.children.length
        : parent.children.indexOf(target.node) +
          (destination.placement === "after" ? 1 : 0);
    parent.children.splice(index, 0, found.node);
  }

  const oldGroup = source.type === "group" ? source.group : "";
  const collapsed = { ...(state.app.collapsedGroups || {}) };
  const flatten = (root, categoryId) => {
    let order = 0;
    const visit = (parent, group) => {
      for (const node of parent.children) {
        if (node.type === "item") {
          node.expense.categoryId = categoryId;
          node.expense.group = group;
          node.expense.sortOrder = ++order;
        } else {
          const path = group
            ? `${group}${GROUP_SEPARATOR}${splitGroupPath(node.group).at(-1)}`
            : splitGroupPath(node.group).at(-1);
          if (oldGroup && node === found.node) {
            for (const [key, value] of Object.entries(collapsed)) {
              const prefix = `${source.categoryId}:`;
              const oldPath = key.slice(prefix.length);
              if (
                key.startsWith(prefix) &&
                isGroupOrDescendant(oldPath, oldGroup)
              ) {
                delete state.app.collapsedGroups[key];
                state.app.collapsedGroups[
                  `${categoryId}:${path}${oldPath.slice(oldGroup.length)}`
                ] = value;
              }
            }
          }
          visit(node, path);
        }
      }
    };
    visit(root, "");
  };
  state.app.collapsedGroups ||= {};
  flatten(sourceRoot, source.categoryId);
  if (sourceRoot !== destinationRoot)
    flatten(destinationRoot, destination.categoryId);
  return true;
}

function getEntryDropPlacement(position, center = "combine") {
  if (position < 1 / 3) return "before";
  if (position > 2 / 3) return "after";
  return center;
}

function getEntryGapIndex(rects, y) {
  for (let index = 1; index < rects.length; index++) {
    const previous = rects[index - 1];
    const next = rects[index];
    if (y >= previous.bottom && y <= next.top) {
      return y - previous.bottom < next.top - y ? index - 1 : index;
    }
  }
  return -1;
}

function getCategoryGapDestination(rects, x, y) {
  for (const axis of ["horizontal", "vertical"]) {
    const horizontal = axis === "horizontal";
    const candidates = rects
      .map((rect, index) => ({ rect, index }))
      .filter(({ rect }) =>
        horizontal
          ? y >= rect.top && y <= rect.bottom
          : x >= rect.left && x <= rect.right,
      )
      .sort((a, b) =>
        horizontal ? a.rect.left - b.rect.left : a.rect.top - b.rect.top,
      );
    const position = horizontal ? x : y;
    const index = getEntryGapIndex(
      candidates.map(({ rect }) =>
        horizontal ? { top: rect.left, bottom: rect.right } : rect,
      ),
      position,
    );
    if (index < 0) continue;
    const target = candidates[index];
    return {
      index: target.index,
      axis,
      placement:
        position < (horizontal ? target.rect.left : target.rect.top)
          ? "before"
          : "after",
    };
  }
  return null;
}

window.budget = {
  getEntryDropPlacement,
  getEntryGapIndex,
  getCategoryGapDestination,
  APP_VERSION,
  SAVE_FILE_SCHEMA,
  FREQUENCY_OPTIONS,
  SUMMARY_PERIODS,
  CATEGORY_COLORS,
  GROUP_SEPARATOR,
  createEmptyState,
  createSeedState,
  createSavePayload,
  formatMoney,
  formatMoneyToFit,
  setCurrencyDisplay,
  setCategoryColor,
  splitGroupPath,
  isGroupOrDescendant,
  moveGroupIntoGroup,
  moveGroupToCategory,
  normalizeToMonthly,
  toPeriodAmount,
  getBudgetSummary,
  getCategoryPercentageTotal,
  getCategoryPeriodMetrics,
  formatGroupTotal,
  sortCategories,
  sortExpenses,
  normalizeSaveState,
  getOrganizationTargets,
  moveBudgetEntry,
};
