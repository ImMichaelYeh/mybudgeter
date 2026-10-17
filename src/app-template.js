function renderApp(
  state,
  summary,
  categories,
  allExpenses,
  budgetName = "No Budget Selected",
) {
  const money = window.budget.formatMoney;
  const escapeHtml = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const frequencyOptions = window.budget.FREQUENCY_OPTIONS;
  const accentColors = [
    "#2563eb",
    "#7c3aed",
    "#059669",
    "#ea580c",
    "#dc2626",
    "#0891b2",
  ];
  const periods = window.budget.SUMMARY_PERIODS;

  const options = (selected) =>
    frequencyOptions
      .map(
        ({ value, label }) =>
          `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`,
      )
      .join("");

  const incomeEditor = (income) => `
    <form
      class="income-edit-form"
      data-edit-income-form="${income.id}"
      ${state.app.editingIncomeId === income.id ? "" : "hidden"}
    >
      <div class="field-row">
        <input name="name" value="${escapeHtml(income.name)}" required />
        <input name="amount" type="number" min="0" step="0.01" value="${income.amount}" required />
        <select name="frequency">${options(income.frequency)}</select>
      </div>
      <textarea name="notes">${escapeHtml(income.notes || "")}</textarea>
      <div class="actions">
        <button type="submit">Save</button>
        <button type="button" class="secondary" data-cancel-edit-income>Cancel</button>
      </div>
    </form>
  `;

  const addItemForm = (category) => `
    <form class="expense-form" data-category-id="${category.id}">
      <input name="name" placeholder="${category.isSavings ? "Savings name" : "Expense name"}" required />
      <div class="field-row">
        <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
        <input name="multiplier" type="number" min="1" step="1" value="1" placeholder="Qty" />
        <select name="frequency">${options("monthly")}</select>
      </div>
      <div class="actions">
        <button type="submit">Save</button>
        <button type="button" class="secondary" data-cancel-expense>Cancel</button>
      </div>
    </form>
  `;

  const incomeRows = state.incomes
    .map(
      (income) => `
        <div class="chip income-item">
          <div>
            <strong>${escapeHtml(income.name)}</strong>
            <div class="small">${money(income.amount)} &middot; ${escapeHtml(income.frequency)}</div>
            ${income.notes ? `<div class="income-note">Note: ${escapeHtml(income.notes)}</div>` : ""}
          </div>
          <div class="actions">
            <button class="ghost small-button" data-edit-income="${income.id}">Edit</button>
            <button class="ghost small-button" data-remove-income="${income.id}" aria-label="Delete ${escapeHtml(income.name)} Income" title="Delete Income">&times;</button>
          </div>
          ${incomeEditor(income)}
        </div>
      `,
    )
    .join("");

  const board = categories
    .map((category, index) => {
      const isCollapsed = state.app.collapsedCategories?.[category.id] === true;
      const detail = summary.categories.find((item) => item.id === category.id);
      const metrics = window.budget.getCategoryPeriodMetrics(
        detail,
        state.app.boardPeriod,
      );
      const usage = detail?.usagePercent || 0;
      const progressColor = category.isSavings
        ? usage >= 90
          ? "good"
          : usage >= 60
            ? "warn"
            : "bad"
        : usage >= 90
          ? "bad"
          : usage >= 60
            ? "warn"
            : "good";
      const items = window.budget.sortExpenses(
        allExpenses.filter((item) => item.categoryId === category.id),
        "manual",
      );
      const list = items
        .map((item) => {
          if (state.app.editingExpenseId === item.id) {
            return `
              <div class="expense-item" data-expense-id="${item.id}">
                <form class="expense-edit-form" data-edit-expense-form="${item.id}">
                  <input name="name" value="${escapeHtml(item.name)}" required />
                  <div class="field-row">
                    <input name="amount" type="number" min="0" step="0.01" value="${item.amount}" required />
                    <input name="multiplier" type="number" min="1" step="1" value="${item.multiplier || 1}" required />
                    <select name="frequency">${options(item.frequency)}</select>
                  </div>
                  <div class="actions">
                    <button type="submit">Save</button>
                    <button type="button" class="secondary" data-cancel-edit-expense>Cancel</button>
                  </div>
                </form>
              </div>
            `;
          }

          return `
            <div class="expense-item" draggable="true" data-expense-id="${item.id}">
              <div>
                <div class="item-name-row">
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="small">
                    ${money(item.amount * (item.multiplier || 1))} / ${escapeHtml(item.frequency)}
                    ${item.multiplier > 1 ? `&middot; &times;${item.multiplier}` : ""}
                  </span>
                </div>
              </div>
              <div class="actions">
                <button class="ghost small-button" data-edit-expense="${item.id}">Edit</button>
                <button class="ghost small-button" data-remove-expense="${item.id}">&times;</button>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article
          class="category-column ${isCollapsed ? "category-collapsed" : ""}"
          draggable="true"
          data-category-id="${category.id}"
          style="--accent:${accentColors[index % accentColors.length]};--column-percent:${Math.max(10, category.percentage)}"
        >
          <div class="column-header">
            <button type="button" class="ghost small-button group-toggle category-toggle" data-toggle-category="${category.id}" aria-expanded="${!isCollapsed}" aria-label="${isCollapsed ? "Expand" : "Collapse"} ${escapeHtml(category.name)} Category" title="${isCollapsed ? "Expand" : "Collapse"} Category"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${isCollapsed ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6"}" /></svg></button>
            <div>
              <h3>${escapeHtml(category.name)}</h3>
              <p>${category.percentage}% &middot; ${category.isSavings ? "Savings" : "Expenses"}</p>
            </div>
            <div class="actions">
              <button class="ghost small-button" data-edit-category="${category.id}">Edit</button>
              <button class="ghost small-button" data-color-category="${category.id}">Color</button>
              <button class="ghost small-button" data-remove-category="${category.id}" aria-label="Delete ${escapeHtml(category.name)} Category" title="Delete Category">&times;</button>
            </div>
          </div>
          <div class="column-metrics">
            <div><span data-target-label>Budget</span><strong data-category-target>${money(metrics.target)}</strong></div>
            <div><span>${category.isSavings ? "Saving" : "Spending"}</span><strong data-category-spent>${money(metrics.spent)}</strong></div>
            <div><span>Remaining</span><strong data-category-remaining>${money(metrics.remaining)}</strong></div>
          </div>
          <div class="progress-bar ${progressColor}"><span style="width:${Math.min(100, usage)}%"></span></div>
          <div class="expense-list">
            ${list || '<div class="empty-item">No items yet.</div>'}
            ${
              state.app.addingExpenseCategoryId === category.id
                ? addItemForm(category)
                : `<button type="button" class="ghost expense-add-button" data-show-expense-form="${category.id}" aria-label="${category.isSavings ? "Add Savings" : "Add Expense"}" title="${category.isSavings ? "Add Savings" : "Add Expense"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  const summaryCards = periods
    .map(([key]) => {
      const period = summary.periods[key];
      return `
        <div class="summary-card" data-summary-period="${key}" ${key === state.app.summaryPeriod ? "" : "hidden"}>
          <div class="summary-metrics">
          <div class="summary-row"><span>Income</span><strong>${money(period.income)}</strong></div>
          <div class="summary-row"><span>Savings</span><strong>${money(period.savings)}</strong></div>
          <div class="summary-row"><span>Uncategorized</span><strong>${money(period.remaining)}</strong></div>
          <div class="summary-row total-unspent"><span>Total Unspent</span><strong>${money(period.savings + period.remaining)}</strong></div>
          <div class="summary-row total-spent"><span>Total Spent</span><strong>${money(period.expenses)}</strong></div>
          </div>
        </div>
      `;
    })
    .join("");

  const categoryForm = state.app.isAddingCategory
    ? `
      <form id="category-form" class="inline-form">
        <input name="name" placeholder="Category name" required />
        <input name="percentage" type="number" min="0" step="0.1" placeholder="Percent" required />
        <label class="check"><input name="isSavings" type="checkbox" /> Savings</label>
        <button type="submit">Add category</button>
        <button type="button" class="secondary" data-cancel-category>Cancel</button>
      </form>
    `
    : '<button type="button" data-show-category-form><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>Add category</button>';

  const categoryTotal = window.budget.getCategoryPercentageTotal(state);
  return `
    <template data-portfolio-banner>
      <nav class="site-header" aria-label="Site navigation">
        <a class="site-brand" href="https://immichaelyeh.github.io/">Michael Yeh</a>
      </nav>
    </template>
    <header class="site-header app-header" aria-label="Active Budget">
      <div class="budget-heading">
        <h1 class="site-brand budget-banner-name">${escapeHtml(budgetName)}</h1>
      </div>
    </header>

    <section class="card">
      <div class="section-heading"><div><h2>Net Income</h2></div></div>
      <div class="collapsible-card">
        <div class="income-summary">
          <div class="summary-inline">
            <span class="income-total">
              <span>${state.incomes.length || "No"} income source${state.incomes.length === 1 ? "" : "s"} &middot;</span>
              <span data-income-total role="status">${money(summary.periods[state.app.incomePeriod].income)}</span> /
              <select aria-label="Net Income Period" data-income-period-select>${periods.map(([key, label]) => `<option value="${key}" ${key === state.app.incomePeriod ? "selected" : ""}>${label}</option>`).join("")}</select>
            </span>
            <button type="button" class="link-button hint" data-toggle-income>
              ${state.app.isIncomeOpen === false ? "click to expand" : "click to collapse"}
            </button>
          </div>
        </div>
              <div class="collapsible-body" ${state.app.isIncomeOpen === false ? "hidden" : ""}>
                <div class="pill-list">
                  ${incomeRows || '<div class="empty-state">No income yet.</div>'}
                  <button type="button" class="income-add-button" data-add-income>Add income</button>
                </div>
              </div>
      </div>
    </section>

    <section class="card budget-board-card">
      <div class="section-heading budget-board-heading"><div class="budget-board-title"><h2>Budget board</h2></div>${categoryForm}</div>
      <div class="category-form-meta">
        <span>Categories Total: ${categoryTotal.toFixed(1)}%</span>
      </div>
      <div class="board" data-categories-per-row="${state.app.categoriesPerRow}">${board || '<div class="empty-state">No categories yet.</div>'}</div>
    </section>

    <section class="card complete-summary-card">
      <div class="section-heading summary-heading"><div><h2>Complete summary</h2></div>
        <label class="summary-period-control"><span>Period</span>
          <select aria-label="Complete Summary Period" data-summary-period-select>${periods.map(([key, label]) => `<option value="${key}" ${key === state.app.summaryPeriod ? "selected" : ""}>${label}</option>`).join("")}</select>
        </label>
      </div>
      <div class="summary-grid-wide">${summaryCards}</div>
    </section>
  `;
}

window.renderApp = renderApp;
