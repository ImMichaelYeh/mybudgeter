(() => {
  const schema = "MyBudgeter-library-v1";
  const templates = [
    {
      id: "50/30/20",
      label: "50/30/20",
      categories: [
        ["Needs", 50],
        ["Wants", 30],
        ["Savings", 20],
      ],
    },
    {
      id: "70/20/10",
      label: "70/20/10",
      categories: [
        ["Spending", 70],
        ["Savings", 20],
        ["Debt", 10],
      ],
    },
    {
      id: "thirds",
      label: "Equal Thirds (3/3/3)",
      categories: [
        ["Needs", 33.33],
        ["Wants", 33.33],
        ["Savings", 33.34],
      ],
    },
    { id: "blank", label: "Blank", categories: [] },
  ];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const validId = (value) =>
    typeof value === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(value) &&
    !["__proto__", "constructor", "prototype"].includes(value);

  function validateName(library, value, exceptId = "") {
    if (typeof value !== "string" || !value.trim() || value.trim().length > 100)
      throw new Error("Enter a budget name between 1 and 100 characters.");
    const name = value.trim();
    if (
      library.budgets.some(
        (entry) =>
          entry.id !== exceptId &&
          entry.name.toLowerCase() === name.toLowerCase(),
      )
    )
      throw new Error("A budget with that name already exists.");
    return name;
  }

  function suggestName(library, base = "My Budget") {
    let name = base.slice(0, 100);
    let suffix = 2;
    while (
      library.budgets.some(
        (entry) => entry.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      const ending = ` ${suffix++}`;
      name = base.slice(0, 100 - ending.length) + ending;
    }
    return name;
  }

  function templateState(templateId = "50/30/20") {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) throw new Error("Unknown budget template.");
    const state = window.budget.createEmptyState();
    const colors = state.categories.map((category) => category.color);
    state.categories = template.categories.map(([name, percentage], index) => ({
      id: `default-${name.toLowerCase()}`,
      name,
      percentage,
      sortOrder: index + 1,
      isSavings: name === "Savings",
      color: colors[index],
    }));
    return state;
  }

  function committedState(state) {
    const copy = clone(state);
    copy.incomes = copy.incomes.filter(
      (entry) => entry.id !== copy.app.draftIncomeId,
    );
    copy.categories = copy.categories.filter(
      (entry) => entry.id !== copy.app.draftCategoryId,
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
    return copy;
  }

  function fingerprint(state) {
    const copy = committedState(window.budget.normalizeSaveState(state));
    delete copy.exportedAt;
    delete copy.version;
    return JSON.stringify(copy);
  }

  function normalize(value, makeId = () => crypto.randomUUID()) {
    if (value == null) return { schema, activeBudgetId: "", budgets: [] };
    if (typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid budget library.");
    if (
      String(value.schema).toLowerCase() ===
      window.budget.SAVE_FILE_SCHEMA.toLowerCase()
    ) {
      const id = makeId();
      return {
        schema,
        activeBudgetId: id,
        budgets: [
          {
            id,
            recoveryId: id,
            name: "My Budget",
            data: window.budget.normalizeSaveState(value),
          },
        ],
      };
    }
    if (value.schema !== schema || !Array.isArray(value.budgets))
      throw new Error("Unsupported budget library.");
    const library = {
      schema,
      activeBudgetId: value.activeBudgetId,
      budgets: [],
    };
    for (const entry of value.budgets) {
      if (
        !entry ||
        !validId(entry.id) ||
        library.budgets.some((other) => other.id === entry.id)
      )
        throw new Error("Invalid or duplicate budget ID.");
      const name = validateName(library, entry.name);
      if (entry.recoveryId !== undefined && !validId(entry.recoveryId))
        throw new Error("Invalid recovery ID.");
      library.budgets.push({
        id: entry.id,
        recoveryId: entry.recoveryId || entry.id,
        name,
        data: window.budget.normalizeSaveState(entry.data),
      });
    }
    if (
      library.budgets.length
        ? !library.budgets.some((entry) => entry.id === library.activeBudgetId)
        : library.activeBudgetId !== ""
    )
      throw new Error("Invalid active budget.");
    return library;
  }

  function add(library, name, data, id) {
    if (!validId(id) || library.budgets.some((entry) => entry.id === id))
      throw new Error("Invalid budget ID.");
    const next = clone(library);
    next.budgets.push({
      id,
      recoveryId: id,
      name: validateName(library, name),
      data: clone(data),
    });
    next.activeBudgetId = id;
    return next;
  }

  function remove(library, id) {
    const next = clone(library);
    next.budgets = next.budgets.filter((entry) => entry.id !== id);
    if (next.activeBudgetId === id)
      next.activeBudgetId = next.budgets[0]?.id || "";
    return next;
  }

  window.budgetLibrary = {
    schema,
    templates,
    clone,
    normalize,
    validateName,
    suggestName,
    templateState,
    committedState,
    fingerprint,
    add,
    remove,
  };
})();
