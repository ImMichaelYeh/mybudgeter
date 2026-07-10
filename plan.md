## Plan: Budgeter web app

TL;DR: Build a lightweight, browser-based budgeting app that can be opened directly in a browser from a local file. The product direction is now a very simple board-style experience: a compact income section at the top, a row of category columns below for planning percentages and expenses, and a bottom summary covering weekly, biweekly, monthly, quarterly, and annual views. The app should stay easy to use, visually clear, and fully local-first.

### Status snapshot
Completed so far:
- Created a simple browser-based app shell that opens directly from the repository entry page.
- Implemented basic income, category, and expense entry flows.
- Added budget calculations for monthly totals, category targets, progress indicators, and multi-period summary values.
- Added local auto-save using browser storage and savefile output for local backup.
- Reworked the UI toward a simpler board-style layout with removable items and no demo data by default.
- Split the UI rendering into a separate template module to create a cleaner foundation.

Current direction:
- Keep the interface minimal and visual rather than form-heavy.
- Make income entry simple and collapsible while still showing a summary at a glance.
- Use category columns as the primary planning surface, with percentages and expenses inside each column.
- Enforce that category percentages stay at or below 100% total, with automatic adjustment when percentages are changed.
- Keep everything local-first and easy to reopen from the same file-based workflow.

Still to do next:
- Refine the category board so the column widths and proportions feel more intuitive.
- Improve the editing experience for percentages and category names.
- Add clearer empty states and validation feedback for the board.
- Strengthen save/load behavior and make the local save workflow more robust.
- Add tests for the core calculation logic once the interface is stable.

### 1. Product scope and goals
- Create a web app that helps users plan spending using a flexible percentage-based budget system.
- Support both gross and net income input, with a simple income model that can be extended later if needed.
- Allow users to define their own categories and percentages instead of being locked into a 50/30/20 structure.
- Show visual progress for each category and make it easy to add expense items.
- Support recurring income and expense frequencies such as daily, weekly, biweekly, monthly, quarterly, and annually.
- Include auto-save so changes persist automatically as the user edits the budget.
- Provide spending views for annual, monthly, weekly, and per-paycheck calculations.
- Add sorting features for categories and expense items to improve usability.

### 2. Recommended technical approach
- Keep the app lightweight and browser-based so it can be opened directly from a local file.
- Use plain HTML, CSS, and JavaScript for the first version so the app is easy to access and share.
- Keep the initial version client-side with local file-based persistence so the budget can be easily transferred between devices or backups.
- Use auto-save to write a local save file automatically after meaningful changes.
- Make the save format versioned and backward-compatible so future updates can read older files safely.
- Avoid a full backend at first; add one later only if export, syncing, or multi-device support becomes important.
- Use a small, explicit data model for incomes, expenses, categories, and calculation rules.

### 3. MVP feature set
1. App shell and navigation
   - Create a single-page app layout with sections for income, categories, and expenses.
   - Add a clear summary view showing total budgeted amount, remaining budget, category progress, and spending totals by period.

2. Income input
   - Allow the user to enter one or more income sources.
   - Support amount, frequency, and optional retirement contribution assumptions.
   - Provide a simple net-income calculation path for common cases.
   - Auto-save updates as the user edits income sources.

3. Category configuration
   - Allow the user to create custom categories with a name and a target percentage.
   - Support editing and deleting categories.
   - Automatically calculate the target budget amount from the active income total.
   - Support sorting categories by name, percentage, or current usage.

4. Expense management
   - Let each category contain multiple expense items.
   - Each expense should have a name, amount, and frequency.
   - Convert recurring expenses into normalized views for annual, monthly, weekly, and per-paycheck comparisons.
   - Support sorting expenses by name, amount, or frequency.

5. Visual progress
   - Show a progress bar for each category.
   - Color-code progress based on whether the user is under, near, or over budget.
   - Show remaining room in the category clearly.

### 4. Data model
Define a simple structure for the core entities:
- Income source: name, amount, frequency, gross/net flag, retirement contribution, notes.
- Budget category: name, percentage target, list of expenses, computed budget amount, sort order.
- Expense item: name, amount, frequency, category reference, sort order.
- App state: current income total, category allocations, expense totals, remaining budget, and the currently selected period view.

### 5. Calculation rules
- Normalize all income and expenses into a common period, preferably monthly, for comparison.
- Support frequency conversion for daily, weekly, biweekly, monthly, quarterly, and annually.
- Calculate category targets based on the selected percentage of the active income total.
- Display category usage as actual spending divided by the category target.
- Provide totals for annual, monthly, weekly, and per-paycheck views.
- Keep calculations deterministic and easy to audit.

### 6. Implementation phases
Phase 1: Foundation
- Set up the project structure and basic UI shell. Done.
- Create the core data model and local file-based persistence. Done.
- Implement auto-save and restore the last saved state on load from a local save file. Done.
- Design a versioned save-file schema that can be upgraded safely in future releases. In progress.
- Add sample seed data for a first-run experience. Done.

Phase 2: Income and category management
- Build forms for adding and editing income sources. In progress.
- Build forms for adding and editing budget categories. In progress.
- Connect category percentages to the overall budget calculation. Done.
- Add sorting controls for categories and expense lists. Done.

Phase 3: Expense tracking and progress views
- Build the expense entry flow by category. Done.
- Implement frequency conversion and budget comparison logic. Done.
- Add progress bars, summary cards, and period-based totals. Done.

Phase 4: Polish and usability
- Improve form validation and empty states. Planned.
- Add editing, deletion, and import/export support if time allows. Planned.
- Add responsive styling and a nicer visual layout. Planned.
- Add unit tests for core budgeting logic after the app stabilizes. Planned.

### 7. Scope boundaries for the first release
Included in MVP:
- Custom categories and percentages
- Income source entry
- Expense entry and frequency handling
- Progress bars and summary totals
- Auto-save to a local save file
- Local persistence that is easy to transfer and back up
- Annual, monthly, weekly, and per-paycheck calculations
- Sorting for categories and expenses

Deferred for later:
- Full tax engine with complex payroll rules
- Advanced retirement contribution handling across pre-tax and post-tax systems
- User accounts or cloud sync
- Multi-user or collaborative budgeting
- Advanced tax estimate helper

### 8. Verification checklist
- The app loads in a browser without errors. Verified.
- A user can create a category and assign a percentage. Verified.
- A user can add income and expenses with different frequencies. Verified.
- The app shows budget totals and progress correctly. Verified.
- Data auto-saves to a local file and loads correctly after refresh or reopen. Verified.
- A save file can be moved or backed up and still be read by the app. Planned for stronger validation.
- Totals and category usage can be viewed across annual, monthly, weekly, and per-paycheck periods. Verified.
- Sorting changes are reflected in the UI. Verified.

### 9. Decisions for implementation
- The first version should include conversions across frequencies from the start.
- The app should focus on fully flexible categories from day one.
- The tax estimate helper should be deferred for later.

### 10. Suggested handoff notes for Codex
- Prioritize simplicity and correctness over advanced financial modeling.
- Keep the UI lightweight and easy to use on first launch.
- Build the core budget engine first, then add polish.
- Prefer a small number of well-structured screens over a complex navigation model.
- When adding more features, keep local-file compatibility and backward compatibility in mind.
