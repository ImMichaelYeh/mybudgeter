function renderApp(state, summary, categories, allExpenses, saveMessage = "") {
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;
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
  const periods = [
    ["weekly", "Weekly"],
    ["biweekly", "Biweekly"],
    ["monthly", "Monthly"],
    ["quarterly", "Quarterly"],
    ["annual", "Annual"],
  ];

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
      <input name="group" placeholder="Group (optional)" />
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
            <button class="ghost small-button" data-remove-income="${income.id}">Remove</button>
          </div>
        </div>
        ${incomeEditor(income)}
      `,
    )
    .join("");

  const board = categories
    .map((category, index) => {
      const detail = summary.categories.find((item) => item.id === category.id);
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
              <form class="expense-edit-form" data-edit-expense-form="${item.id}">
                <input name="name" value="${escapeHtml(item.name)}" required />
                <div class="field-row">
                  <input name="amount" type="number" min="0" step="0.01" value="${item.amount}" required />
                  <input name="multiplier" type="number" min="1" step="1" value="${item.multiplier || 1}" required />
                  <select name="frequency">${options(item.frequency)}</select>
                </div>
                <input name="group" value="${escapeHtml(item.group)}" placeholder="Group (optional)" />
                <div class="actions">
                  <button type="submit">Save</button>
                  <button type="button" class="secondary" data-cancel-edit-expense>Cancel</button>
                </div>
              </form>
            `;
          }

          return `
            <div class="expense-item" draggable="true" data-expense-id="${item.id}">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <div class="small">
                  ${money(item.amount * (item.multiplier || 1))} &middot; ${escapeHtml(item.frequency)}
                  ${item.multiplier > 1 ? `&middot; &times;${item.multiplier}` : ""}
                </div>
                ${item.group ? `<div class="tag">${escapeHtml(item.group)}</div>` : ""}
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
          class="category-column"
          draggable="true"
          data-category-id="${category.id}"
          style="--accent:${accentColors[index % accentColors.length]};--column-percent:${Math.max(10, category.percentage)}"
        >
          <div class="column-header">
            <div>
              <h3>${escapeHtml(category.name)}</h3>
              <p>${category.percentage}% &middot; ${category.isSavings ? "Savings" : "Expenses"}</p>
            </div>
            <div class="actions">
              <button class="ghost small-button" data-edit-category="${category.id}">Edit</button>
              <button class="ghost small-button" data-remove-category="${category.id}">Remove</button>
            </div>
          </div>
          <div class="column-metrics">
            <div><span>Monthly Target</span><strong>${money(detail?.monthlyTarget)}</strong></div>
            <div><span>${category.isSavings ? "Monthly Savings" : "Monthly Spending"}</span><strong>${money(detail?.monthlySpent)}</strong></div>
            <div><span>Remaining</span><strong>${money(detail?.monthlyRemaining)}</strong></div>
          </div>
          <div class="progress-bar ${progressColor}"><span style="width:${Math.min(100, usage)}%"></span></div>
          ${
            state.app.addingExpenseCategoryId === category.id
              ? addItemForm(category)
              : `<button type="button" class="expense-add-button" data-show-expense-form="${category.id}">${category.isSavings ? "Add savings" : "Add expense"}</button>`
          }
          <div class="expense-list">${list || '<div class="empty-item">No items yet.</div>'}</div>
        </article>
      `;
    })
    .join("");

  const summaryCards = periods
    .map(([key, label]) => {
      const period = summary.periods[key];
      return `
        <div class="summary-card">
          <h3>${label}</h3>
          <div class="summary-row"><span>Income</span><strong>${money(period.income)}</strong></div>
          <div class="summary-row"><span>Savings</span><strong>${money(period.savings)}</strong></div>
          <div class="summary-row"><span>Uncategorized</span><strong>${money(period.remaining)}</strong></div>
          <div class="summary-row total-unspent"><span>Total Unspent</span><strong>${money(period.savings + period.remaining)}</strong></div>
          <div class="summary-row total-spent"><span>Total Spent</span><strong>${money(period.expenses)}</strong></div>
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
    : '<button type="button" data-show-category-form>Add category</button>';

  const categoryTotal = window.budget.getCategoryPercentageTotal(state);
  return `
    <header>
      <div>
        <h1>mybudgeter</h1>
        <p class="small">A simple budgeting board.</p>
      </div>
      <div class="actions">
        <span class="save-status" data-save-status>${escapeHtml(saveMessage)}</span>
        <button type="button" data-download-save>Download save file</button>
        <label class="button-like secondary">
          Import save file
          <input data-import-save type="file" accept="application/json,.json" />
        </label>
      </div>
    </header>

    <section class="card">
      <div class="section-heading"><div><h2>Net Income</h2></div></div>
      <div class="collapsible-card">
        <div class="income-summary">
          <div class="summary-inline">
            <span>${state.incomes.length || "No"} income source${state.incomes.length === 1 ? "" : "s"} &middot; ${money(summary.monthlyIncome)} / month</span>
            <button type="button" class="link-button hint" data-toggle-income>
              ${state.app.isIncomeOpen === false ? "click to expand" : "click to collapse"}
            </button>
          </div>
        </div>
        ${
          state.app.isIncomeOpen === false
            ? ""
            : `
              <div class="collapsible-body">
                <form id="income-form">
                  <div class="field-row">
                    <input name="name" placeholder="Name" required />
                    <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
                    <select name="frequency">${options("biweekly")}</select>
                  </div>
                  <textarea name="notes" placeholder="Notes"></textarea>
                  <button type="submit">Add income</button>
                </form>
                <div class="pill-list">${incomeRows || '<div class="empty-state">No income yet.</div>'}</div>
              </div>
            `
        }
      </div>
    </section>

    <section class="card">
      <div class="section-heading"><div><h2>Budget board</h2></div>${categoryForm}</div>
      <div class="category-form-meta">
        <span>Categories Total: ${categoryTotal.toFixed(1)}%</span>
        <span>Categorized: ${(summary.monthlyIncome ? ((summary.monthlyExpenses + summary.monthlySavings) / summary.monthlyIncome) * 100 : 0).toFixed(1)}%</span>
      </div>
      <div class="board">${board || '<div class="empty-state">No categories yet.</div>'}</div>
    </section>

    <section class="card">
      <div class="section-heading"><div><h2>Complete summary</h2></div></div>
      <div class="summary-grid-wide">${summaryCards}</div>
    </section>
  `;
}

window.renderApp = renderApp;
