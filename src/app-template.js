function renderApp(state, summary, orderedCategories, orderedExpenses) {
  const formatCurrency = (value) => `$${value.toFixed(2)}`;
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const categoryColors = ['#2563eb', '#7c3aed', '#059669', '#ea580c', '#dc2626', '#0891b2'];
  const periods = [
    { key: 'weekly', label: 'Weekly' },
    { key: 'biweekly', label: 'Biweekly' },
    { key: 'monthly', label: 'Monthly' },
    { key: 'quarterly', label: 'Quarterly' },
    { key: 'annual', label: 'Annual' },
  ];

  const totalCategoryPercentage = window.budget.getCategoryPercentageTotal(state);
  const remainingCategoryPercentage = Math.max(0, 100 - totalCategoryPercentage);
  const overCategoryPercentage = Math.max(0, totalCategoryPercentage - 100);

  return `
    <header>
      <div>
        <h1>mybudgeter</h1>
        <p class="small">A simple budgeting board.</p>
      </div>
      <div class="actions">
        <button type="button" data-download-save>Download save file</button>
        <label class="button-like secondary">
          Import save file
          <input data-import-save type="file" accept="application/json,.json" />
        </label>
      </div>
    </header>

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>Net Income</h2>
          <p class="small">Add your net income and choose how often it arrives.</p>
        </div>
      </div>
      <div class="collapsible-card">
        <div class="income-summary">
          <div class="summary-inline">
            <span>${state.incomes.length ? `${state.incomes.length} income source${state.incomes.length === 1 ? '' : 's'}` : 'No income yet'}</span>
            <span>${formatCurrency(summary.monthlyIncome)} / month on average</span>
            <button type="button" class="link-button hint" data-toggle-income>${state.app.isIncomeOpen === false ? 'click to expand' : 'click to collapse'}</button>
          </div>
        </div>
        ${state.app.isIncomeOpen === false ? '' : `
        <div class="collapsible-body">
          <form id="income-form">
            <div class="field-row">
              <label>Name<input name="name" required /></label>
              <label>Amount<input name="amount" type="number" min="0" step="0.01" required /></label>
              <label>Frequency<select name="frequency">${window.budget.FREQUENCY_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}</select></label>
            </div>
            <label>Notes<textarea name="notes"></textarea></label>
            <button type="submit">Add income</button>
          </form>
          ${state.incomes.length ? `
            <div class="pill-list">
              ${state.incomes.map((income) => `
                <div class="chip">
                  <div>
                    <strong>${income.name}</strong>
                    <div class="small">${formatCurrency(income.amount)} • ${income.frequency}</div>
                  </div>
                  <button class="ghost small-button" data-remove-income="${income.id}">Remove</button>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-state">No income yet. Add your first source above.</div>'}
        </div>
        `}
      </div>
    </section>

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>Budget board</h2>
          <p class="small">Each column is a category. Add or remove expenses quickly.</p>
        </div>
        ${state.app.isAddingCategory ? `
          <form id="category-form" class="inline-form">
            <input name="name" placeholder="Category name" required />
            <input name="percentage" type="number" min="0" step="0.1" placeholder="Percent" required />
            <button type="submit">Add category</button>
            <button type="button" class="secondary" data-cancel-category>Cancel</button>
          </form>
        ` : '<button type="button" data-show-category-form>Add category</button>'}
      </div>
      <div class="category-form-meta">
        <span>Used: ${totalCategoryPercentage.toFixed(1)}%</span>
        <span>${overCategoryPercentage > 0 ? `Over: ${overCategoryPercentage.toFixed(1)}%` : `Remaining: ${remainingCategoryPercentage.toFixed(1)}%`}</span>
        ${overCategoryPercentage > 0 ? '<span class="message">Warning: category percentages exceed 100%.</span>' : ''}
        ${state.app.categoryMessage ? `<span class="message">${state.app.categoryMessage}</span>` : ''}
      </div>

      ${orderedCategories.length ? `
        <div class="board">
          ${orderedCategories.map((category, index) => {
            const detail = summary.categories.find((item) => item.id === category.id);
            const usagePercent = detail?.usagePercent ?? 0;
            const targetAmount = detail?.monthlyTarget ?? 0;
            const spentAmount = detail?.monthlySpent ?? 0;
            const remainingAmount = detail?.monthlyRemaining ?? 0;
            const periodTarget = window.budget.toPeriodAmount(targetAmount, 'monthly', 'monthly', state.app.paychecksPerMonth);
            const periodSpent = window.budget.toPeriodAmount(spentAmount, 'monthly', 'monthly', state.app.paychecksPerMonth);
            const periodRemaining = window.budget.toPeriodAmount(remainingAmount, 'monthly', 'monthly', state.app.paychecksPerMonth);
            const expenses = orderedExpenses.filter((expense) => expense.categoryId === category.id);
            const accent = categoryColors[index % categoryColors.length];
            const isEditing = state.app.editingCategoryId === category.id;
            const isAddingExpense = state.app.addingExpenseCategoryId === category.id;
            return `
              <div class="category-column" style="--accent:${accent}; --column-percent:${Math.min(100, Math.max(12, category.percentage))}">
                ${isEditing ? `
                  <form class="category-edit-form" data-edit-category-form="${category.id}">
                    <input name="name" value="${escapeHtml(category.name)}" required />
                    <input name="percentage" type="number" min="0" step="0.1" value="${category.percentage}" required />
                    <div class="actions">
                      <button type="submit">Save</button>
                      <button type="button" class="ghost small-button" data-cancel-edit-category>Cancel</button>
                    </div>
                  </form>
                ` : `
                  <div class="column-header">
                    <div>
                      <h3>${escapeHtml(category.name)}</h3>
                      <p>${category.percentage}% of income</p>
                    </div>
                    <div class="actions">
                      <button class="ghost small-button" data-edit-category="${category.id}">Edit</button>
                      <button class="ghost small-button" data-remove-category="${category.id}">Remove</button>
                    </div>
                  </div>
                `}
                <div class="column-metrics">
                  <div><span>Monthly Target</span><strong>${formatCurrency(periodTarget)}</strong></div>
                  <div><span>Monthly Spending</span><strong>${formatCurrency(periodSpent)}</strong></div>
                  <div><span>Remaining</span><strong>${formatCurrency(periodRemaining)}</strong></div>
                </div>
                <div class="progress-bar"><span style="width:${Math.min(100, usagePercent)}%"></span></div>
                ${isAddingExpense ? `
                  <form class="expense-form" data-category-id="${category.id}">
                    <input name="name" placeholder="Expense name" required />
                    <input name="amount" type="number" min="0" step="0.01" placeholder="Amount" required />
                    <select name="frequency">${window.budget.FREQUENCY_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join('')}</select>
                    <div class="actions">
                      <button type="submit">Save</button>
                      <button type="button" class="ghost small-button" data-cancel-expense>Cancel</button>
                    </div>
                  </form>
                ` : `<button type="button" class="expense-add-button" data-show-expense-form="${category.id}">Add expense</button>`}
                <div class="expense-list">
                  ${expenses.length ? expenses.map((expense) => `
                    <div class="expense-item">
                      <div>
                        <strong>${expense.name}</strong>
                        <div class="small">${formatCurrency(expense.amount)} • ${expense.frequency}</div>
                      </div>
                      <button class="ghost small-button" data-remove-expense="${expense.id}">×</button>
                    </div>
                  `).join('') : '<div class="empty-item">No expenses yet.</div>'}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : '<div class="empty-state">No categories yet. Add one above to start your board.</div>'}
    </section>

    <section class="card">
      <div class="section-heading">
        <div>
          <h2>Complete summary</h2>
          <p class="small">Everything in one place across common budgeting periods.</p>
        </div>
      </div>
      <div class="summary-grid-wide">
        ${periods.map((period) => {
          const detail = summary.periods[period.key];
          return `
            <div class="summary-card">
              <h3>${period.label}</h3>
              <div class="summary-row"><span>Income</span><strong>${formatCurrency(detail.income)}</strong></div>
              <div class="summary-row"><span>Spending</span><strong>${formatCurrency(detail.expenses)}</strong></div>
              <div class="summary-row"><span>Remaining</span><strong>${formatCurrency(detail.remaining)}</strong></div>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

window.renderApp = renderApp;
