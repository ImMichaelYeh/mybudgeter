const STORAGE_KEY = 'mybudgeter-save-v1';
const app = document.querySelector('#app');
const budget = window.budget;
let currentState = null;
let pendingSave = null;

function createSavePayload(state) {
  return { ...state, exportedAt: new Date().toISOString() };
}

function downloadSaveFile(state) {
  const blob = new Blob([JSON.stringify(createSavePayload(state), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'mybudgeter-save.json';
  link.click();
  URL.revokeObjectURL(url);
}

async function writeAutosaveFile(payload) {
  if (!navigator.storage?.getDirectory) {
    return;
  }
  try {
    const directory = await navigator.storage.getDirectory();
    const file = await directory.getFileHandle('savefile.json', { create: true });
    const writable = await file.createWritable();
    await writable.write(JSON.stringify(payload, null, 2));
    await writable.close();
  } catch (error) {
    console.warn('Unable to write browser autosave file', error);
  }
}

function queueSave(state) {
  pendingSave = state;
  if (!window.requestIdleCallback) {
    window.setTimeout(() => flushSave(), 0);
    return;
  }
  window.requestIdleCallback(() => flushSave());
}

function flushSave() {
  if (!pendingSave) {
    return;
  }
  const state = pendingSave;
  pendingSave = null;
  const payload = createSavePayload(state);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  void writeAutosaveFile(payload);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return budget.createEmptyState();
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schema !== 'mybudgeter-budget-v1') {
      return budget.createEmptyState();
    }
    return parsed;
  } catch {
    return budget.createEmptyState();
  }
}

function saveState(state) {
  queueSave(state);
}

function render(state) {
  if (!app) {
    return;
  }

  currentState = state;
  const summary = budget.getBudgetSummary(state);
  const orderedCategories = budget.sortCategories(state);
  const orderedExpenses = budget.sortExpenses(state.expenses, state.app.expenseSort);

  app.innerHTML = window.renderApp(state, summary, orderedCategories, orderedExpenses);
  wireEvents(state);
}

function wireEvents(state) {
  const incomeForm = document.querySelector('#income-form');
  const categoryForm = document.querySelector('#category-form');
  const expenseSortSelect = document.querySelector('#expense-sort-select');
  const importSaveInput = document.querySelector('[data-import-save]');

  importSaveInput?.addEventListener('change', async () => {
    const file = importSaveInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const importedState = JSON.parse(await file.text());
      if (importedState.schema !== 'mybudgeter-budget-v1') {
        throw new Error('Unsupported save file');
      }
      currentState = importedState;
      saveState(currentState);
      render(currentState);
    } catch (error) {
      window.alert('That does not look like a mybudgeter save file.');
      console.warn('Unable to import save file', error);
    } finally {
      importSaveInput.value = '';
    }
  });

  incomeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(incomeForm);
    const income = {
      id: crypto.randomUUID(),
      name: String(formData.get('name') || '').trim(),
      amount: Number(formData.get('amount') || 0),
      frequency: String(formData.get('frequency') || 'monthly'),
      notes: String(formData.get('notes') || '').trim(),
    };
    if (!income.name || income.amount <= 0) {
      return;
    }
    state.incomes.push(income);
    saveState(state);
    render(state);
  });

  categoryForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(categoryForm);
    const category = {
      id: crypto.randomUUID(),
      name: String(formData.get('name') || '').trim(),
      percentage: Math.max(0, Number(formData.get('percentage') || 0)),
      sortOrder: state.categories.length + 1,
    };
    if (!category.name || category.percentage <= 0) {
      return;
    }
    state.categories = [...state.categories, category];
    state.app.categoryMessage = '';
    state.app.isAddingCategory = false;
    saveState(state);
    render(state);
  });

  document.querySelectorAll('[data-edit-category-form]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const categoryId = form.dataset.editCategoryForm;
      const category = state.categories.find((item) => item.id === categoryId);
      if (!category) {
        return;
      }
      const formData = new FormData(form);
      const name = String(formData.get('name') || '').trim();
      const nextPercentage = Math.max(0, Number(formData.get('percentage') || 0));
      if (!name || nextPercentage <= 0) {
        return;
      }
      state.categories = state.categories.map((item) => (item.id === categoryId ? { ...item, name, percentage: nextPercentage } : item));
      state.app.editingCategoryId = '';
      state.app.categoryMessage = '';
      saveState(state);
      render(state);
    });
  });

  document.querySelectorAll('.expense-form').forEach((form) => {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const expense = {
        id: crypto.randomUUID(),
        name: String(formData.get('name') || '').trim(),
        amount: Number(formData.get('amount') || 0),
        frequency: String(formData.get('frequency') || 'monthly'),
        categoryId: String(form.dataset.categoryId || state.categories[0]?.id || ''),
        notes: String(formData.get('notes') || '').trim(),
      };
      if (!expense.name || expense.amount <= 0 || !expense.categoryId) {
        return;
      }
      state.expenses.push(expense);
      state.app.addingExpenseCategoryId = '';
      saveState(state);
      render(state);
    });
  });

  expenseSortSelect?.addEventListener('change', () => {
    state.app.expenseSort = expenseSortSelect.value;
    saveState(state);
    render(state);
  });

}

if (app) {
  app.addEventListener('click', (event) => {
    const removeIncomeButton = event.target.closest('[data-remove-income]');
    const removeCategoryButton = event.target.closest('[data-remove-category]');
    const removeExpenseButton = event.target.closest('[data-remove-expense]');
    const downloadSaveButton = event.target.closest('[data-download-save]');
    const showCategoryFormButton = event.target.closest('[data-show-category-form]');
    const cancelCategoryButton = event.target.closest('[data-cancel-category]');
    const toggleIncomeButton = event.target.closest('[data-toggle-income]');
    const editCategoryButton = event.target.closest('[data-edit-category]');
    const cancelEditCategoryButton = event.target.closest('[data-cancel-edit-category]');
    const showExpenseFormButton = event.target.closest('[data-show-expense-form]');
    const cancelExpenseButton = event.target.closest('[data-cancel-expense]');

    if (downloadSaveButton && currentState) {
      downloadSaveFile(currentState);
      return;
    }

    if (toggleIncomeButton && currentState) {
      currentState.app.isIncomeOpen = currentState.app.isIncomeOpen === false;
      saveState(currentState);
      render(currentState);
      return;
    }

    if (showCategoryFormButton && currentState) {
      currentState.app.isAddingCategory = true;
      render(currentState);
      return;
    }

    if (cancelCategoryButton && currentState) {
      currentState.app.isAddingCategory = false;
      render(currentState);
      return;
    }

    if (editCategoryButton && currentState) {
      currentState.app.editingCategoryId = editCategoryButton.dataset.editCategory;
      render(currentState);
      return;
    }

    if (cancelEditCategoryButton && currentState) {
      currentState.app.editingCategoryId = '';
      render(currentState);
      return;
    }

    if (showExpenseFormButton && currentState) {
      currentState.app.addingExpenseCategoryId = showExpenseFormButton.dataset.showExpenseForm;
      render(currentState);
      return;
    }

    if (cancelExpenseButton && currentState) {
      currentState.app.addingExpenseCategoryId = '';
      render(currentState);
      return;
    }

    if (removeIncomeButton && currentState) {
      currentState.incomes = currentState.incomes.filter((income) => income.id !== removeIncomeButton.dataset.removeIncome);
      saveState(currentState);
      render(currentState);
      return;
    }

    if (removeCategoryButton && currentState) {
      const categoryId = removeCategoryButton.dataset.removeCategory;
      currentState.categories = currentState.categories.filter((category) => category.id !== categoryId);
      currentState.expenses = currentState.expenses.filter((expense) => expense.categoryId !== categoryId);
      saveState(currentState);
      render(currentState);
      return;
    }

    if (removeExpenseButton && currentState) {
      currentState.expenses = currentState.expenses.filter((expense) => expense.id !== removeExpenseButton.dataset.removeExpense);
      saveState(currentState);
      render(currentState);
    }
  });
}

currentState = loadState();
saveState(currentState);
render(currentState);
