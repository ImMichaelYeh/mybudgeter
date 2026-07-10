const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annually', label: 'Annually' },
  { value: 'per-paycheck', label: 'Per paycheck' },
];

const DEFAULT_PAYCHECKS_PER_MONTH = 2;
const MONTHLY_FACTORS = {
  daily: 30.4375,
  weekly: 4.34524,
  biweekly: 2.17262,
  monthly: 1,
  quarterly: 1 / 3,
  annually: 1 / 12,
  'per-paycheck': 1,
};
const DEFAULT_CATEGORIES = [
  { id: 'default-needs', name: 'Needs', percentage: 50, sortOrder: 1 },
  { id: 'default-wants', name: 'Wants', percentage: 30, sortOrder: 2 },
  { id: 'default-savings', name: 'Savings', percentage: 20, sortOrder: 3 },
];

function createEmptyState() {
  return {
    version: 1,
    schema: 'mybudgeter-budget-v1',
    exportedAt: new Date().toISOString(),
    app: {
      paychecksPerMonth: DEFAULT_PAYCHECKS_PER_MONTH,
      selectedPeriod: 'monthly',
      categorySort: 'percentage',
      expenseSort: 'name',
      categoryMessage: '',
      isIncomeOpen: true,
      isAddingCategory: false,
      editingCategoryId: '',
      addingExpenseCategoryId: '',
    },
    incomes: [],
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    expenses: [],
  };
}

function createSeedState() {
  return createEmptyState();
}

function normalizeToMonthly(amount, frequency, paychecksPerMonth = DEFAULT_PAYCHECKS_PER_MONTH) {
  if (frequency === 'per-paycheck') {
    return amount * paychecksPerMonth;
  }
  return amount * MONTHLY_FACTORS[frequency];
}

function toPeriodAmount(amount, frequency, period, paychecksPerMonth = DEFAULT_PAYCHECKS_PER_MONTH) {
  const monthlyAmount = normalizeToMonthly(amount, frequency, paychecksPerMonth);
  switch (period) {
    case 'annual':
      return monthlyAmount * 12;
    case 'quarterly':
      return monthlyAmount * 3;
    case 'monthly':
      return monthlyAmount;
    case 'weekly':
      return monthlyAmount / 4.34524;
    case 'biweekly':
      return monthlyAmount / 2.17262;
    case 'per-paycheck':
      return monthlyAmount / paychecksPerMonth;
    default:
      return monthlyAmount;
  }
}

function getBudgetSummary(state) {
  const monthlyIncome = state.incomes.reduce((total, income) => total + normalizeToMonthly(income.amount, income.frequency, state.app.paychecksPerMonth), 0);
  const monthlyExpenses = state.expenses.reduce((total, expense) => total + normalizeToMonthly(expense.amount, expense.frequency, state.app.paychecksPerMonth), 0);
  const remaining = monthlyIncome - monthlyExpenses;

  const categories = state.categories.map((category) => {
    const spent = state.expenses
      .filter((expense) => expense.categoryId === category.id)
      .reduce((total, expense) => total + normalizeToMonthly(expense.amount, expense.frequency, state.app.paychecksPerMonth), 0);
    const target = (monthlyIncome * category.percentage) / 100;
    const usage = target === 0 ? 0 : (spent / target) * 100;
    const remainingBudget = target - spent;

    return {
      ...category,
      monthlyTarget: target,
      monthlySpent: spent,
      monthlyRemaining: remainingBudget,
      usagePercent: usage,
    };
  });

  const periods = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'].reduce((accumulator, period) => {
    const income = state.incomes.reduce((total, income) => total + toPeriodAmount(income.amount, income.frequency, period, state.app.paychecksPerMonth), 0);
    const expenses = state.expenses.reduce((total, expense) => total + toPeriodAmount(expense.amount, expense.frequency, period, state.app.paychecksPerMonth), 0);
    accumulator[period] = {
      income,
      expenses,
      remaining: income - expenses,
    };
    return accumulator;
  }, {});

  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyRemaining: remaining,
    categories,
    periods,
  };
}

function getCategoryPercentageTotal(state) {
  return state.categories.reduce((total, category) => total + (Number(category.percentage) || 0), 0);
}

function sortCategories(state) {
  const categories = [...state.categories];
  categories.sort((a, b) => {
    return b.percentage - a.percentage || a.name.localeCompare(b.name);
  });

  return categories;
}

function sortExpenses(expenses, sort) {
  const sorted = [...expenses];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'amount':
        return b.amount - a.amount;
      case 'frequency':
        return a.frequency.localeCompare(b.frequency);
      case 'name':
      default:
        return a.name.localeCompare(b.name);
    }
  });

  return sorted;
}

window.budget = {
  FREQUENCY_OPTIONS,
  createEmptyState,
  createSeedState,
  normalizeToMonthly,
  toPeriodAmount,
  getBudgetSummary,
  getCategoryPercentageTotal,
  sortCategories,
  sortExpenses,
};
