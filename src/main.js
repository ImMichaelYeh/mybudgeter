const STORAGE_KEY = 'mybudgeter-save-v1';
const app = document.querySelector('#app');
const budget = window.budget;
let currentState;
let pendingSave;
let saveTimer;
let draggedType = '';
let draggedExpenseId = '';
let draggedGroupName = '';
let draggedGroupCategoryId = '';
let itemGroupDropMode = '';
let itemDropMode = '';
let groupItemDropMode = '';
let categoryDropMode = '';
let draggedCategoryId = '';
let withinGroupDropMode = '';
let crossCategoryDropMode = '';
let categoryToFocus = '';
const DELETE_CONFIRM_KEY = 'mybudgeter-delete-confirm-until';

const id = () => crypto.randomUUID();
const createSavePayload = (state) => ({ ...state, exportedAt: new Date().toISOString() });

function addDraftExpense(state, categoryId, group = '') {
  const expense = { id: id(), name: 'New Item', amount: 0, multiplier: 1, frequency: 'monthly', categoryId, group, sortOrder: state.expenses.length + 1 };
  state.expenses.push(expense); state.app.editingExpenseId = ''; state.app.addingExpenseCategoryId = ''; state.app.addingExpenseGroup = '';
}

function confirmDeletion(message, onConfirm) {
  if (Number(sessionStorage.getItem(DELETE_CONFIRM_KEY)) > Date.now()) { onConfirm(); return; }
  const backdrop = document.createElement('div'); backdrop.className = 'delete-dialog-backdrop';
  const dialog = document.createElement('section'); dialog.className = 'delete-dialog';
  const text = document.createElement('p'); text.textContent = message;
  const option = document.createElement('label'); option.className = 'check'; const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; option.append(checkbox, ' Do Not Ask Again For 5 Minutes');
  const actions = document.createElement('div'); actions.className = 'actions'; const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = 'Cancel'; const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'delete-button'; remove.textContent = 'Delete'; actions.append(cancel, remove);
  dialog.append(text, option, actions); backdrop.append(dialog); document.body.append(backdrop);
  cancel.addEventListener('click', () => backdrop.remove());
  remove.addEventListener('click', () => { if (checkbox.checked) sessionStorage.setItem(DELETE_CONFIRM_KEY, String(Date.now() + 5 * 60 * 1000)); backdrop.remove(); onConfirm(); });
}

function moveItemBesideGroup(state, categoryId, itemId, group, placement) {
  const units = [];
  const byKey = new Map();
  budget.sortExpenses(state.expenses.filter((expense) => expense.categoryId === categoryId), 'manual').forEach((expense) => {
    const key = expense.group ? `group:${expense.group}` : `item:${expense.id}`;
    if (!byKey.has(key)) { const unit = { key, items: [] }; byKey.set(key, unit); units.push(unit); }
    byKey.get(key).items.push(expense);
  });
  const sourceIndex = units.findIndex((unit) => unit.key === `item:${itemId}`);
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex((unit) => unit.key === `group:${group}`);
  if (targetIndex < 0) return false;
  units.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source);
  units.flatMap((unit) => unit.items).forEach((expense, index) => { expense.sortOrder = index + 1; });
  return true;
}

function moveItemBesideItem(state, categoryId, sourceId, targetId, placement) {
  const units = [];
  const byKey = new Map();
  budget.sortExpenses(state.expenses.filter((expense) => expense.categoryId === categoryId), 'manual').forEach((expense) => {
    const key = expense.group ? `group:${expense.group}` : `item:${expense.id}`;
    if (!byKey.has(key)) { const unit = { key, items: [] }; byKey.set(key, unit); units.push(unit); }
    byKey.get(key).items.push(expense);
  });
  const sourceIndex = units.findIndex((unit) => unit.key === `item:${sourceId}`);
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex((unit) => unit.key === `item:${targetId}`);
  if (targetIndex < 0) return false;
  units.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source);
  units.flatMap((unit) => unit.items).forEach((expense, index) => { expense.sortOrder = index + 1; });
  return true;
}

function moveGroupBesideItem(state, categoryId, group, targetId, placement) {
  const units = [];
  const byKey = new Map();
  budget.sortExpenses(state.expenses.filter((expense) => expense.categoryId === categoryId), 'manual').forEach((expense) => {
    const key = expense.group ? `group:${expense.group}` : `item:${expense.id}`;
    if (!byKey.has(key)) { const unit = { key, items: [] }; byKey.set(key, unit); units.push(unit); }
    byKey.get(key).items.push(expense);
  });
  const sourceIndex = units.findIndex((unit) => unit.key === `group:${group}`);
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex((unit) => unit.key === `item:${targetId}`);
  if (targetIndex < 0) return false;
  units.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source);
  units.flatMap((unit) => unit.items).forEach((expense, index) => { expense.sortOrder = index + 1; });
  return true;
}

function moveGroupBesideGroup(state, categoryId, sourceGroup, targetGroup, placement) {
  const units = [];
  const byKey = new Map();
  budget.sortExpenses(state.expenses.filter((expense) => expense.categoryId === categoryId), 'manual').forEach((expense) => {
    const key = expense.group ? `group:${expense.group}` : `item:${expense.id}`;
    if (!byKey.has(key)) { const unit = { key, items: [] }; byKey.set(key, unit); units.push(unit); }
    byKey.get(key).items.push(expense);
  });
  const sourceIndex = units.findIndex((unit) => unit.key === `group:${sourceGroup}`);
  if (sourceIndex < 0) return false;
  const [source] = units.splice(sourceIndex, 1);
  const targetIndex = units.findIndex((unit) => unit.key === `group:${targetGroup}`);
  if (targetIndex < 0) return false;
  units.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source);
  units.flatMap((unit) => unit.items).forEach((expense, index) => { expense.sortOrder = index + 1; });
  return true;
}

function nextGroupName(state, categoryId) {
  const groups = new Set(state.expenses.filter((expense) => expense.categoryId === categoryId).map((expense) => expense.group).filter(Boolean));
  let index = 1; let name = 'New Group';
  while (groups.has(name)) name = `New Group ${++index}`;
  return name;
}

function renderMarkdown(value) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const inline = (text) => escape(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return String(value || '').split(/\r?\n/).map((line) => {
    if (/^##\s+/.test(line)) return `<h3>${inline(line.replace(/^##\s+/, ''))}</h3>`;
    if (/^#\s+/.test(line)) return `<h2>${inline(line.replace(/^#\s+/, ''))}</h2>`;
    if (/^[-*+]\s+/.test(line)) return `<div class="markdown-list">• ${inline(line.replace(/^[-*+]\s+/, ''))}</div>`;
    if (/^\d+[.)]\s+/.test(line)) return `<div class="markdown-list">${inline(line)}</div>`;
    return line ? `<p>${inline(line)}</p>` : '<br>';
  }).join('');
}

function moveItemWithinGroup(state, categoryId, group, sourceId, targetId, placement) {
  const items = budget.sortExpenses(state.expenses.filter((expense) => expense.categoryId === categoryId && expense.group === group), 'manual');
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return false;
  const slots = items.map((item) => item.sortOrder);
  const [source] = items.splice(sourceIndex, 1);
  const destinationIndex = items.findIndex((item) => item.id === targetId);
  items.splice(placement === 'before' ? destinationIndex : destinationIndex + 1, 0, source);
  items.forEach((item, index) => { item.sortOrder = slots[index]; });
  return true;
}

function moveCategory(state, sourceId, targetId, placement) {
  const categories = [...state.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const sourceIndex = categories.findIndex((category) => category.id === sourceId);
  if (sourceIndex < 0) return false;
  const [source] = categories.splice(sourceIndex, 1);
  const targetIndex = categories.findIndex((category) => category.id === targetId);
  if (targetIndex < 0) return false;
  categories.splice(placement === 'before' ? targetIndex : targetIndex + 1, 0, source);
  categories.forEach((category, index) => { category.sortOrder = index + 1; });
  return true;
}

function downloadSaveFile(state) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(createSavePayload(state), null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'mybudgeter-save.json'; link.click(); URL.revokeObjectURL(url);
}

function normalizeState(value) {
  const base = budget.createEmptyState();
  if (!value || value.schema !== base.schema) throw new Error('Unsupported save file');
  return { ...base, ...value, app: { ...base.app, ...(value.app || {}), isAddingCategory: false, expenseSort: 'manual', expenseSorts: {} }, incomes: Array.isArray(value.incomes) ? value.incomes : [], categories: (Array.isArray(value.categories) ? value.categories : base.categories).map((item, index) => ({ ...item, sortOrder: item.sortOrder || index + 1, isSavings: Boolean(item.isSavings) || item.id === 'default-savings', color: item.color || budget.CATEGORY_COLORS[index % budget.CATEGORY_COLORS.length] })), expenses: (Array.isArray(value.expenses) ? value.expenses : []).map((item, index) => ({ ...item, amount: Number(item.amount) || 0, multiplier: Math.max(0.01, Number(item.multiplier) || 1), sortOrder: item.sortOrder || index + 1, group: item.group || '' })) };
}

function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? normalizeState(JSON.parse(raw)) : budget.createEmptyState(); } catch { return budget.createEmptyState(); }
}

function saveState(state) {
  pendingSave = createSavePayload(state);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingSave)); pendingSave = null; showSaved(); }, 150);
}

function showSaved() {
  const status = document.querySelector('[data-save-status]');
  if (!status) return;
  status.textContent = 'Saved'; status.classList.add('visible');
  setTimeout(() => status.classList.remove('visible'), 1400);
}

function render(state) {
  currentState = state;
  app.innerHTML = window.renderApp(state, budget.getBudgetSummary(state), budget.sortCategories(state), budget.sortExpenses(state.expenses, state.app.expenseSort));
  wireEvents(state);
  const footer = document.createElement('footer');
  footer.className = 'app-footer';
  footer.innerHTML = `Michael Yeh <span aria-hidden="true">&copy;</span> ${new Date().getFullYear()}`;
  app.append(footer);
  if (categoryToFocus) {
    document.querySelector(`[data-category-id="${categoryToFocus}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    categoryToFocus = '';
  }
  state.categories.forEach((category) => document.querySelector(`[data-category-id="${category.id}"]`)?.style.setProperty('--accent', category.color));
}

function formValues(form) {
  const data = new FormData(form);
  return { name: String(data.get('name') || '').trim(), amount: Number(data.get('amount') || 0), multiplier: Math.max(0.01, Number(data.get('multiplier') || 1)), frequency: String(data.get('frequency') || 'biweekly'), group: String(data.get('group') || '').trim() };
}

function showFormError(form, message) {
  let error = form.querySelector('.form-error');
  if (!error) { error = document.createElement('div'); error.className = 'form-error'; form.append(error); }
  error.textContent = message;
}

function wireEvents(state) {
  if (state.app.expenseSort === 'group') state.app.expenseSort = 'manual';
  Object.keys(state.app.expenseSorts || {}).forEach((categoryId) => { if (state.app.expenseSorts[categoryId] === 'group') state.app.expenseSorts[categoryId] = 'manual'; });
  const cards = [...document.querySelectorAll('.card')];
  const incomeToggle = document.querySelector('[data-toggle-income]');
  if (incomeToggle) cards[0]?.querySelector('.section-heading')?.append(incomeToggle);
  const formatCurrency = (value) => `$${Number(value || 0).toFixed(2)}`;
  const summary = budget.getBudgetSummary(state);
  const makeCollapsible = (card, isOpen, toggleName, details) => {
    if (!card) return;
    const heading = card.querySelector('.section-heading');
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'link-button hint'; toggle.dataset[toggleName] = 'true'; toggle.textContent = isOpen ? 'click to collapse' : 'click to expand'; heading?.append(toggle);
    const compact = document.createElement('div'); compact.className = 'collapsed-summary'; compact.textContent = details; compact.hidden = isOpen; card.append(compact);
    [...card.children].forEach((child) => { if (child !== heading && child !== compact) child.hidden = !isOpen; });
  };
  makeCollapsible(cards[1], state.app.isBudgetBoardOpen !== false, 'toggleBudgetBoard', `${state.categories.length} Categories · Monthly Spending ${formatCurrency(summary.monthlyExpenses)} · Monthly Savings ${formatCurrency(summary.monthlySavings)}`);
  const notesCard = document.createElement('section'); notesCard.className = 'card notes-card';
  const notesView = ['text', 'markdown', 'preview'].includes(state.app.notesView) ? state.app.notesView : 'text';
  const notesHeading = document.createElement('div'); notesHeading.className = 'section-heading'; notesHeading.innerHTML = `<div><h2>Notes</h2><p class="small">${notesView === 'markdown' ? 'Markdown mode: use formatting syntax, then view the formatted result.' : notesView === 'preview' ? 'Formatted Markdown preview.' : 'Simple text notes. Switch to Markdown mode when you need formatting.'}</p></div>`;
  const modeButton = document.createElement('button'); modeButton.type = 'button'; modeButton.className = 'secondary'; modeButton.textContent = notesView === 'text' ? 'Markdown Mode' : notesView === 'markdown' ? 'View Formatted Notes' : 'Edit Notes'; notesHeading.append(modeButton);
  notesCard.append(notesHeading);
  if (notesView === 'preview') { const preview = document.createElement('div'); preview.className = 'markdown-preview'; preview.innerHTML = renderMarkdown(state.notes) || '<p class="small">No notes yet.</p>'; notesCard.append(preview); }
  else { const editor = document.createElement('textarea'); editor.className = 'notes-textarea'; editor.value = state.notes || ''; editor.placeholder = notesView === 'markdown' ? '# Heading\n\n- Bullet\n\n**Bold** and *italic*' : 'Write your notes here…'; notesCard.append(editor); editor.addEventListener('input', () => { state.notes = editor.value; saveState(state); }); }
  app?.append(notesCard);
  modeButton.addEventListener('click', () => { state.app.notesView = notesView === 'text' ? 'markdown' : notesView === 'markdown' ? 'preview' : 'text'; saveState(state); render(state); });
  const simpleNotesHeading = document.createElement('div'); simpleNotesHeading.className = 'section-heading'; simpleNotesHeading.innerHTML = '<div><h2>Notes</h2><p class="small">Personal notes are saved with your budget.</p></div>';
  const simpleNotesEditor = document.createElement('textarea'); simpleNotesEditor.className = 'notes-textarea'; simpleNotesEditor.value = state.notes || ''; simpleNotesEditor.placeholder = 'Write your notes here';
  simpleNotesEditor.addEventListener('input', () => { state.notes = simpleNotesEditor.value; saveState(state); });
  notesCard.replaceChildren(simpleNotesHeading, simpleNotesEditor);
  const saveActions = document.querySelector('header .actions');
  if (saveActions) {
    const help = document.createElement('p');
    help.className = 'save-help';
    help.innerHTML = 'Download the autosave file for a safe backup.<br>Importing a save file replaces the current budget.';
    saveActions.append(help);
  }
  const categoryMeta = document.querySelector('.category-form-meta');
  if (categoryMeta) {
    const overage = budget.getCategoryPercentageTotal(state) - 100;
    categoryMeta.hidden = overage <= 0;
    categoryMeta.replaceChildren();
    if (overage > 0) {
      const warning = document.createElement('span');
      warning.className = 'message';
      warning.textContent = `Warning: category targets exceed 100% by ${overage.toFixed(1)}%.`;
      categoryMeta.append(warning);
    }
  }
  summary.categories.forEach((category) => {
    const column = document.querySelector(`[data-category-id="${category.id}"]`);
    const progress = column?.querySelector('.progress-bar');
    if (!progress) return;
    const label = document.createElement('strong');
    label.className = 'progress-label';
    label.textContent = `${category.usagePercent.toFixed(1)}%`;
    progress.append(label);
    const heading = column.querySelector('.column-header p');
    if (heading) heading.textContent = `Budget ${category.percentage}% · Actual ${(summary.monthlyIncome ? category.monthlySpent / summary.monthlyIncome * 100 : 0).toFixed(1)}% · ${category.isSavings ? 'Savings' : 'Expenses'}`;
  });
  document.querySelectorAll('.expense-toolbar').forEach((toolbar) => toolbar.remove());
  const addCategoryButton = document.querySelector('[data-show-category-form]');
  const board = document.querySelector('.board');
  if (board && addCategoryButton) board.append(addCategoryButton);
  document.querySelectorAll('.expense-list').forEach((list) => {
    const categoryId = list.closest('[data-category-id]')?.dataset.categoryId;
    const groups = new Map();
    const nodes = [];
    [...list.children].forEach((item) => {
      const expenseId = item.dataset.expenseId || item.dataset.editExpenseForm;
      const group = state.expenses.find((expense) => expense.id === expenseId)?.group?.trim();
      if (!group) { nodes.push(item); return; }
      let container = groups.get(group);
      if (!container) {
        const groupKey = `${categoryId}:${group}`;
        const isCollapsed = state.app.collapsedGroups?.[groupKey] === true;
        const groupTotal = state.expenses.filter((expense) => expense.categoryId === categoryId && expense.group?.trim() === group).reduce((total, expense) => total + budget.normalizeToMonthly(expense.amount * expense.multiplier, expense.frequency, state.app.paychecksPerMonth), 0);
        container = document.createElement('section'); container.className = `item-group${isCollapsed ? ' collapsed' : ''}`; container.draggable = true; container.dataset.groupName = group;
        const header = document.createElement('div'); header.className = 'item-group-header';
        const heading = document.createElement('h4'); heading.textContent = group;
        const total = document.createElement('strong'); total.className = 'group-total'; total.textContent = `${formatCurrency(groupTotal)} / Month`;
        const rename = document.createElement('button'); rename.type = 'button'; rename.className = 'ghost small-button'; rename.dataset.renameGroup = group; rename.textContent = 'Edit';
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'ghost small-button'; remove.dataset.removeGroup = group; remove.textContent = '×';
        const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'ghost small-button group-toggle'; toggle.dataset.toggleGroup = group; toggle.title = isCollapsed ? 'Expand Group' : 'Collapse Group'; toggle.setAttribute('aria-label', toggle.title); toggle.innerHTML = isCollapsed ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>';
        const items = document.createElement('div'); items.className = 'item-group-items';
        const add = document.createElement('button'); add.type = 'button'; add.className = 'expense-add-button group-add-button'; add.dataset.addGroupItem = group; add.textContent = '+ Add Item';
        const actions = document.createElement('div'); actions.className = 'actions'; actions.append(rename, remove);
        header.append(toggle, heading, total, actions); container.append(header, items, add); groups.set(group, container); nodes.push(container);
      }
      container.querySelector('.item-group-items').append(item);
    });
    if (categoryId && groups.size) list.replaceChildren(...nodes);
  });
  const incomeForm = document.querySelector('#income-form');
  if (incomeForm) {
    incomeForm.elements.name.placeholder = 'Income Source';
    if (state.app.isAddingIncome !== true) {
      const addIncomeButton = document.createElement('button');
      addIncomeButton.type = 'button'; addIncomeButton.className = 'income-add-button'; addIncomeButton.dataset.showIncomeForm = 'true'; addIncomeButton.textContent = 'Add income';
      incomeForm.parentNode.insertBefore(addIncomeButton, incomeForm);
      incomeForm.remove();
    } else {
      const saveIncomeButton = incomeForm.querySelector('button[type="submit"]');
      saveIncomeButton?.replaceChildren('Save income');
      if (saveIncomeButton) saveIncomeButton.dataset.incomeSave = 'true';
      const cancelIncomeButton = document.createElement('button');
      cancelIncomeButton.type = 'button'; cancelIncomeButton.dataset.cancelIncome = 'true'; cancelIncomeButton.className = 'secondary'; cancelIncomeButton.textContent = 'Cancel';
      incomeForm.append(cancelIncomeButton);
    }
  }
  document.querySelectorAll('.expense-form, [data-edit-expense-form]').forEach((form) => { form.noValidate = true; });
  const editingCategory = state.categories.find((category) => category.id === state.app.editingCategoryId);
  if (editingCategory) {
    const header = document.querySelector(`[data-category-id="${editingCategory.id}"] .column-header`);
    if (header) {
      const form = document.createElement('form'); form.noValidate = true;
      form.className = 'category-edit-form'; form.dataset.editCategoryForm = editingCategory.id;
      const row = document.createElement('div'); row.className = 'field-row';
      const name = document.createElement('input'); name.name = 'name'; name.value = editingCategory.name; name.required = true;
      const percentage = document.createElement('input'); percentage.name = 'percentage'; percentage.type = 'number'; percentage.min = '0'; percentage.step = '0.1'; percentage.value = editingCategory.percentage; percentage.required = true;
      const savings = document.createElement('label'); savings.className = 'check'; const checkbox = document.createElement('input'); checkbox.name = 'isSavings'; checkbox.type = 'checkbox'; checkbox.checked = editingCategory.isSavings || editingCategory.name.trim().toLowerCase() === 'savings'; savings.append(checkbox, ' Savings Category');
      const actions = document.createElement('div'); actions.className = 'actions'; const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save'; const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.dataset.cancelEditCategory = 'true'; cancel.textContent = 'Cancel'; actions.append(save, cancel);
      row.append(name, percentage); form.append(row, savings, actions); header.replaceWith(form);
    }
  }
  document.querySelectorAll('form').forEach((form) => {
    form.querySelectorAll('input:not([type="checkbox"]), select, textarea').forEach((field) => {
      if (field.name === 'multiplier') {
        field.min = '1'; field.step = '1';
        field.addEventListener('keydown', (event) => {
          if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
          event.preventDefault();
          const value = Number(field.value) || 0;
          field.value = event.key === 'ArrowUp' ? String(Math.floor(value) + 1) : String(Math.max(1, Math.ceil(value) - 1));
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
      if (field.parentElement?.classList.contains('input-label')) return;
      const label = document.createElement('label');
      label.className = 'input-label';
      label.textContent = field.name === 'name' && (form.id === 'income-form' || form.classList.contains('income-edit-form')) ? 'Income Source' : ({ amount: 'Amount', multiplier: 'Quantity', frequency: 'Frequency', notes: 'Notes', group: 'Group (Optional)', percentage: 'Budget Percentage', name: 'Name' }[field.name] || 'Value');
      field.replaceWith(label);
      label.append(field);
    });
  });
  document.querySelectorAll('[data-edit-category-form], #category-form').forEach((form) => {
    const name = form.elements.name;
    const savings = form.elements.isSavings;
    if (!name || !savings) return;
    let manuallyChanged = false;
    savings.addEventListener('change', () => { manuallyChanged = true; });
    name.addEventListener('input', () => { if (!manuallyChanged && name.value.trim().toLowerCase() === 'savings') savings.checked = true; });
  });
  document.querySelectorAll('[data-edit-category-form]').forEach((form) => {
    const category = state.categories.find((item) => item.id === form.dataset.editCategoryForm);
    if (!category) return;
    const saveDraft = () => {
      category.name = form.elements.name.value;
      category.percentage = Math.max(0, Number(form.elements.percentage.value) || 0);
      category.isSavings = form.elements.isSavings.checked;
      saveState(state);
    };
    form.elements.name.addEventListener('input', saveDraft);
    form.elements.percentage.addEventListener('input', saveDraft);
    form.elements.isSavings.addEventListener('change', saveDraft);
  });
  document.querySelectorAll('[data-expense-id]').forEach((row) => {
    const expense = state.expenses.find((item) => item.id === row.dataset.expenseId);
    if (!expense || Number(expense.multiplier) === 1) return;
    const detail = row.querySelector('.small');
    if (detail) detail.textContent = `${formatCurrency(expense.amount)} × ${expense.multiplier} = ${formatCurrency(expense.amount * expense.multiplier)} · ${expense.frequency}`;
  });
  document.querySelectorAll('[data-duplicate-expense]').forEach((button) => button.remove());
  if (state.app.addingExpenseGroup) document.querySelector('.expense-form')?.elements.group && (document.querySelector('.expense-form').elements.group.value = state.app.addingExpenseGroup);
  document.querySelector('#income-form')?.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const income = { id: id(), name: String(data.get('name') || '').trim(), amount: Number(data.get('amount') || 0), frequency: String(data.get('frequency') || 'biweekly'), notes: String(data.get('notes') || '').trim() }; if (!income.name || income.amount <= 0) return; state.incomes.push(income); state.app.isAddingIncome = false; saveState(state); render(state); });
  document.querySelectorAll('[data-edit-income-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(form); const income = state.incomes.find((item) => item.id === form.dataset.editIncomeForm); const name = String(data.get('name') || '').trim(); const amount = Number(data.get('amount') || 0); if (!income || !name || amount <= 0) return; Object.assign(income, { name, amount, frequency: String(data.get('frequency') || 'monthly'), notes: String(data.get('notes') || '').trim() }); state.app.editingIncomeId = ''; saveState(state); render(state); }));
  document.querySelector('#category-form')?.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const category = { id: id(), name: String(data.get('name') || '').trim(), percentage: Math.max(0, Number(data.get('percentage') || 0)), isSavings: data.get('isSavings') === 'on', sortOrder: state.categories.length + 1 }; if (!category.name || category.percentage <= 0) return; state.categories.push(category); state.app.isAddingCategory = false; saveState(state); render(state); });
  document.querySelectorAll('[data-edit-category-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const data = new FormData(form); const category = state.categories.find((item) => item.id === form.dataset.editCategoryForm); if (!category) return; const name = String(data.get('name') || '').trim(); const percentage = Math.max(0, Number(data.get('percentage') || 0)); if (!name || percentage <= 0) { form.elements.name.classList.toggle('invalid-field', !name); form.elements.percentage.classList.toggle('invalid-field', percentage <= 0); showFormError(form, 'Enter a category name and a monthly target greater than 0%.'); return; } Object.assign(category, { name, percentage, isSavings: data.get('isSavings') === 'on' }); state.app.editingCategoryId = ''; state.app.draftCategoryId = ''; saveState(state); render(state); }));
  document.querySelectorAll('.expense-form').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const data = formValues(form); if (!data.name || data.amount <= 0) return; state.expenses.push({ ...data, id: id(), categoryId: form.dataset.categoryId, sortOrder: state.expenses.length + 1 }); state.app.addingExpenseCategoryId = ''; state.app.addingExpenseGroup = ''; saveState(state); render(state); }));
  document.querySelectorAll('[data-edit-expense-form]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); const data = formValues(form); if (!data.name || data.amount <= 0) return; const expense = state.expenses.find((item) => item.id === form.dataset.editExpenseForm); if (!expense) return; Object.assign(expense, data); state.app.editingExpenseId = ''; saveState(state); render(state); }));
  document.querySelector('[data-import-save]')?.addEventListener('change', async (event) => { const file = event.target.files?.[0]; if (!file) return; try { if (!window.confirm('Importing will overwrite the current budget. Continue?')) return; currentState = normalizeState(JSON.parse(await file.text())); saveState(currentState); render(currentState); } catch { window.alert('That does not look like a mybudgeter save file.'); } finally { event.target.value = ''; } });
  document.querySelector('[data-category-sort]')?.addEventListener('change', (event) => { state.app.categorySort = event.target.value; saveState(state); render(state); });
  document.querySelectorAll('[data-expense-sort]').forEach((select) => select.addEventListener('change', (event) => { state.app.expenseSorts ||= {}; state.app.expenseSorts[event.target.dataset.expenseSort] = event.target.value; saveState(state); render(state); }));
}

app?.addEventListener('click', (event) => {
  const button = event.target.closest('button'); if (!button || !currentState) return;
  if (button.matches('[data-toggle-group]')) { const categoryId = button.closest('[data-category-id]')?.dataset.categoryId; const groupKey = `${categoryId}:${button.dataset.toggleGroup}`; currentState.app.collapsedGroups ||= {}; currentState.app.collapsedGroups[groupKey] = currentState.app.collapsedGroups[groupKey] !== true; saveState(currentState); render(currentState); return; }
  if (button.matches('[data-remove-category]')) { const categoryId = button.dataset.removeCategory; const category = currentState.categories.find((item) => item.id === categoryId); confirmDeletion(`Delete ${category?.name || 'This'} Category And All Of Its Items?`, () => { currentState.categories = currentState.categories.filter((item) => item.id !== categoryId); currentState.expenses = currentState.expenses.filter((item) => item.categoryId !== categoryId); saveState(currentState); render(currentState); }); return; }
  if (button.matches('[data-remove-expense]')) { const expenseId = button.dataset.removeExpense; confirmDeletion('Delete This Item?', () => { currentState.expenses = currentState.expenses.filter((item) => item.id !== expenseId); saveState(currentState); render(currentState); }); return; }
  if (button.matches('[data-remove-group]')) { const group = button.dataset.removeGroup; const categoryId = button.closest('[data-category-id]')?.dataset.categoryId; confirmDeletion(`Delete The ${group} Group And Its Items?`, () => { currentState.expenses = currentState.expenses.filter((item) => item.categoryId !== categoryId || item.group !== group); saveState(currentState); render(currentState); }); return; }
  if (button.matches('[data-add-group-item]')) { addDraftExpense(currentState, button.closest('[data-category-id]')?.dataset.categoryId || '', button.dataset.addGroupItem); saveState(currentState); render(currentState); return; }
  if (button.matches('[data-rename-group]')) {
    const group = button.dataset.renameGroup;
    const categoryId = button.closest('[data-category-id]')?.dataset.categoryId;
    const header = button.closest('.item-group-header');
    if (!header || !categoryId) return;
    const form = document.createElement('form'); form.className = 'group-rename-form';
    const label = document.createElement('label'); label.className = 'input-label'; label.textContent = 'Group Name';
    const input = document.createElement('input'); input.value = group; input.required = true; label.append(input);
    const actions = document.createElement('div'); actions.className = 'actions'; const save = document.createElement('button'); save.type = 'submit'; save.textContent = 'Save'; const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'secondary'; cancel.textContent = 'Cancel'; actions.append(save, cancel); form.append(label, actions);
    form.addEventListener('submit', (submitEvent) => { submitEvent.preventDefault(); const nextGroup = input.value.trim(); if (!nextGroup) return; currentState.expenses.forEach((expense) => { if (expense.categoryId === categoryId && expense.group === group) expense.group = nextGroup; }); const oldKey = `${categoryId}:${group}`; const newKey = `${categoryId}:${nextGroup}`; if (currentState.app.collapsedGroups?.[oldKey]) { currentState.app.collapsedGroups[newKey] = true; delete currentState.app.collapsedGroups[oldKey]; } saveState(currentState); render(currentState); });
    cancel.addEventListener('click', () => render(currentState));
    header.replaceWith(form); input.focus(); return;
  }
  if (button.matches('[data-download-save]')) return downloadSaveFile(currentState);
  if (button.matches('[data-income-save]')) { event.preventDefault(); const form = button.form; const data = new FormData(form); const income = { id: id(), name: String(data.get('name') || '').trim(), amount: Number(data.get('amount') || 0), frequency: String(data.get('frequency') || 'biweekly'), notes: String(data.get('notes') || '').trim() }; if (!income.name || income.amount <= 0) return; currentState.incomes.push(income); currentState.app.isAddingIncome = false; saveState(currentState); render(currentState); return; }
  if (button.matches('[data-toggle-income]')) currentState.app.isIncomeOpen = currentState.app.isIncomeOpen === false;
  else if (button.matches('[data-toggle-budget-board]')) currentState.app.isBudgetBoardOpen = currentState.app.isBudgetBoardOpen === false;
  else if (button.matches('[data-toggle-complete-summary]')) currentState.app.isCompleteSummaryOpen = currentState.app.isCompleteSummaryOpen === false;
  else if (button.matches('[data-show-income-form]')) currentState.app.isAddingIncome = true;
  else if (button.matches('[data-cancel-income]')) currentState.app.isAddingIncome = false;
  else if (button.matches('[data-show-category-form]')) { const category = { id: id(), name: '', percentage: 0, isSavings: false, color: budget.CATEGORY_COLORS[currentState.categories.length % budget.CATEGORY_COLORS.length], sortOrder: currentState.categories.length + 1 }; currentState.categories.push(category); currentState.app.isAddingCategory = false; currentState.app.editingCategoryId = category.id; currentState.app.draftCategoryId = category.id; categoryToFocus = category.id; }
  else if (button.matches('[data-cancel-category]')) currentState.app.isAddingCategory = false;
  else if (button.matches('[data-edit-category]')) currentState.app.editingCategoryId = button.dataset.editCategory;
  else if (button.matches('[data-cancel-edit-category]')) { if (currentState.app.draftCategoryId === currentState.app.editingCategoryId) currentState.categories = currentState.categories.filter((category) => category.id !== currentState.app.draftCategoryId); currentState.app.editingCategoryId = ''; currentState.app.draftCategoryId = ''; }
  else if (button.matches('[data-edit-income]')) currentState.app.editingIncomeId = button.dataset.editIncome;
  else if (button.matches('[data-cancel-edit-income]')) currentState.app.editingIncomeId = '';
  else if (button.matches('[data-show-expense-form]')) addDraftExpense(currentState, button.dataset.showExpenseForm);
  else if (button.matches('[data-cancel-expense]')) { currentState.app.addingExpenseCategoryId = ''; currentState.app.addingExpenseGroup = ''; }
  else if (button.matches('[data-edit-expense]')) currentState.app.editingExpenseId = button.dataset.editExpense;
  else if (button.matches('[data-cancel-edit-expense]')) currentState.app.editingExpenseId = '';
  else if (button.matches('[data-duplicate-expense]')) { const original = currentState.expenses.find((item) => item.id === button.dataset.duplicateExpense); if (original) currentState.expenses.push({ ...original, id: id(), name: `${original.name} copy`, sortOrder: currentState.expenses.length + 1 }); }
  else if (button.matches('[data-remove-income]')) currentState.incomes = currentState.incomes.filter((item) => item.id !== button.dataset.removeIncome);
  else if (button.matches('[data-remove-category]')) { currentState.categories = currentState.categories.filter((item) => item.id !== button.dataset.removeCategory); currentState.expenses = currentState.expenses.filter((item) => item.categoryId !== button.dataset.removeCategory); }
  else if (button.matches('[data-remove-expense]')) currentState.expenses = currentState.expenses.filter((item) => item.id !== button.dataset.removeExpense);
  else return;
  saveState(currentState); render(currentState);
});

const clearDropTargets = () => { document.querySelectorAll('.drop-target, .ungroup-drop-target, .item-drop-target, .item-swap-target, .item-combine-target, .group-drop-target, .group-combine-target, .item-group-combine-target, .item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-drop-before, .category-drop-after, .category-swap-target, .category-transfer-target').forEach((item) => item.classList.remove('drop-target', 'ungroup-drop-target', 'item-drop-target', 'item-swap-target', 'item-combine-target', 'group-drop-target', 'group-combine-target', 'item-group-combine-target', 'item-drop-before', 'item-drop-after', 'group-drop-before', 'group-drop-after', 'category-drop-before', 'category-drop-after', 'category-swap-target', 'category-transfer-target')); document.querySelectorAll('.ungroup-drop-zone').forEach((item) => item.remove()); };

app?.addEventListener('dragstart', (event) => {
  const expenseItem = event.target.closest('[data-expense-id]');
  const group = event.target.closest('[data-group-name]');
  const category = event.target.closest('[data-category-id]');
  const target = expenseItem || group || category;
  if (!target) return;
  draggedType = expenseItem ? 'expense' : group ? 'group' : 'category';
  draggedCategoryId = target.dataset.categoryId || '';
  draggedExpenseId = target.dataset.expenseId || '';
  draggedGroupName = group?.dataset.groupName || '';
  draggedGroupCategoryId = group?.closest('[data-category-id]')?.dataset.categoryId || '';
  const source = currentState.expenses.find((expense) => expense.id === draggedExpenseId);
  if (source?.group) { const list = target.closest('[data-category-id]')?.querySelector('.expense-list'); if (list) { const zone = document.createElement('div'); zone.className = 'ungroup-drop-zone'; zone.textContent = 'Drop Here To Move Out Of Group'; list.append(zone); } }
  event.dataTransfer.setData('text/plain', `${draggedType}:${target.dataset.categoryId || target.dataset.expenseId || draggedGroupName}`);
});

app?.addEventListener('dragover', (event) => {
  const category = event.target.closest('[data-category-id]');
  const item = event.target.closest('[data-expense-id]');
  const group = event.target.closest('[data-group-name]');
  if (draggedType === 'category' && category && category.dataset.categoryId !== draggedCategoryId) { event.preventDefault(); const rect = category.getBoundingClientRect(); const position = (event.clientX - rect.left) / rect.width; categoryDropMode = position < .25 ? 'before' : position > .75 ? 'after' : 'swap'; document.querySelectorAll('.category-drop-before, .category-drop-after, .category-swap-target').forEach((target) => target.classList.remove('category-drop-before', 'category-drop-after', 'category-swap-target')); category.classList.add(categoryDropMode === 'swap' ? 'category-swap-target' : `category-drop-${categoryDropMode}`); return; }
  if (draggedType === 'group' && category && category.dataset.categoryId !== draggedGroupCategoryId) { event.preventDefault(); crossCategoryDropMode = ''; const dropTarget = group || item; if (dropTarget) { const rect = dropTarget.getBoundingClientRect(); const position = (event.clientY - rect.top) / rect.height; crossCategoryDropMode = position < .25 ? 'before' : position > .75 ? 'after' : 'into'; document.querySelectorAll('.item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-transfer-target').forEach((target) => target.classList.remove('item-drop-before', 'item-drop-after', 'group-drop-before', 'group-drop-after', 'category-transfer-target')); if (crossCategoryDropMode === 'before' || crossCategoryDropMode === 'after') dropTarget.classList.add(group ? `item-drop-${crossCategoryDropMode}` : `group-drop-${crossCategoryDropMode}`); else category.classList.add('category-transfer-target'); } else { document.querySelectorAll('.category-transfer-target').forEach((target) => target.classList.remove('category-transfer-target')); category.classList.add('category-transfer-target'); } return; }
  if (draggedType === 'group' && ((group && group.dataset.groupName !== draggedGroupName) || (!group && item))) { event.preventDefault(); groupItemDropMode = ''; document.querySelectorAll('.group-drop-target, .group-combine-target, .item-group-combine-target, .item-drop-target, .group-drop-before, .group-drop-after, .item-drop-before, .item-drop-after').forEach((target) => target.classList.remove('group-drop-target', 'group-combine-target', 'item-group-combine-target', 'item-drop-target', 'group-drop-before', 'group-drop-after', 'item-drop-before', 'item-drop-after')); if (group) { const position = (event.clientY - group.getBoundingClientRect().top) / group.getBoundingClientRect().height; if (position < .25) { groupItemDropMode = 'before'; group.classList.add('item-drop-before'); } else if (position > .75) { groupItemDropMode = 'after'; group.classList.add('item-drop-after'); } else { groupItemDropMode = 'combine'; group.classList.add('group-combine-target'); } } else { const rect = item.getBoundingClientRect(); const position = (event.clientY - rect.top) / rect.height; if (position < .25) { groupItemDropMode = 'before'; item.classList.add('group-drop-before'); } else if (position > .75) { groupItemDropMode = 'after'; item.classList.add('group-drop-after'); } else { groupItemDropMode = 'combine'; item.classList.add('item-group-combine-target'); } } return; }
  if (draggedType !== 'expense' || (!item && !category)) return;
  event.preventDefault();
  const source = currentState.expenses.find((expense) => expense.id === draggedExpenseId);
  if (source && category && category.dataset.categoryId !== source.categoryId) { crossCategoryDropMode = ''; const dropTarget = group || item; if (dropTarget) { const rect = dropTarget.getBoundingClientRect(); const position = (event.clientY - rect.top) / rect.height; crossCategoryDropMode = position < .25 ? 'before' : position > .75 ? 'after' : 'into'; document.querySelectorAll('.item-drop-before, .item-drop-after, .group-drop-before, .group-drop-after, .category-transfer-target').forEach((target) => target.classList.remove('item-drop-before', 'item-drop-after', 'group-drop-before', 'group-drop-after', 'category-transfer-target')); if (crossCategoryDropMode === 'before' || crossCategoryDropMode === 'after') dropTarget.classList.add(group ? `item-drop-${crossCategoryDropMode}` : `group-drop-${crossCategoryDropMode}`); else category.classList.add('category-transfer-target'); } else { document.querySelectorAll('.category-transfer-target').forEach((target) => target.classList.remove('category-transfer-target')); category.classList.add('category-transfer-target'); } return; }
  const destination = currentState.expenses.find((expense) => expense.id === item?.dataset.expenseId);
  itemGroupDropMode = ''; itemDropMode = ''; withinGroupDropMode = '';
  document.querySelectorAll('.item-drop-target, .item-swap-target, .item-combine-target, .group-drop-target, .item-drop-before, .item-drop-after').forEach((target) => target.classList.remove('item-drop-target', 'item-swap-target', 'item-combine-target', 'group-drop-target', 'item-drop-before', 'item-drop-after'));
  if (source && destination && source.group && source.group === destination.group && source.categoryId === destination.categoryId && source.id !== destination.id) {
    const rect = item.getBoundingClientRect(); withinGroupDropMode = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'; item.classList.add(`item-drop-${withinGroupDropMode}`);
  }
  else if (source && group && group.closest('[data-category-id]')?.dataset.categoryId === source.categoryId) {
    const position = (event.clientY - group.getBoundingClientRect().top) / group.getBoundingClientRect().height;
    if (position < .25) { itemGroupDropMode = 'before'; group.classList.add('item-drop-before'); }
    else if (position > .75) { itemGroupDropMode = 'after'; group.classList.add('item-drop-after'); }
    else if (source.group !== group.dataset.groupName) { itemGroupDropMode = 'into'; group.classList.add('group-drop-target'); }
  }
  else if (source && destination && !source.group && !destination.group && source.categoryId === destination.categoryId && source.id !== destination.id) {
    const rect = item.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height; itemDropMode = x < .2 || y < .25 ? 'before' : x > .8 || y > .75 ? 'after' : 'combine'; item.classList.add(itemDropMode === 'combine' ? 'item-combine-target' : `item-drop-${itemDropMode}`);
  }
  else if (source?.group && destination && destination.categoryId === source.categoryId && !destination.group && destination.id !== source.id) {
    const rect = item.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height; itemDropMode = x < .2 || y < .25 ? 'before' : x > .8 || y > .75 ? 'after' : 'combine'; item.classList.add(itemDropMode === 'combine' ? 'item-combine-target' : `item-drop-${itemDropMode}`);
  }
  else if (source?.group && category?.dataset.categoryId === source.categoryId && !event.target.closest('.item-group')) (event.target.closest('.expense-list') || category.querySelector('.expense-list'))?.classList.add('ungroup-drop-target');
  else if (item && item.dataset.expenseId !== draggedExpenseId) item.classList.add('item-drop-target');
});

app?.addEventListener('dragleave', (event) => { const category = event.target.closest('[data-category-id]'); if (category && !category.contains(event.relatedTarget)) category.classList.remove('drop-target'); });
app?.addEventListener('dragend', () => { draggedType = ''; draggedExpenseId = ''; draggedGroupName = ''; draggedGroupCategoryId = ''; itemGroupDropMode = ''; itemDropMode = ''; withinGroupDropMode = ''; groupItemDropMode = ''; crossCategoryDropMode = ''; categoryDropMode = ''; draggedCategoryId = ''; clearDropTargets(); });

app?.addEventListener('drop', (event) => {
  const target = event.target.closest('[data-group-name], [data-category-id], [data-expense-id]');
  const sourceGroup = draggedGroupName; const sourceGroupCategoryId = draggedGroupCategoryId;
  const groupDropMode = itemGroupDropMode; const nextItemDropMode = itemDropMode; const nextWithinGroupDropMode = withinGroupDropMode; const nextGroupItemDropMode = groupItemDropMode; const nextCrossCategoryDropMode = crossCategoryDropMode; const nextCategoryDropMode = categoryDropMode;
  clearDropTargets(); draggedType = ''; draggedExpenseId = ''; draggedGroupName = ''; draggedGroupCategoryId = ''; itemGroupDropMode = ''; itemDropMode = ''; withinGroupDropMode = ''; groupItemDropMode = ''; crossCategoryDropMode = ''; categoryDropMode = ''; draggedCategoryId = '';
  const value = event.dataTransfer.getData('text/plain'); if (!target || !value) return; event.preventDefault();
  const [type, sourceId] = value.split(':');
  if (type === 'expense' && nextWithinGroupDropMode && target.dataset.expenseId) { const source = currentState.expenses.find((item) => item.id === sourceId); const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); if (source && destination && source.group && source.group === destination.group && source.categoryId === destination.categoryId && moveItemWithinGroup(currentState, source.categoryId, source.group, source.id, destination.id, nextWithinGroupDropMode)) { currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; saveState(currentState); render(currentState); return; } }
  if (type === 'expense' && nextItemDropMode && target.dataset.expenseId) { const source = currentState.expenses.find((item) => item.id === sourceId); const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); if (source?.group && destination && !destination.group && source.categoryId === destination.categoryId) { if (nextItemDropMode === 'before' || nextItemDropMode === 'after') { source.group = ''; if (!moveItemBesideItem(currentState, source.categoryId, source.id, destination.id, nextItemDropMode)) return; } else if (nextItemDropMode === 'combine') { const group = nextGroupName(currentState, source.categoryId); source.group = group; destination.group = group; } else return; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; saveState(currentState); render(currentState); return; } }
  if (type === 'expense' && (groupDropMode === 'before' || groupDropMode === 'after')) { const source = currentState.expenses.find((item) => item.id === sourceId); const destinationGroup = target.closest('[data-group-name]')?.dataset.groupName; const targetCategoryId = target.dataset.categoryId || target.closest('[data-category-id]')?.dataset.categoryId; if (source && source.categoryId === targetCategoryId && destinationGroup) { source.group = ''; if (moveItemBesideGroup(currentState, source.categoryId, source.id, destinationGroup, groupDropMode)) { currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; saveState(currentState); render(currentState); return; } } }
  if (type === 'expense' && (nextCrossCategoryDropMode === 'before' || nextCrossCategoryDropMode === 'after')) { const source = currentState.expenses.find((item) => item.id === sourceId); const destinationGroup = target.closest('[data-group-name]')?.dataset.groupName; const targetCategoryId = target.dataset.categoryId || target.closest('[data-category-id]')?.dataset.categoryId; const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); if (source && targetCategoryId && source.categoryId !== targetCategoryId) { const sourceCategoryId = source.categoryId; source.categoryId = targetCategoryId; source.group = ''; const moved = destinationGroup ? moveItemBesideGroup(currentState, targetCategoryId, source.id, destinationGroup, nextCrossCategoryDropMode) : destination ? moveItemBesideItem(currentState, targetCategoryId, source.id, destination.id, nextCrossCategoryDropMode) : false; if (moved) { currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[sourceCategoryId] = 'manual'; currentState.app.expenseSorts[targetCategoryId] = 'manual'; saveState(currentState); render(currentState); return; } } }
  if (type === 'group' && (nextCrossCategoryDropMode === 'before' || nextCrossCategoryDropMode === 'after')) { const destinationGroup = target.closest('[data-group-name]'); const targetCategoryId = (destinationGroup || target).closest('[data-category-id]')?.dataset.categoryId; const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); if (targetCategoryId && targetCategoryId !== sourceGroupCategoryId) { currentState.expenses.forEach((item) => { if (item.categoryId === sourceGroupCategoryId && item.group === sourceGroup) item.categoryId = targetCategoryId; }); const moved = destinationGroup ? moveGroupBesideGroup(currentState, targetCategoryId, sourceGroup, destinationGroup.dataset.groupName, nextCrossCategoryDropMode) : destination ? moveGroupBesideItem(currentState, targetCategoryId, sourceGroup, destination.id, nextCrossCategoryDropMode) : false; if (moved) { currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[sourceGroupCategoryId] = 'manual'; currentState.app.expenseSorts[targetCategoryId] = 'manual'; saveState(currentState); render(currentState); return; } } }
  if (type === 'category' && target.dataset.categoryId !== sourceId) { if (nextCategoryDropMode === 'swap') { const source = currentState.categories.find((item) => item.id === sourceId); const destination = currentState.categories.find((item) => item.id === target.dataset.categoryId); if (!source || !destination) return; const order = source.sortOrder; source.sortOrder = destination.sortOrder; destination.sortOrder = order; } else if (!moveCategory(currentState, sourceId, target.dataset.categoryId, nextCategoryDropMode || 'after')) return; currentState.app.categorySort = 'manual'; }
  else if (type === 'group') { const destinationGroup = target.closest('[data-group-name]'); const categoryId = (destinationGroup || target).closest('[data-category-id]')?.dataset.categoryId; if (!categoryId) return; if (categoryId !== sourceGroupCategoryId) { let sortOrder = Math.max(0, ...currentState.expenses.filter((item) => item.categoryId === categoryId).map((item) => item.sortOrder || 0)); currentState.expenses.forEach((item) => { if (item.categoryId === sourceGroupCategoryId && item.group === sourceGroup) { item.categoryId = categoryId; item.sortOrder = ++sortOrder; } }); if (nextCrossCategoryDropMode === 'before' || nextCrossCategoryDropMode === 'after') { const moved = destinationGroup ? moveGroupBesideGroup(currentState, categoryId, sourceGroup, destinationGroup.dataset.groupName, nextCrossCategoryDropMode) : target.dataset.expenseId ? moveGroupBesideItem(currentState, categoryId, sourceGroup, target.dataset.expenseId, nextCrossCategoryDropMode) : false; if (!moved) return; } currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[sourceGroupCategoryId] = 'manual'; currentState.app.expenseSorts[categoryId] = 'manual'; } else if (destinationGroup) { if (nextGroupItemDropMode === 'before' || nextGroupItemDropMode === 'after') { if (!moveGroupBesideGroup(currentState, categoryId, sourceGroup, destinationGroup.dataset.groupName, nextGroupItemDropMode)) return; } else currentState.expenses.forEach((item) => { if (item.categoryId === categoryId && item.group === sourceGroup) item.group = destinationGroup.dataset.groupName; }); currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[categoryId] = 'manual'; } else if (target.dataset.expenseId) { if (nextGroupItemDropMode === 'before' || nextGroupItemDropMode === 'after') { if (!moveGroupBesideItem(currentState, categoryId, sourceGroup, target.dataset.expenseId, nextGroupItemDropMode)) return; } else { const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); if (!destination) return; destination.group = sourceGroup; } currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[categoryId] = 'manual'; } else return; }
  else if (type === 'expense') { const source = currentState.expenses.find((item) => item.id === sourceId); const destination = currentState.expenses.find((item) => item.id === target.dataset.expenseId); const destinationGroup = target.closest('[data-group-name]')?.dataset.groupName; const targetCategoryId = target.dataset.categoryId || target.closest('[data-category-id]')?.dataset.categoryId; if (!source || target.dataset.expenseId === sourceId || !targetCategoryId) return; if (source.categoryId !== targetCategoryId) { const sourceCategoryId = source.categoryId; source.categoryId = targetCategoryId; source.sortOrder = Math.max(0, ...currentState.expenses.filter((item) => item.categoryId === targetCategoryId && item.id !== source.id).map((item) => item.sortOrder || 0)) + 1; if (destinationGroup) source.group = destinationGroup; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[sourceCategoryId] = 'manual'; currentState.app.expenseSorts[targetCategoryId] = 'manual'; } else if (destination && nextItemDropMode === 'combine' && !source.group && !destination.group && source.categoryId === destination.categoryId) { const group = nextGroupName(currentState, source.categoryId); source.group = group; destination.group = group; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; } else if (destination && (nextItemDropMode === 'before' || nextItemDropMode === 'after') && !source.group && !destination.group && source.categoryId === destination.categoryId) { if (!moveItemBesideItem(currentState, source.categoryId, source.id, destination.id, nextItemDropMode)) return; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; } else if (destinationGroup && groupDropMode && groupDropMode !== 'into' && !source.group && source.categoryId === targetCategoryId) { if (!moveItemBesideGroup(currentState, source.categoryId, source.id, destinationGroup, groupDropMode)) return; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; } else if (destinationGroup && source.categoryId === targetCategoryId && source.group !== destinationGroup) { source.group = destinationGroup; if (destination) { const order = source.sortOrder; source.sortOrder = destination.sortOrder; destination.sortOrder = order; } else source.sortOrder = Math.max(...currentState.expenses.filter((item) => item.categoryId === source.categoryId).map((item) => item.sortOrder || 0)) + 1; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; } else if (destination) { const order = source.sortOrder; source.sortOrder = destination.sortOrder; destination.sortOrder = order; if (source.categoryId === destination.categoryId && source.group && !destination.group) source.group = ''; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; currentState.app.expenseSorts[destination.categoryId] = 'manual'; } else if (source.group && source.categoryId === targetCategoryId && !target.closest('.item-group')) { source.group = ''; currentState.app.expenseSorts ||= {}; currentState.app.expenseSorts[source.categoryId] = 'manual'; } else return; }
  else return;
  saveState(currentState); render(currentState);
});

currentState = loadState(); saveState(currentState); render(currentState);
