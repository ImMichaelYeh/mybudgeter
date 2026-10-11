function createBudgetHistory(initialState) {
  const snapshot = (state) => {
    const copy = JSON.parse(JSON.stringify(state));
    delete copy.exportedAt;
    copy.incomes = copy.incomes.filter(
      (item) => item.id !== copy.app.draftIncomeId,
    );
    copy.categories = copy.categories.filter(
      (item) => item.id !== copy.app.draftCategoryId,
    );
    Object.assign(copy.app, {
      categoryMessage: "",
      isAddingCategory: false,
      editingCategoryId: "",
      draftCategoryId: "",
      editingIncomeId: "",
      draftIncomeId: "",
      addingExpenseCategoryId: "",
      addingExpenseGroup: "",
      editingExpenseId: "",
    });
    return JSON.stringify(copy);
  };
  const entries = [snapshot(initialState)];
  let position = 0;
  return {
    record(state) {
      const value = snapshot(state);
      if (value === entries[position]) return;
      entries.splice(position + 1);
      entries.push(value);
      position++;
    },
    get canUndo() {
      return position > 0;
    },
    get canRedo() {
      return position < entries.length - 1;
    },
    undo() {
      return position > 0 ? JSON.parse(entries[--position]) : null;
    },
    redo() {
      return position < entries.length - 1 ? JSON.parse(entries[++position]) : null;
    },
  };
}

function getBudgetHistoryShortcut(event) {
  if (
    event.defaultPrevented || event.altKey || !(event.ctrlKey || event.metaKey)
  )
    return "";
  if (
    event.target?.closest?.(
      'input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]:not([contenteditable="false"]), dialog[open], [role="dialog"]',
    )
  ) return "";
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" && !event.shiftKey ? "redo" : "";
}

window.budgetHistory = {
  create: createBudgetHistory,
  shortcut: getBudgetHistoryShortcut,
};
