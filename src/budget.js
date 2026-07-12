const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

const DEFAULT_PAYCHECKS_PER_MONTH = 2;
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
    version: 1,
    schema: "mybudgeter-budget-v1",
    exportedAt: new Date().toISOString(),
    app: {
      paychecksPerMonth: DEFAULT_PAYCHECKS_PER_MONTH,
      categorySort: "percentage",
      expenseSort: "manual",
      expenseSorts: {},
      collapsedGroups: {},
      categoryMessage: "",
      isIncomeOpen: true,
      isBudgetBoardOpen: true,
      isCompleteSummaryOpen: true,
      notesView: "text",
      isAddingIncome: false,
      isAddingCategory: false,
      editingCategoryId: "",
      draftCategoryId: "",
      editingIncomeId: "",
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
  const periods = [
    "weekly",
    "biweekly",
    "monthly",
    "quarterly",
    "annual",
  ].reduce((result, period) => {
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

function sortCategories(state) {
  const sorted = [...state.categories];
  sorted.sort((a, b) =>
    state.app.categorySort === "name"
      ? a.name.localeCompare(b.name)
      : state.app.categorySort === "manual"
        ? (a.sortOrder || 0) - (b.sortOrder || 0)
        : b.percentage - a.percentage || a.name.localeCompare(b.name),
  );
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

window.budget = {
  FREQUENCY_OPTIONS,
  CATEGORY_COLORS,
  GROUP_SEPARATOR,
  createEmptyState,
  createSeedState,
  splitGroupPath,
  isGroupOrDescendant,
  moveGroupIntoGroup,
  moveGroupToCategory,
  normalizeToMonthly,
  toPeriodAmount,
  getBudgetSummary,
  getCategoryPercentageTotal,
  sortCategories,
  sortExpenses,
};
