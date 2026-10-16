(() => {
  const android = window.budgetPlatform.isAndroid;
  const mobile = window.budgetPlatform.isMobile;
  let sessionTimer;
  let restoring = false;
  let checkpointValue = "";
  let sessions = { schema: "MyBudgeter-sessions-v1", budgets: {} };
  let sessionsLoaded = false;
  let sessionLoad;
  let sessionQueue = Promise.resolve();
  let checkpointWrite = Promise.resolve();
  let closeBackupHelp;

  function setupBackupHelp() {
    const button = document.querySelector("[data-backup-help]");
    const tooltip = document.querySelector("#backup-help-tooltip");
    closeBackupHelp = null;
    if (!button || !tooltip) return;
    let pinned = false;
    const show = (open) => {
      tooltip.hidden = !open;
      button.setAttribute("aria-expanded", String(open));
    };
    closeBackupHelp = () => {
      const wasOpen = !tooltip.hidden;
      pinned = false;
      show(false);
      return wasOpen;
    };
    button.parentElement.onmouseenter = () => show(true);
    button.parentElement.onmouseleave = () => {
      if (!pinned && document.activeElement !== button) show(false);
    };
    button.onfocus = () => {
      if (button.matches(":focus-visible")) show(true);
    };
    button.onblur = closeBackupHelp;
    button.onclick = () => {
      pinned = !pinned;
      show(pinned);
    };
  }

  function enhance() {
    setupBackupHelp();
    document.querySelectorAll('input[type="number"]').forEach((input) => {
      input.inputMode = "decimal";
    });
    document
      .querySelectorAll("[data-remove-expense], [data-remove-group]")
      .forEach((button) => {
        button.setAttribute(
          "aria-label",
          button.dataset.removeGroup
            ? `Delete ${button.dataset.removeGroup} Group`
            : "Delete Item",
        );
      });
    document
      .querySelectorAll("[data-toggle-income], [data-toggle-budget-board]")
      .forEach((button) => {
        button.setAttribute(
          "aria-expanded",
          String(button.textContent.toLowerCase().includes("collapse")),
        );
      });
    if (!mobile) {
      addActionMenus();
      return;
    }
    document.querySelectorAll(".item-group-header").forEach((header) => {
      const name = header.querySelector(":scope > h4");
      const total = header.querySelector(":scope > .group-total");
      if (!name || !total) return;
      const row = document.createElement("div");
      row.className = "group-name-row";
      name.before(row);
      row.append(name, " ", total);
    });
    document.querySelectorAll(".category-column").forEach((column) => {
      const metrics = column.querySelector(".column-metrics");
      const progress = column.querySelector(".progress-bar");
      const label = progress?.querySelector(".progress-label");
      if (!metrics || !label || column.querySelector(".category-stats")) return;
      const stats = document.createElement("div");
      stats.className = "category-stats";
      metrics.before(stats);
      stats.append(metrics, progress, label);
    });
    document.title = "My Budget Planner";
    document
      .querySelectorAll(
        ".column-header h3, .item-group-header h4, .expense-item strong",
      )
      .forEach((handle) => {
        handle.tabIndex = 0;
        handle.dataset.dragHandle = "";
        handle.setAttribute(
          "aria-description",
          "Hold, then drag to organize. With a keyboard, use Alt and the up or down arrow to reorder.",
        );
      });
    document.querySelectorAll("[draggable]").forEach((node) => {
      node.removeAttribute("draggable");
      if (node.matches(".expense-item") && node.querySelector("form")) return;
      const category = node.closest("[data-category-id]")?.dataset.categoryId;
      let source;
      let actions;
      if (node.matches(".category-column")) {
        actions = node.querySelector(".column-header > .actions");
        source = { type: "category", id: category };
      } else if (node.matches(".item-group")) {
        source = {
          type: "group",
          categoryId: category,
          group: node.dataset.groupName,
        };
        actions = node.querySelector(":scope > .item-group-header .actions");
      } else if (node.matches(".expense-item")) {
        source = {
          type: "item",
          categoryId: category,
          id: node.dataset.expenseId,
        };
        actions = node.querySelector(".actions");
      }
      if (!actions || !source) return;
      const move = document.createElement("button");
      move.type = "button";
      move.className = "ghost small-button";
      move.textContent = "Move";
      move.dataset.moveEntry = "";
      move.disabled =
        source.type === "category" && currentState.categories.length < 2;
      move.onclick = () => openMove(source);
      actions.prepend(move);
    });
    const file = document.querySelector("[data-import-save]");
    if (file && android) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.innerHTML =
        file.closest("label").querySelector(".backup-icon").outerHTML +
        '<span class="backup-label">Import Save File</span>';
      button.setAttribute("aria-label", "Import Save File");
      button.title = "Import Save File";
      button.onclick = async () => {
        try {
          const budgetId = budgetCollection.activeBudgetId;
          await importBudget(await platform.importFile(budgetId), budgetId);
        } catch (error) {
          window.alert(error.message);
        }
      };
      file.closest("label").replaceWith(button);
    }
    const footer = document.querySelector(".app-footer");
    if (footer)
      footer.textContent =
        "Having issues? Contact my.development.life@gmail.com";
    const exportButton = document.querySelector("[data-download-save]");
    if (exportButton) {
      exportButton.querySelector(".backup-label").textContent =
        "Export Save File";
      exportButton.setAttribute("aria-label", "Export Save File");
      exportButton.title = "Export Save File";
    }
    document.querySelectorAll(".link-button.hint").forEach((button) => {
      button.textContent = button.textContent.replace(/click/gi, "Tap");
    });
    document.querySelectorAll(".faq-question").forEach((question) => {
      const title = question.querySelector("summary")?.textContent;
      if (android && title?.includes("saving, downloading")) {
        question.querySelector("summary").textContent =
          "How does saving, exporting, And importing Work?";
        question.querySelectorAll("p")[0].textContent =
          "Your budgets save automatically in this app's private storage on this device. Use the menu beside the budget name to create, switch, rename, duplicate, or delete budgets. Each budget keeps its own preferences and unfinished forms across relaunches. Export Save File backs up only the active budget, without its local name or unfinished forms. Import Save File replaces only the active budget after confirmation, keeps its local name, and leaves other budgets unchanged. Create a budget first to import separately. Browser and app budgets do not sync; transfer one budget at a time using export and import.";
      }
      if (android && title?.includes("stored and who")) {
        const paragraphs = question.querySelectorAll("p");
        paragraphs[0].textContent =
          "Your working budget is stored privately on this device. My Budget Planner has no server, account, or automatic cloud backup.";
        paragraphs[1].textContent =
          "Clearing app data or uninstalling removes the local budget. Export backups regularly. Anyone with access to your unlocked device or exported JSON can view the budget; treat backups as private financial information.";
      }
      if (title?.includes("What can I do")) {
        const paragraph = question.querySelectorAll("p")[1];
        paragraph.textContent = paragraph.textContent.replace(
          "drag categories, groups, and items",
          "hold a category header, item name, or group name, then drag to organize it; use Move to transfer items or groups",
        );
      }
    });
    addActionMenus();
  }

  let actionMenu;
  let menuToggle;

  function closeActionMenu(restoreFocus = false) {
    actionMenu?.remove();
    menuToggle?.setAttribute("aria-expanded", "false");
    if (restoreFocus) menuToggle?.focus({ preventScroll: true });
    actionMenu = menuToggle = null;
  }

  function addActionMenus() {
    closeActionMenu();
    document
      .querySelectorAll(
        ".income-item > .actions, .expense-item > .actions, .column-header > .actions, .item-group-header > .actions",
      )
      .forEach((actions) => addActionMenu(actions));
  }

  function addActionMenu(
    actions,
    name = actions.parentElement.querySelector("h3, h4, strong")?.textContent ||
      "Entry",
  ) {
    const controls = [...actions.children].filter((button) =>
      button.matches("button"),
    );
    if (!controls.length) return;
    controls.forEach((button) => {
      button.hidden = true;
    });
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "ghost small-button entry-menu-toggle";
    toggle.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>';
    toggle.setAttribute("aria-label", `Actions for ${name}`);
    toggle.setAttribute("aria-haspopup", "menu");
    toggle.setAttribute("aria-expanded", "false");
    toggle.onclick = () => {
      const wasOpen = menuToggle === toggle;
      closeActionMenu();
      if (wasOpen) return;
      menuToggle = toggle;
      toggle.setAttribute("aria-expanded", "true");
      const menu = document.createElement("div");
      menu.className = "entry-action-menu";
      menu.setAttribute("role", "menu");
      menu.setAttribute("aria-label", `Actions for ${name}`);
      controls.forEach((control) => {
        const option = document.createElement("button");
        option.type = "button";
        option.setAttribute("role", "menuitem");
        option.disabled = control.disabled;
        option.textContent =
          control.textContent.trim() === "×"
            ? "Remove"
            : control.textContent.trim();
        option.onclick = () => {
          closeActionMenu(true);
          control.click();
        };
        menu.append(option);
      });
      (actions.closest("dialog") || document.body).append(menu);
      actionMenu = menu;
      const rect = toggle.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(window.innerWidth - menu.offsetWidth - 8, rect.right - menu.offsetWidth))}px`;
      menu.style.top = `${Math.max(8, rect.bottom + menu.offsetHeight > window.innerHeight - 8 ? rect.top - menu.offsetHeight : rect.bottom)}px`;
      menu.querySelector("button:not(:disabled)")?.focus();
    };
    actions.append(toggle);
  }

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".backup-help")) closeBackupHelp?.();
    if (
      actionMenu &&
      !actionMenu.contains(event.target) &&
      !menuToggle.contains(event.target)
    )
      closeActionMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && closeBackupHelp?.()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!actionMenu) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeActionMenu(true);
    } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const options = [...actionMenu.querySelectorAll("button:not(:disabled)")];
      const index = options.indexOf(document.activeElement);
      options[
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) %
              options.length
      ]?.focus();
    } else if (event.key === "Tab") closeActionMenu(true);
  });
  window.addEventListener("scroll", () => {
    closeActionMenu();
    closeBackupHelp?.();
  }, { passive: true });
  window.addEventListener("resize", () => {
    closeActionMenu();
    closeBackupHelp?.();
  });

  let gesture;
  let holdTimer;
  let scrollFrame;
  let dropTarget;
  let destination;
  const dragStatus = document.createElement("span");
  if (mobile) {
    dragStatus.className = "drag-status";
    dragStatus.setAttribute("role", "status");
    document.body.append(dragStatus);
  }

  function dragSource(node) {
    const categoryId = node.closest("[data-category-id]").dataset.categoryId;
    if (node.matches(".category-column"))
      return { type: "category", id: categoryId };
    return node.matches(".item-group")
      ? { type: "group", categoryId, group: node.dataset.groupName }
      : { type: "item", categoryId, id: node.dataset.expenseId };
  }

  function endDrag() {
    clearTimeout(holdTimer);
    cancelAnimationFrame(scrollFrame);
    gesture?.node.classList.remove("touch-dragging");
    gesture?.preview?.remove();
    dropTarget?.classList.remove("touch-drop");
    dropTarget?.removeAttribute("data-touch-drop");
    if (gesture?.active) dragStatus.textContent = "Drag finished.";
    dragStatus.classList.remove("drag-status-visible");
    gesture = dropTarget = destination = null;
  }

  function showDragPreview() {
    const node = gesture.node;
    const content = node.matches(".expense-item")
      ? node.querySelector(":scope > div:not(.actions)")
      : node.querySelector(
          ":scope > .column-header, :scope > .item-group-header",
        );
    const preview = content.cloneNode(true);
    preview
      .querySelectorAll("button, .actions, form")
      .forEach((control) => control.remove());
    [preview, ...preview.querySelectorAll("*")].forEach((element) => {
      [...element.attributes].forEach((attribute) => {
        if (
          attribute.name.startsWith("data-") ||
          ["id", "tabindex", "draggable"].includes(attribute.name)
        )
          element.removeAttribute(attribute.name);
      });
    });
    preview.className = "touch-drag-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.inert = true;
    preview.style.width = `${Math.min(240, node.getBoundingClientRect().width)}px`;
    preview.style.backgroundColor = getComputedStyle(
      node.closest(".category-column"),
    ).backgroundColor;
    document.body.append(preview);
    gesture.preview = preview;
    positionDragPreview();
  }

  function positionDragPreview() {
    const preview = gesture.preview;
    const rect = preview.getBoundingClientRect();
    preview.style.left = `${Math.max(8, Math.min(window.innerWidth - rect.width - 8, gesture.x - rect.width / 2))}px`;
    preview.style.top = `${Math.max(rect.height + 8, gesture.y - 20)}px`;
  }

  function updateDrop() {
    dropTarget?.classList.remove("touch-drop");
    dropTarget?.removeAttribute("data-touch-drop");
    dropTarget = destination = null;
    dragStatus.textContent = "Move over a destination";
    const hit = document.elementFromPoint(gesture.x, gesture.y);
    const categoryGap =
      gesture.source.type === "category"
        ? getCategoryGapTarget(hit, gesture.x, gesture.y)
        : null;
    const category = categoryGap?.node || hit?.closest(".category-column");
    if (!category) return;
    const source = gesture.source;
    const node =
      source.type === "category"
        ? category
        : getEntryGapTarget(hit, gesture.y) ||
          hit.closest(".expense-item, .item-group") ||
          category;
    if (gesture.node === node || gesture.node.contains(node)) return;
    const rect = node.getBoundingClientRect();
    const fraction = (gesture.y - rect.top) / rect.height;
    const placement =
      categoryGap?.placement ||
      budget.getEntryDropPlacement(
        fraction,
        source.type === "category" ? "swap" : "combine",
      );
    const candidate = {
      categoryId: category.dataset.categoryId,
      placement:
        node === category && source.type !== "category" ? "append" : placement,
    };
    if (node !== category) candidate.target = dragSource(node);
    // Validate against a disposable budget so invalid subtree drops never appear available.
    if (
      !budget.moveBudgetEntry(
        JSON.parse(JSON.stringify(currentState)),
        source,
        candidate,
      )
    )
      return;
    destination = candidate;
    dropTarget = node;
    node.dataset.touchDrop = candidate.placement;
    node.classList.add("touch-drop");
    const operation = {
      before: "Drop Before",
      after: "Drop After",
      swap: "Swap Categories",
      append: "Move To Category",
      combine: node.matches(".item-group") ? "Add To Group" : "Create Group",
    }[candidate.placement];
    const name = node.matches(".category-column")
      ? currentState.categories.find(
          (entry) => entry.id === category.dataset.categoryId,
        )?.name
      : node.matches(".item-group")
        ? node.dataset.groupName
        : currentState.expenses.find(
            (entry) => entry.id === node.dataset.expenseId,
          )?.name;
    dragStatus.textContent = `${operation}: ${name}`;
  }

  function scrollDrag() {
    if (!gesture?.active) return;
    const edge = 64;
    const speed =
      gesture.y < edge ? -12 : gesture.y > window.innerHeight - edge ? 12 : 0;
    if (speed) {
      window.scrollBy(0, speed);
      updateDrop();
    }
    scrollFrame = requestAnimationFrame(scrollDrag);
  }

  if (mobile) {
    document.addEventListener("keydown", (event) => {
      if (
        hasOpenBudgetEditor() ||
        !event.altKey ||
        !["ArrowUp", "ArrowDown"].includes(event.key) ||
        !event.target.matches("[data-drag-handle]")
      )
        return;
      event.preventDefault();
      const node = event.target.closest(
        ".expense-item, .item-group, .category-column",
      );
      const siblings = [...node.parentElement.children].filter((entry) =>
        entry.matches(".expense-item, .item-group, .category-column"),
      );
      const step = event.key === "ArrowUp" ? -1 : 1;
      const neighbor = siblings[siblings.indexOf(node) + step];
      if (
        !neighbor ||
        (dirtyEditors() &&
          !window.confirm("Discard unsaved form changes before moving?"))
      )
        return;
      const source = dragSource(node);
      const target = dragSource(neighbor);
      if (
        !budget.moveBudgetEntry(currentState, source, {
          categoryId: target.categoryId || target.id,
          target: source.type === "category" ? null : target,
          placement: step < 0 ? "before" : "after",
        })
      )
        return;
      saveState(currentState);
      render(currentState);
      dragStatus.textContent = "Reordered.";
      const selector =
        source.type === "category"
          ? `[data-category-id="${CSS.escape(source.id)}"] h3`
          : source.type === "group"
            ? `[data-category-id="${CSS.escape(source.categoryId)}"] [data-group-name="${CSS.escape(source.group)}"] h4`
            : `[data-expense-id="${CSS.escape(source.id)}"] strong`;
      document.querySelector(selector)?.focus();
    });
    document.addEventListener(
      "touchstart",
      (event) => {
        endDrag();
        if (
          hasOpenBudgetEditor() ||
          event.touches.length !== 1 ||
          event.target.closest("button,input,select,textarea,a,form,dialog")
        )
          return;
        const handle = event.target.closest(
          ".column-header, .item-group-header, .expense-item",
        );
        const node = handle?.closest(
          ".expense-item, .item-group, .category-column",
        );
        if (!node) return;
        const touch = event.touches[0];
        gesture = {
          node,
          source: dragSource(node),
          x: touch.clientX,
          y: touch.clientY,
          active: false,
        };
        holdTimer = setTimeout(() => {
          gesture.active = true;
          dragStatus.classList.add("drag-status-visible");
          node.classList.add("touch-dragging");
          showDragPreview();
          dragStatus.textContent =
            "Dragging. Drop near an edge to reorder or in the center to group or swap.";
          window.getSelection()?.removeAllRanges();
          navigator.vibrate?.(20);
          scrollDrag();
        }, 350);
      },
      { passive: true },
    );
    document.addEventListener(
      "touchmove",
      (event) => {
        if (!gesture) return;
        if (event.touches.length !== 1) return endDrag();
        const touch = event.touches[0];
        if (!gesture.active) {
          if (
            Math.hypot(touch.clientX - gesture.x, touch.clientY - gesture.y) >
            10
          )
            endDrag();
          return;
        }
        event.preventDefault();
        gesture.x = touch.clientX;
        gesture.y = touch.clientY;
        positionDragPreview();
        updateDrop();
      },
      { passive: false },
    );
    document.addEventListener(
      "touchend",
      (event) => {
        if (!gesture) return;
        const source = gesture.source;
        const target = destination;
        if (gesture.active) event.preventDefault();
        endDrag();
        if (
          !target ||
          (dirtyEditors() &&
            !window.confirm("Discard unsaved form changes before moving?"))
        )
          return;
        if (!budget.moveBudgetEntry(currentState, source, target)) return;
        saveState(currentState);
        render(currentState);
        dragStatus.textContent = "Moved.";
      },
      { passive: false },
    );
    document.addEventListener("touchcancel", endDrag);
    document.addEventListener("contextmenu", (event) => {
      if (
        !hasOpenBudgetEditor() &&
        !event.target.closest("input,select,textarea,form") &&
        event.target.closest(
          ".column-header, .item-group-header, .expense-item",
        )
      )
        event.preventDefault();
    });
    window.addEventListener("blur", endDrag);
  }

  function openMove(source) {
    if (hasOpenBudgetEditor()) {
      window.alert("Save or cancel the open editor before moving entries.");
      return;
    }
    if (
      dirtyEditors() &&
      !window.confirm("Discard unsaved form changes before moving?")
    )
      return;
    const dialog = document.createElement("dialog");
    dialog.className = "move-dialog";
    const form = document.createElement("form");
    const heading = document.createElement("h2");
    heading.textContent = "Move";
    const field = (name, control) => {
      const label = document.createElement("label");
      label.className = "input-label";
      label.append(name, control);
      return label;
    };
    const search = document.createElement("input");
    search.type = "search";
    const category = document.createElement("select");
    const destination = document.createElement("select");
    const sourceGroup =
      source.type === "category"
        ? ""
        : source.type === "group"
          ? budget
              .splitGroupPath(source.group)
              .slice(0, -1)
              .join(budget.GROUP_SEPARATOR)
          : currentState.expenses.find((entry) => entry.id === source.id)
              ?.group || "";
    let targets = [];

    const refreshTargets = () => {
      if (source.type === "category") {
        destination.replaceChildren();
        ["before", "after", "swap"].forEach((placement) =>
          destination.add(
            new Option(
              placement[0].toUpperCase() + placement.slice(1),
              placement,
            ),
          ),
        );
        return;
      }
      targets = budget
        .getOrganizationTargets(currentState, category.value)
        .filter((target) => target.type === "group")
        .filter(
          (target) =>
            category.value !== source.categoryId ||
            target.group !== sourceGroup,
        )
        .filter(
          (target) =>
            !(
              source.categoryId === category.value &&
              (source.type === "item"
                ? target.type === "item" && target.id === source.id
                : budget.isGroupOrDescendant(target.group, source.group))
            ),
        )
        .filter((target) =>
          target.label.toLowerCase().includes(search.value.toLowerCase()),
        );
      destination.replaceChildren();
      if (category.value !== source.categoryId || sourceGroup)
        destination.add(new Option("Category Root", "root"));
      targets.forEach((target, index) =>
        destination.add(new Option(`Group: ${target.label}`, String(index))),
      );
      if (!destination.options.length)
        destination.add(new Option("Choose another category or group", ""));
    };
    const refreshCategories = () => {
      category.replaceChildren();
      budget
        .sortCategories(currentState)
        .filter((entry) => source.type !== "category" || entry.id !== source.id)
        .forEach((entry) => category.add(new Option(entry.name, entry.id)));
      if (
        [...category.options].some(
          (option) => option.value === source.categoryId,
        )
      )
        category.value = source.categoryId;
      refreshTargets();
    };
    const error = document.createElement("p");
    error.setAttribute("role", "alert");
    const actions = document.createElement("div");
    actions.className = "actions";
    const save = document.createElement("button");
    save.type = "submit";
    save.textContent = "Move";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = "Cancel";
    cancel.onclick = () => dialog.close();
    dialog.addEventListener("close", () => dialog.remove());
    search.oninput = refreshTargets;
    category.onchange = () => {
      refreshTargets();
    };

    form.onsubmit = (event) => {
      event.preventDefault();
      const target =
        destination.value === "root"
          ? null
          : targets[Number(destination.value)];
      if (
        source.type === "category"
          ? !budget.moveBudgetEntry(currentState, source, {
              categoryId: category.value,
              placement: destination.value,
            })
          : (!target && destination.value !== "root") ||
            !budget.moveBudgetEntry(currentState, source, {
              categoryId: category.value,
              target,
              placement: target ? "combine" : "append",
            })
      ) {
        error.textContent =
          "Choose a valid destination outside the moved group.";
        return;
      }
      saveState(currentState);
      dialog.close();
      render(currentState);
    };
    actions.append(save, cancel);
    form.append(heading);
    if (source.type !== "category")
      form.append(field("Search Destinations", search));
    form.append(
      field("Destination Category", category),
      field(
        source.type === "category" ? "Position" : "Destination",
        destination,
      ),
    );
    form.append(error, actions);
    dialog.append(form);
    document.body.append(dialog);
    refreshCategories();
    dialog.showModal();
  }

  function editorForms(includeRecovered = false) {
    return [...document.querySelectorAll("form")].filter(
      (form) =>
        !form.closest("dialog") &&
        (form.offsetParent !== null ||
          (form.matches(".income-edit-form") && !form.hidden) ||
          (includeRecovered &&
            (form.budgetRecoveredDraft || !form.matches(".income-edit-form")))),
    );
  }

  function dirtyEditors() {
    return editorForms().some((form) =>
      [...form.elements].some((field) =>
        field.type === "checkbox"
          ? field.checked !== field.defaultChecked
          : field.matches("input,textarea,select") &&
            (field.tagName === "SELECT"
              ? field.value !==
                [...field.options].find((option) => option.defaultSelected)
                  ?.value
              : field.value !== field.defaultValue),
      ),
    );
  }

  function captureSession() {
    if (!currentState || !activeBudget()) return null;
    return {
      budgetId: activeBudget().id,
      recoveryId: activeBudget().recoveryId,
      state: currentState,
      scroll: window.scrollY,
      forms: editorForms(true).map((form) => ({
        categoryId: form.closest("[data-category-id]")?.dataset.categoryId,
        dataset: { ...form.dataset },
        className: form.className,
        fields: [...form.querySelectorAll("input,select,textarea")].map(
          (field) => ({
            name: field.name,
            value: field.value,
            checked: field.checked,
          }),
        ),
      })),
    };
  }

  async function loadSessions() {
    if (sessionsLoaded) return;
    if (sessionLoad) return sessionLoad;
    sessionLoad = (async () => {
      const raw = await platform.loadSession();
      if (raw != null) {
        const stored = JSON.parse(raw);
        if (
          stored.schema === "MyBudgeter-sessions-v1" &&
          stored.budgets &&
          typeof stored.budgets === "object" &&
          !Array.isArray(stored.budgets)
        ) {
          sessions = stored;
        } else if (stored.state && activeBudget()) {
          sessions.budgets[activeBudget().id] = {
            ...stored,
            budgetId: activeBudget().id,
            recoveryId: activeBudget().recoveryId,
          };
        } else throw new Error("Invalid draft recovery data.");
      }
      sessionsLoaded = true;
    })();
    try {
      await sessionLoad;
    } finally {
      sessionLoad = null;
    }
  }

  function checkpoint(force = false, strict = false) {
    clearTimeout(sessionTimer);
    if (budgetTransition && !strict && !force) return sessionQueue;
    flushSave();
    if (restoring || !currentState || !activeBudget()) return sessionQueue;
    if (!sessionsLoaded) {
      return loadSessions().then(
        () => checkpoint(force, strict),
        (error) => {
          saveError = `Editor recovery could not be saved: ${error.message}`;
          showStorageError();
          if (strict) throw error;
        },
      );
    }
    const snapshot = captureSession();
    const value = JSON.stringify(snapshot);
    if (value === checkpointValue)
      return strict ? checkpointWrite : sessionQueue;
    checkpointValue = value;
    sessions.budgets[snapshot.budgetId] = JSON.parse(value);
    const payload = JSON.stringify(sessions);
    const write = sessionQueue.then(() => platform.saveSession(payload));
    checkpointWrite = write;
    sessionQueue = write.catch((error) => {
      if (checkpointValue === value) checkpointValue = "";
      saveError = `Editor recovery could not be saved: ${error.message}`;
      showStorageError();
    });
    return write.then(
      () => {
        if (saveError.startsWith("Editor recovery could not be saved:")) {
          saveError = "";
          document.querySelector(".storage-error")?.remove();
        }
      },
      (error) => {
        if (strict) throw error;
      },
    );
  }

  async function clearRecovery(budgetId) {
    try {
      await loadSessions();
      delete sessions.budgets[budgetId];
      checkpointValue = "";
      const payload = JSON.stringify(sessions);
      const write = sessionQueue.then(() => platform.saveSession(payload));
      sessionQueue = write.catch(() => {});
      await write;
    } catch (error) {
      window.alert(`Editor recovery could not be cleared: ${error.message}`);
    }
  }

  async function restore() {
    restoring = true;
    checkpointValue = "";
    try {
      await loadSessions();
    } catch (error) {
      window.alert(`Editor recovery is unavailable: ${error.message}`);
      restoring = false;
      return;
    }
    try {
      const session = sessions.budgets[activeBudget()?.id];
      if (
        !session ||
        session.budgetId !== activeBudget()?.id ||
        session.recoveryId !== activeBudget()?.recoveryId
      ) {
        window.scrollTo(0, 0);
        return;
      }
      const state = budget.normalizeSaveState(session.state);
      state.app.editingIncomeId = "";
      if (
        window.budgetLibrary.fingerprint(state) !==
        window.budgetLibrary.fingerprint(currentState)
      )
        return;
      currentState = state;
      render(state);
      for (const saved of session.forms || []) {
        if (saved.className === "group-rename-form") {
          const group = saved.dataset.renameGroup;
          const button = document.querySelector(
            `[data-category-id="${CSS.escape(saved.categoryId)}"] [data-rename-group="${CSS.escape(group)}"]`,
          );
          button?.click();
        }
        const form = [...document.querySelectorAll("form")].find(
          (candidate) =>
            candidate.className === saved.className &&
            Object.entries(saved.dataset).every(
              ([key, value]) => candidate.dataset[key] === value,
            ),
        );
        if (!form) continue;
        form.budgetRecoveredDraft = true;
        for (const field of saved.fields) {
          const control = [
            ...form.querySelectorAll("input,select,textarea"),
          ].find((candidate) => candidate.name === field.name);
          if (!control) continue;
          control.value = field.value;
          if (control.type === "checkbox") control.checked = field.checked;
        }
      }
      requestAnimationFrame(() => window.scrollTo(0, session.scroll || 0));
    } catch {
      window.alert(
        "Editor recovery could not be read. Your committed budget is still available.",
      );
    } finally {
      restoring = false;
    }
  }

  function handleBack() {
    if (budgetTransition) return true;
    if (closeBackupHelp?.()) return true;
    if (actionMenu) {
      closeActionMenu(true);
      return true;
    }
    if (gesture) {
      endDrag();
      return true;
    }
    const dialog = document.querySelector("dialog[open]");
    if (dialog) {
      dialog.close();
      return true;
    }
    const confirmation = document.querySelector(".delete-dialog-backdrop");
    if (confirmation) {
      confirmation.remove();
      return true;
    }
    const forms = editorForms();
    if (!forms.length) return false;
    if (dirtyEditors() && !window.confirm("Discard unsaved form changes?"))
      return true;
    for (const form of forms)
      form
        .querySelector(
          "[data-cancel-edit-income], [data-cancel-edit-expense], [data-cancel-edit-category], button.secondary",
        )
        ?.click();
    checkpoint();
    return true;
  }

  window.budgetMobile = {
    restore,
    checkpoint,
    clearRecovery,
    handleBack,
    addActionMenu,
    closeActionMenu,
  };
  window.addEventListener("budget-render", () => {
    enhance();
    if (!restoring && !budgetTransition) checkpoint();
  });
  document.addEventListener("input", () => {
    if (!restoring && !budgetTransition) {
      clearTimeout(sessionTimer);
      sessionTimer = setTimeout(checkpoint, 150);
    }
  });
  document.addEventListener("change", () => {
    if (!restoring && !budgetTransition) checkpoint();
  });
  window.addEventListener(
    "scroll",
    () => {
      if (!restoring && !budgetTransition) {
        clearTimeout(sessionTimer);
        sessionTimer = setTimeout(checkpoint, 150);
      }
    },
    { passive: true },
  );
  document.addEventListener("focusin", (event) => {
    if (mobile && event.target.matches("input,textarea,select")) {
      setTimeout(
        () =>
          event.target.scrollIntoView({ block: "nearest", behavior: "smooth" }),
        250,
      );
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") checkpoint();
  });
  window.addEventListener("pagehide", () => checkpoint());
})();
