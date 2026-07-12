# Implementation Reference

This document records the intentionally implemented behavior of mybudgeter. Treat these items as product requirements: do not remove or substantially change them unless the user explicitly asks to do so.

## Application model and persistence

- mybudgeter is a client-side budgeting app with no server dependency.
- The working budget is automatically saved in browser local storage. A brief Saved status is shown after persistence.
- The header keeps Download Save File and Import Save File controls together at the top right.
- Download exports the full budget as JSON for backup. Importing a JSON save replaces the current budget after confirmation.
- The save help text explains that the budget is stored locally in the browser, recommends downloading a backup, and warns that importing overwrites current data.
- The exported state includes incomes, categories, items, notes, ordering, colors, grouping, collapse state, and relevant app preferences.
- Normalization keeps older saved data usable and supplies defaults for newer fields.

## Page layout and global conventions

- The page uses a wide, responsive layout that grows with the browser window rather than staying in a narrow fixed column.
- Visible labels accompany form controls so their meaning remains clear even when a field already has a value.
- Titles and button labels use capitalized wording.
- Save and Cancel controls use consistent themed colors that remain legible on every category color.
- Delete X controls ask for confirmation. The confirmation dialog offers a Do Not Ask Again For 5 Minutes option, stored for the current browser session.
- The footer reads Michael Yeh © followed by the current calendar year. JavaScript supplies the year so it changes automatically.

## Net Income

- Net Income is collapsible. Its heading has a click to collapse / click to expand control on the same line as the income summary.
- The collapsed summary shows the number of income sources and normalized monthly income.
- Add Income is a large, visible action. The income form is hidden until it is requested.
- The add/edit form has labeled Income Source, Amount, Frequency, and Notes fields.
- Income frequency defaults to Biweekly. Per Paycheck is not offered because it does not state an actual recurrence interval.
- Saving creates or updates a compact income item and hides the form. Cancel also hides it without saving new form input.
- Each saved income item shows its name, amount, period, and, when present, `Note: ` followed by its note. Items can be edited or removed.
- Selecting Add Income scrolls the newly displayed form into view.

## Budget Board and categories

- The Budget Board is collapsible and uses the same click to collapse / click to expand language as Net Income. Its collapsed state shows category count plus monthly spending and savings.
- Complete Summary is intentionally not collapsible.
- Categories are equal-width responsive cards. Their colors are assigned when created and persist when categories are reordered.
- A category has a name, Budget Percentage, Savings Category checkbox, and a persistent color.
- A new category is created as an empty editable card at the next card position, not as a separate top-of-board form. The page scrolls to it.
- Saving a category requires both a name and a Budget Percentage greater than zero. Missing requirements are highlighted in red with a visible error message.
- If the name is exactly Savings, ignoring letter case, the Savings Category checkbox automatically turns on until the user changes that checkbox themselves.
- The default 20% Savings category is marked as a savings category.
- The board shows Categories Total (the sum of category budget percentages) and Categorized (the actual monthly expenses plus savings as a percentage of monthly net income). It does not show a Used/Remaining target counter, and only adds a warning when category targets exceed 100%.
- Category headers show budget percentage, actual percentage of monthly net income represented by the category’s items, and whether the category is Savings or Expenses.
- The category progress bar displays the actual amount used relative to its category target; the percentage label is based on items currently entered.
- Categories have a wide, separate drag grip above their name. They can be manually reordered with center and edge drag targets. Dropping in the center swaps categories; dropping on the left or right edge inserts between categories.
- Category order is always the custom manual order; there is no category sort control.

## Expenses, savings, quantities, and frequencies

- Add Expense and Add Savings create a new item in the selected category. Group Add Item creates an item in that group. These actions add an item rather than showing a separate top-of-category add form.
- Newly added items are scrolled into view, including when the action occurs lower than the visible viewport.
- An item can be edited to set Name, Amount, Quantity, Period Frequency, and optional Group.
- Quantity accepts decimal values for prorated recurring costs, such as quantity 0.5 for a cost that occurs every two years but is entered as annual.
- The quantity spinner and arrow keys move in whole-number increments. Arrow Up rounds to the next whole number and Arrow Down rounds to the prior whole number, with a minimum of 1 for those controls.
- When quantity differs from 1, an item shows the calculation: single item cost × quantity = total, followed by its period frequency.
- Items use the available recurrence frequencies and all calculations normalize them to monthly amounts for comparison and summaries.
- Expense and savings items have a drag icon on the left and an edit control. The old Copy action is not shown.

## Groups and item organization

- Items with the same group name in a category are rendered together as one group card. Groups can contain subgroups at any depth; their saved group path uses `Parent / Child` notation.
- A group header has a visual drag grip, an icon-based expand/collapse control to the left of its name, the group’s normalized monthly total, Edit, and Delete controls.
- A collapsed group shows only its identity and monthly total.
- Editing a group name renames every item in that group and all of its subgroups. Editing an individual item’s group changes only that item, allowing it to leave or enter a group.
- The group actions at the bottom include Add Item and Add Subgroup. Add Subgroup creates a nested group with a new editable item; deleting a parent group removes all of its descendants.
- Groups and individual items can be reordered manually. Groups can be moved alongside regular items, including above or below them.
- Groups and items can move between categories. Moving a group transfers the entire group tree, including all subgroups and items, so no copy remains in the original category.
- Edge indicators show the exact insertion location above or below categories, groups, normal items, and group members.
- Dropping an item on a normal item or a group combines it into a group (creating a new group when necessary). Dropping a group on another group makes the moved group, including its descendants, a subgroup rather than merging both groups. Edge drops retain edge insertion behavior.
- Dragging an item out of a group clears its group tag. When moving it out, edge insertion before or after a group remains available and is visually indicated.
- Dropping an item into a group assigns that group. Normal items can also be inserted above or below group members without changing the group.
- The board intentionally has no item sort-by filter; manual dragging is the organizational method.

## Complete Summary

- Complete Summary presents normalized totals for Weekly, Biweekly, Monthly, Quarterly, and Annual periods.
- Each period card shows Income, Savings, Uncategorized, Total Unspent, and Total Spent.
- Uncategorized replaces the former Remaining wording in this section.
- Total Unspent includes both Savings and Uncategorized amounts.
- Total Spent is shown below Total Unspent and uses red styling.

## Notes

- Notes is a dedicated section below Complete Summary.
- It is a simple plain-text textarea with no Markdown mode, formatting toolbar, or rich-text behavior.
- Notes autosave with the rest of the budget and are included in downloaded save files.

## Source structure

- `index.html` loads the app shell and browser scripts.
- `src/budget.js` owns state defaults, normalization, sorting, and budget calculations.
- `src/app-template.js` renders the base HTML for the main sections.
- `src/main.js` manages persistence, events, dynamic UI, form labeling, collapse controls, confirmation dialogs, grouping, drag and drop, and import/export.
- `src/style.css` contains the responsive layout, card colors, controls, and drag/drop indicators.
- `test/budget.test.js` uses Node's built-in test runner to protect budget defaults, frequency normalization, summary calculations, category usage, and sorting behavior. Run it with `node --test`.
