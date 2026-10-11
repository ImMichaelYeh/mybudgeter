# Shared Implementation Reference

This document records the intentionally implemented behavior of MyBudgeter. Treat these items as product requirements: do not remove or substantially change them unless the user explicitly asks to do so.

## Application model and save compatibility

- MyBudgeter is a client-side budgeting app with no server dependency.
- A small semantic app version appears after the desktop app title and directly beneath the title on phone layouts. Android and browser use the same APP_VERSION; it stays unchanged during iteration until the preceding version is committed to GitHub or the user explicitly requests a bump.
- Export creates a JSON backup of the full budget. Importing a save replaces the current budget after confirmation. Each file records the current semantic app version and a schema tied to its major version.
- The exported state includes incomes, categories, items, notes, ordering, colors, grouping, collapse state, and relevant app preferences.
- Normalization keeps older saves from the current major version usable and supplies defaults for newer fields. A new major version is reserved for a save-format change that cannot import earlier files; backwards-compatible product changes use a minor version and fixes or non-visible changes use a patch version.

## Page layout and global conventions

- Both platforms retain navy surfaces, serif headings, gold actions, and persistent category colors.

- Visible labels accompany form controls so their meaning remains clear even when a field already has a value.
- Displayed currency amounts use comma thousands separators and two decimal places, including income, items, quantity calculations, groups, category metrics, and summaries. Browsers choose their currency symbol from browser language/region; Android uses the device's language-and-region locale, as documented in the platform references. This changes only the symbol, without exchange-rate conversion, changing numeric editor values, or changing saved amounts.
- Category Budget, Spending/Saving, Remaining figures and item/group money summaries adapt to their available width: keep the full two-decimal amount when it fits, then use truncated compact k/m/b/t/q/Q suffixes (thousands through quintillions), with fewer compact decimals if necessary. Extremely large values use scientific notation. Full amounts remain in accessible labels and tooltips; calculations, editors, and backups retain exact values. Resizing and period changes refit the displays.
- Titles and button labels use capitalized wording.
- Save and Cancel controls use consistent themed colors that remain legible on every category color.
- Income, category, item, and group actions are accessed through a named hamburger menu button. Browser menus offer Edit and Remove; Android adds Move for categories, items, and groups (income retains Edit/Remove). Menus close on selection, outside click, scrolling, resize, Escape, or Android Back. Arrow keys/Home/End navigate menu options; Escape/Back returns focus to the trigger. Remove actions ask for confirmation. The confirmation dialog offers a Do Not Ask Again For 5 Minutes option, stored for the current app session.
- The browser footer reads Michael Yeh © followed by the current calendar year. JavaScript supplies the year so it changes automatically.

## Net Income

- Net Income defaults to collapsed for new budgets and preserves its last saved expanded/collapsed state, including Android recreation/session recovery. Existing entries start in display mode, overriding saved edit identities; expanding Income does not automatically enter edit mode. Choose Edit from an entry's hamburger menu to open its editor. Recovered Android income drafts remain hidden until Edit is chosen. Users can expand or collapse Income during the current session without losing active form fields. Its heading has an expand/collapse control beside its income summary, wrapping on narrow screens.
- The income summary shows the number of income sources and total for its selected period, with a dropdown directly after the amount's slash. Weekly, Biweekly, Semi-monthly, Monthly, Quarterly, and Annually use the existing normalized income calculations. Monthly is the default for new/older budgets; the selection saves independently of Budget Board and Complete Summary, including backups and Android recovery. The selector remains available with Income collapsed or expanded. Changing it updates only this displayed total and preserves income recurrence settings and open editor fields.
- Add Income appears after the last income item and creates a new editable income item.
- The income edit form has labeled Income Source, Amount, Frequency, and Notes fields. It opens inside the existing income entry card beneath its display summary and actions, using the full card width on both platforms. Save and Cancel retain their existing behavior.
- Income frequency defaults to Biweekly. Semi-monthly is available for two payments each month. Per Paycheck is not offered because it does not state an actual recurrence interval.
- Saving updates the compact income item and hides its edit form. Cancelling a newly added item removes it.
- Each saved income item shows its name, amount, period, and, when present, `Note: ` followed by its note. Items can be edited or removed.
- Selecting Add Income scrolls the new item’s edit form into view.

## Budget Board and categories

- The Budget Board is collapsible and uses the same expand/collapse behavior as Net Income. Its collapsed state shows category count plus spending and savings for the selected Budget Period.
- Net Income, Budget Board, Notes, and FAQ preserve their saved expanded/collapsed state through reloads, relaunches, backups, and Android recovery. Notes defaults to expanded. Complete Summary always displays its selected period and has no collapse control; old summary collapse preferences are ignored. Collapsing sections preserves active fields.
- Categories are equal-width responsive cards. Their colors are assigned when created and persist when categories are reordered.
- A category has a name, Budget Percentage, Savings Category checkbox, and a persistent color.
- Category hamburger menus include Color. Its modal offers a color picker and a labeled six-digit hex value, with Save/Cancel. Save updates only that category's color without resetting open editors; Cancel, Escape, and Android Back leave it unchanged. Custom colors persist through relaunch, reordering, and exports/imports. Categories keep the same light text for every background color.
- A new category is created as an empty editable card at the next card position, not as a separate top-of-board form. The page scrolls to it.
- The Add Category button shows a plus icon beside its label beneath all categories, inside Budget Board. Browser layouts use a compact centered 160-pixel-wide button with a 48-pixel minimum height; Android uses a full-width button as documented in its platform reference.
- Saving a category requires both a name and a Budget Percentage greater than zero. Missing requirements are highlighted in red with a visible error message.
- If the name is exactly Savings, ignoring letter case, the Savings Category checkbox automatically turns on until the user changes that checkbox themselves.
- The default 20% Savings category is marked as a savings category.
- The board shows Categories Total (the sum of category budget percentages). It omits the Categorized percentage and Used/Remaining target counter, and only adds a warning when category targets exceed 100%.
- The category-target warning uses a strong red (#ef4444), stays visible when the board is collapsed, and appears beside the Budget Board title on desktop. On phone browsers and Android it occupies a separate line below the title, keeping the collapse control on the title row.
- Category headers show budget percentage, actual percentage of monthly net income represented by the category’s items, and whether the category is Savings or Expenses.
- Budget Board has a Budget Period selector for Weekly, Biweekly, Semi-monthly, Monthly, Quarterly, and Annually. It defaults to Monthly for a new budget and preserves the last saved selection on browser page loads and Android launch/recreation, including session recovery, independently of the Complete Summary period. Budget, Spending/Saving, Remaining, group/subgroup totals, and the collapsed board totals all use the selected period. Category target labels read Budget. Percentages and progress ratios stay unchanged. Changing periods preserves open editors and item recurrence frequencies.
- Desktop Categories Total and Budget Period have generous horizontal spacing. Phone browsers and Android show Categories Total left aligned and Budget Period right aligned in one compact row, with the selector beside its label. Labels can wrap inside their columns on narrow screens.
- Phone browsers and Android offer a circular category collapse control beside the category name. Collapsing hides all items, groups, and the item add button while retaining the category name, percentages, menu, Budget/Spending or Saving/Remaining figures, and progress bar. Category collapse preferences save by category ID and survive relaunch, reordering, backups, and recreation; older saves default to expanded. Toggling preserves editor fields and nested group collapse preferences. Desktop offers the same category collapse control when Categories Per Row is 1. With 2 or 3 columns, all contents remain visible and controls are hidden, retaining saved preferences for a return to one column.
- The category progress bar displays the actual amount used relative to its category target; the percentage label is based on items currently entered. Category metrics and the collapsed Budget Board summary use Spending and Saving labels for totals in the selected target period.
- Categories support manual insertion and swapping; platform-specific controls are documented separately.
- Category order is always the custom manual order; there is no category sort control.

## Expenses, savings, quantities, and frequencies

- Add Expense and Add Savings appear after the last item in the selected category and create a new item there. Group Add Item creates an item in that group. These actions use centered circular buttons with a geometrically centered 16-pixel plus icon, matching the translucent background, inherited color, and size of collapse/hamburger controls: 32 pixels on desktop and a visible 36-pixel circle within a 48-pixel phone touch target. Accessible labels and tooltips identify the action; group labels include their full path.
- Desktop newly added items are scrolled into view. Phone browsers and Android preserve the visible item position when creating or editing items.
- Item editors set Name, Amount, Quantity, and Period Frequency. Group membership is maintained by drag/drop or Move rather than a manual field. Editors remain inside their original bordered item card, including inside nested groups.
- Expense and savings items can be created or edited with an amount of $0.00. Amount remains required; negative and non-finite amounts are rejected. Zero-value items persist in backups and contribute zero to totals.
- Quantity accepts decimal values for prorated recurring costs, such as quantity 0.5 for a cost that occurs every two years but is entered as annual.
- The quantity spinner and arrow keys move in whole-number increments. Arrow Up rounds to the next whole number and Arrow Down rounds to the prior whole number, with a minimum of 1 for those controls.
- When quantity differs from 1, an item shows the calculation: single item cost × quantity = total, followed by its period frequency.
- Items omit group-path tags; their surrounding group/subgroup cards communicate membership. Amount/frequency summaries follow the name inline on the same row, wrapping only when needed. Group paths remain available in Move destinations, and hiding tags does not change saved membership.
- Item summaries show amount / frequency without a percentage. Group and subgroup summaries show their normalized total and frequency matching Budget Period (for example, $500.00 / Semi-monthly), without a percentage. Existing quantity calculations remain visible when quantity differs from 1.
- Items use the available recurrence frequencies, including Semi-monthly, and all calculations normalize them to monthly amounts for comparison and summaries.

## Groups and item organization

- Group headers include a named expand/collapse action, normalized selected-period total, and an action menu for Edit/Remove. The group title stays bold; its amount and frequency use regular-weight text. Items retain Edit/Remove in their menus; Copy is not offered.
- Combining an item with another item creates a group. Items can join or leave existing groups; groups can become subgroups while retaining descendants.
- Dragging an item into an existing group shows Add To Group on both platforms; edge insertion hints retain their ordering labels.
- There is no item sort-by filter; organization is manual.

- Items with the same group name in a category are rendered together as one group card. Groups can contain subgroups at any depth; their saved group path uses `Parent / Child` notation.
- Each item inside a group has its own inset, rounded, bordered box with a subtle background, matching subgroup styling while keeping the item name, details, and menu together.
- A collapsed group shows only its identity and selected-period total.
- Groups and subgroups at every depth preserve their last saved expanded or collapsed state on browser page reloads and Android launch/recreation, including session recovery. Groups without a saved preference start expanded. Moving or editing entries does not automatically reset their collapse state. Recovered form fields inside collapsed groups are retained for later expansion.
- Editing a group name renames every item in that group and all of its subgroups. Moving an individual item changes only its membership, allowing it to leave or enter a group.
- Groups retain one Add Item button at the bottom, hidden when collapsed; Add Subgroup is not offered. Dropping an item in the center of another group member creates a named subgroup under the destination member's group, retaining both items and other siblings. Edge drops retain ordering. Deleting a parent group removes all descendants.
- Groups and individual items can be reordered manually. Groups can be moved alongside regular items, including above or below them.
- While an income, category, item, or group editor is open, card dragging and reordering are disabled so editor text can be selected normally. Save or cancel editing to resume organization; Android Move asks users to finish editing first. Notes does not disable organization.
- Groups and items can move between categories. Moving a group transfers the entire group tree, including all subgroups and items, so no copy remains in the original category.

## Complete Summary

- Complete Summary shows one selected period at a time with a labeled selector for Weekly, Biweekly, Semi-monthly, Monthly, Quarterly, and Annually. Monthly is the default; the selection saves with the budget. Switching periods preserves open editor fields. Semi-monthly is half the monthly total (24 periods per year), distinct from Biweekly.
- Each period card shows Income, Savings, Uncategorized, Total Unspent, and Total Spent.
- On desktop, the selected period's five totals appear as individual boxes with centered labels above values and fill the available width horizontally. Phone browsers and Android show five plain rows with labels on the left, values on the right, and subtle line separators. Total Unspent stays green and Total Spent stays red.
- The period is shown only in the selector; no repeated period heading appears above the total boxes.
- Complete Summary omits the visible Period label on both platforms; the dropdown retains its accessible name Complete Summary Period. On phone browsers and Android, it sits on the same row as the title; long titles wrap within their available column. Desktop keeps the dropdown centered in the section.
- Uncategorized replaces the former Remaining wording in this section.
- Total Unspent includes both Savings and Uncategorized amounts.
- Total Spent is shown below Total Unspent and uses red styling.

## Notes

- Notes is a dedicated section below Complete Summary. Its expand/collapse control sits at the right side of the heading row, opposite the Notes title. Collapsing hides the editor and shows the full note as read-only plain text with line breaks preserved and no box; expanding restores the editor. The saving help sentence is omitted.
- It is a simple plain-text textarea with no Markdown mode, formatting toolbar, or rich-text behavior.
- The Notes field starts at a compact two-row size (64-pixel minimum), grows to fit saved or typed text, and shrinks again when text is removed. It refits wrapped text on window resizing without an internal vertical scrollbar.
- Notes autosave with the rest of the budget and are included in exported save files.

## FAQs Section

- The heading reads FAQs Section on both platforms, using the shared section-heading and hint styles so title and expand/collapse typography, weight, color, and spacing match the other sections. It is the bottom section above the footer, defaults to collapsed for new budgets, and preserves its saved section state. Each detailed question is also collapsed by default and explains budget calculations, frequency calculations, available budgeting features, local save-file behavior and privacy, and unsupported capabilities including bank connections, automatic transaction imports, cloud sync, and shared budgets.

## Source structure

- `index.html` loads the app shell and browser scripts.
- `src/budget.js` owns state defaults, import validation/normalization, sorting, budget calculations, and mobile organization operations.
- `src/platform.js` provides browser storage or restricted Android messaging.
- `src/mobile.js` enhances phone accessibility, Android touch dragging/Move controls, and draft/scroll recovery.
- `src/app-template.js` renders the base HTML for the main sections.
- `src/main.js` manages persistence, events, dynamic UI, form labeling, collapse controls, confirmation dialogs, grouping, drag and drop, and import/export.
- `src/style.css` contains the responsive layout, card colors, controls, and drag/drop indicators.
- `test/budget.test.js` and `test/mobile-budget.test.js` use Node's built-in test runner to protect budget defaults, frequency normalization, summary calculations, category usage, and sorting behavior. Run it with `node --test`.

## Save safety

- Import validates the schema, collection shapes, safe unique identifiers, text fields, finite nonnegative numeric fields, frequencies, and editor/group preferences before confirmation. Legacy numeric strings remain supported.
- Replacement imports persist successfully before becoming the working budget. Invalid files and canceled imports leave the current budget unchanged.
- Failed saves retain working changes and offer Retry Save; Saved appears only after successful persistence. Unreadable saved data is preserved with recovery controls instead of silently resetting.
- Input fields use visible labels and decimal keyboard hints. Destructive dialogs have named dialog semantics, focus trapping, and Escape cancellation.
