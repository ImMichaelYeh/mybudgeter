(() => {
  const library = window.budgetLibrary;

  function dialog(title, className = "budget-dialog") {
    const panel = document.createElement("dialog");
    panel.className = className;
    const heading = document.createElement("h2");
    heading.id = `budget-dialog-${crypto.randomUUID()}`;
    heading.textContent = title;
    panel.setAttribute("aria-labelledby", heading.id);
    panel.append(heading);
    const handleKey = (event) => {
      if (!panel.open) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (panel.dispatchEvent(new Event("cancel", { cancelable: true })))
          panel.close();
      } else if (event.key === "Tab") {
        const controls = [
          ...panel.querySelectorAll(
            "button, input, select, textarea, [tabindex='0']",
          ),
        ].filter(
          (control) =>
            !control.disabled &&
            control.getClientRects().length &&
            (control.type !== "radio" || control.checked),
        );
        if (!controls.length) return;
        event.preventDefault();
        const index = controls.indexOf(document.activeElement);
        const next =
          index < 0
            ? event.shiftKey
              ? controls.length - 1
              : 0
            : (index + (event.shiftKey ? -1 : 1) + controls.length) %
              controls.length;
        controls[next].focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    panel.addEventListener("click", (event) => {
      if (panel.dataset.submitting === "true") return;
      if (event.target === panel) {
        const bounds = panel.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          panel.close();
      }
    });
    const trigger =
      document.querySelector("[data-budget-menu]") || document.activeElement;
    panel.addEventListener("close", () => {
      document.removeEventListener("keydown", handleKey);
      panel.remove();
      (trigger?.isConnected
        ? trigger
        : document.querySelector("[data-budget-menu]")
      )?.focus();
    });
    document.body.append(panel);
    return panel;
  }

  function button(label, action, secondary = false) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = label;
    if (secondary) control.className = "secondary";
    control.addEventListener("click", action);
    return control;
  }

  function create(sourceId = "", rename = false) {
    if (budgetTransition || app.inert) return;
    const source = budgetCollection.budgets.find(
      (entry) => entry.id === sourceId,
    );
    const first = !budgetCollection.budgets.length;
    const panel = dialog(
      rename ? "Rename Budget" : source ? "Duplicate Budget" : "Create Budget",
    );
    const form = document.createElement("form");
    const label = document.createElement("label");
    label.textContent = "Budget Name";
    const name = document.createElement("input");
    name.name = "budgetName";
    name.required = true;
    name.maxLength = 100;
    name.value = rename
      ? source.name
      : library.suggestName(
          budgetCollection,
          source ? `${source.name} Copy` : "My Budget",
        );
    label.append(name);
    form.append(label);
    let selected = "50/30/20";
    const fileLabel = document.createElement("label");
    fileLabel.textContent = "Budget Backup File";
    fileLabel.hidden = true;
    const file = document.createElement("input");
    file.type = "file";
    file.name = "budgetBackup";
    file.accept = "application/json,.json";
    fileLabel.append(file);
    if (!source) {
      const choices = document.createElement("fieldset");
      const legend = document.createElement("legend");
      legend.textContent = "Start With";
      choices.append(legend);
      const options = [
        ...library.templates,
        { id: "import", label: "Import a File", categories: [] },
      ];
      for (const template of options) {
        const choice = document.createElement("label");
        choice.className = "budget-template";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "strategy";
        input.value = template.id;
        input.checked = template.id === selected;
        input.addEventListener("change", () => {
          selected = input.value;
          fileLabel.hidden = selected !== "import" || platform.isAndroid;
          file.required = selected === "import" && !platform.isAndroid;
          submit.textContent = selected === "import" ? "Import Budget" : "Create";
        });
        const text = document.createElement("span");
        const title = document.createElement("strong");
        title.textContent =
          template.label + (template.id === "50/30/20" ? " — Default" : "");
        const detail = document.createElement("small");
        detail.textContent =
          template.categories
            .map(([category, percentage]) => `${category} ${percentage}%`)
            .join(" · ") ||
          (template.id === "import"
            ? "Create a New Budget From a Backup"
            : "Start Without Categories");
        text.append(title, detail);
        choice.append(input, text);
        choices.append(choice);
      }
      form.append(choices, fileLabel);
    }
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    error.className = "budget-dialog-error";
    const actions = document.createElement("div");
    actions.className = "actions";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = rename ? "Save" : source ? "Duplicate" : "Create";
    let completed = false;
    let submitting = false;
    actions.append(
      submit,
      button("Cancel", () => {
        if (!submitting) panel.close();
      }, true),
    );
    form.append(error, actions);
    panel.append(form);
    async function save(defaults = false) {
      if (submitting) return;
      try {
        const newName = library.validateName(
          budgetCollection,
          defaults ? library.suggestName(budgetCollection) : name.value,
          rename ? sourceId : "",
        );
        submitting = true;
        submit.disabled = true;
        panel.dataset.submitting = "true";
        panel.setAttribute("aria-busy", "true");
        let success;
        if (!defaults && selected === "import" && !source) {
          const request = { id: id(), name: newName };
          let value;
          if (platform.isAndroid) {
            value = await platform.importFile(`new-budget:${JSON.stringify(request)}`);
          } else {
            if (!file.files[0]) throw new Error("Choose a budget backup file.");
            value = await file.files[0].text();
          }
          if (value == null) return;
          success = await importNewBudget(value, request);
        } else {
          success = await changeBudgetLibrary((next) => {
            if (rename) {
              next.budgets.find((entry) => entry.id === sourceId).name = newName;
              return next;
            }
            const data = source
              ? library.committedState(
                  next.budgets.find((entry) => entry.id === sourceId).data,
                )
              : library.templateState(defaults ? "50/30/20" : selected);
            return library.add(next, newName, data, id());
          });
        }
        if (success) {
          completed = true;
          panel.close();
        } else if (!panel.isConnected) create();
      } catch (failure) {
        error.textContent = failure.message;
        name.focus();
      } finally {
        submitting = false;
        submit.disabled = false;
        delete panel.dataset.submitting;
        panel.removeAttribute("aria-busy");
      }
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });
    panel.addEventListener("cancel", (event) => {
      if (submitting) event.preventDefault();
    });
    panel.addEventListener("close", () => {
      if (first && !activeBudget() && !completed && !submitting) save(true);
    });
    panel.showModal();
  }

  function open() {
    if (budgetTransition || app.inert) return;
    const trigger = document.querySelector("[data-budget-menu]");
    const bounds = trigger.getBoundingClientRect();
    const panel = dialog("Budgets", "budget-dropdown");
    const width = Math.min(360, window.innerWidth * 0.9);
    panel.style.setProperty("--budget-menu-top", `${bounds.bottom + 8}px`);
    panel.style.setProperty(
      "--budget-menu-right",
      `${Math.max(8, Math.min(window.innerWidth - bounds.right, window.innerWidth - width - 8))}px`,
    );
    trigger.setAttribute("aria-expanded", "true");
    const close = () => panel.close();
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close);
    panel.addEventListener("close", () => {
      window.budgetMobile.closeActionMenu();
      trigger.setAttribute("aria-expanded", "false");
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close);
    });
    panel.addEventListener("scroll", () =>
      window.budgetMobile.closeActionMenu(),
    );
    const closeButton = button("", () => panel.close());
    closeButton.className = "ghost budget-close";
    closeButton.setAttribute("aria-label", "Close Budgets Menu");
    closeButton.title = "Close";
    closeButton.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>';
    panel.append(closeButton);
    const list = document.createElement("div");
    list.className = "budget-list";
    for (const entry of budgetCollection.budgets) {
      const row = document.createElement("section");
      row.className = "budget-list-entry";
      const active = entry.id === budgetCollection.activeBudgetId;
      if (active) row.classList.add("is-active");
      const openBudget = button(entry.name, async () => {
        if (
          active ||
          (await changeBudgetLibrary((next) => {
            next.activeBudgetId = entry.id;
            return next;
          }))
        )
          panel.close();
      });
      openBudget.className = "budget-open ghost";
      openBudget.setAttribute(
        "aria-label",
        `Open ${entry.name}${active ? ", Current Budget" : ""}`,
      );
      if (active) openBudget.setAttribute("aria-current", "true");
      const actions = document.createElement("div");
      actions.className = "actions budget-row-actions";
      actions.append(
        button("Download save file", () => {
          const target = budgetCollection.budgets.find((budget) => budget.id === entry.id);
          if (!target) return;
          panel.close();
          downloadSaveFile(library.committedState(target.data), target.id);
        }, true),
        button(
          "Rename",
          () => {
            panel.close();
            create(entry.id, true);
          },
          true,
        ),
        button(
          "Duplicate",
          () => {
            panel.close();
            create(entry.id);
          },
          true,
        ),
        button(
          "Delete",
          async () => {
            if (
              !window.confirm(
                `Delete “${entry.name}”? This permanently removes this budget and its unfinished forms. Export a backup first if you want to keep it.`,
              )
            )
              return;
            if (
              await changeBudgetLibrary((next) =>
                library.remove(next, entry.id),
              )
            ) {
              budgetHistories.delete(entry.id);
              panel.close();
              window.budgetMobile.clearRecovery(entry.id);
              if (!activeBudget()) create();
            }
          },
          true,
        ),
      );
      row.append(openBudget, actions);
      list.append(row);
    }
    panel.append(
      list,
      button("Create or Import Budget", () => {
        panel.close();
        create();
      }),
    );
    panel.querySelectorAll(".budget-row-actions").forEach((actions) => {
      window.budgetMobile.addActionMenu(
        actions,
        actions.parentElement.querySelector(".budget-open").textContent,
      );
    });
    panel.showModal();
  }

  window.addEventListener("budget-render", () => {
    const header = document.querySelector(".app-header");
    const heading = header?.querySelector(".budget-heading");
    if (!heading) return;
    const trigger = button("", open, true);
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14M5 12h14M5 18h14" /></svg>';
    trigger.dataset.budgetMenu = "";
    trigger.className = "ghost budget-menu-button";
    trigger.setAttribute("aria-label", "Open Budgets Menu");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    if (!activeBudget()) {
      app.querySelectorAll(":scope > section").forEach((section) => {
        section.hidden = true;
      });
    }
    heading.append(trigger);
  });
  async function restoreImport(result) {
    try {
      const request = JSON.parse(result.budgetId.slice("new-budget:".length));
      if (await importNewBudget(result.value, request))
        document.querySelector(".budget-dialog")?.close();
    } catch (error) {
      window.alert(`Could not import the budget: ${error.message}`);
    }
  }
  window.budgetLibraryUI = { create, open, restoreImport };
})();
