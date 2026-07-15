# MyBudgeter

MyBudgeter is a browser-based personal budgeting board. Add income sources, assign monthly budget targets to categories, and track recurring expenses or savings items at different frequencies. The board converts entries to monthly amounts so you can compare actual spending, savings, and unspent income against your budget.

Key features include:

- Income sources with notes and configurable frequency.
- Drag-and-drop budget categories, items, and groups.
- Expense and savings categories with monthly targets, actual percentages, and summary totals.
- Grouped items, recurring cost quantities, and a personal notes area.
- Automatic local browser saving, plus download and import of save files for backup.

Open `index.html` in a modern browser to use the app. Your budget is stored locally in that browser; download a save file regularly for a safe backup. Importing a save file replaces the current budget.

## Versioning

The app follows semantic versioning. Increase the major version only when old save files can no longer be imported, the minor version for backwards-compatible features, and the patch version for fixes or non-visible changes. Update `APP_VERSION` in `src/budget.js` for every commit; exported save files record that same version. Git is configured to use `.githooks/pre-commit`, which blocks commits that do not update it; clone users can enable it with `git config core.hooksPath .githooks`.

## Testing

Run `node --test` to execute the budgeting logic tests.
