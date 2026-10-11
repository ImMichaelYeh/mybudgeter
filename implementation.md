# Browser Implementation Reference

Read [shared behavior](implementation-shared.md) alongside this document. Android differences are recorded in [android/implementation.md](android/implementation.md).

## Browser behavior

- Desktop supports Ctrl+Z to undo and Ctrl+Shift+Z or Ctrl+Y to redo (Command+Z/Command+Shift+Z also work). Session history retains every distinct saved change without a fixed step limit, including income/items/categories, colors, nested grouping and ordering, notes, collapse/layout/period preferences, and successfully persisted imports. Repeated identical saves and opening/closing editors do not create steps. New changes after undo clear redo history. Restored budgets autosave through the normal error/retry path. Uncommitted new income/category drafts are excluded; restored entries display normally.
- Text fields retain native text undo/redo. Budget shortcuts outside text fields confirm before discarding changed editor fields and do not operate inside dialogs, during dragging, or while an import is in progress. Undo/redo announces Undone/Redone. History is held in memory for the current page session, resets on reload/close, and is not exported or shared across tabs. Android and phone browsers do not enable this desktop history.

- The page title and app header read My Budget Planner. The subtitle reads "My budget planner is designed to help you categorize your income." Android and detected mobile browsers omit the subtitle.
- Browser currency symbols follow navigator.language on desktop and phone browsers. An explicit locale region determines the currency; language-only settings use Intl.Locale's likely region. A bundled region/currency table derived from Unicode CLDR 48, current as of 2026-10-11, keeps this offline and needs no location permissions or network requests. Unsupported regions, invalid language settings, or older browsers without Intl.Locale fall back to USD. Detection runs before rendering on each page load; only the symbol changes, without currency conversion or changes to saved amounts. Comma grouping and two decimals remain consistent.
- The working budget is automatically saved in browser local storage. A brief Saved status is shown after persistence.
- The header keeps Download Save File and Import Save File controls together at the top right.
- The save help text explains that the budget is stored locally in the browser, recommends downloading a backup, and warns that importing overwrites current data.
- The page uses a wide, responsive layout that grows with the browser window up to a 1600px content width rather than staying in a narrow fixed column. Its content gutters and Michael Yeh masthead align with the portfolio at the same browser width.
- The masthead loads the canonical Michael Yeh navigation stylesheet from the portfolio site.
- Categories and expense/savings items have no grab icons or reserved grip space; dragging their card surface retains the existing drag behavior. Categories can be manually reordered with center and edge drag targets. Dropping in the center swaps categories. Outer thirds and empty gaps insert between categories: left/right for multiple columns and top/bottom for one column or gaps between rows.
- Groups and subgroups have no grab icons or reserved grip space; their existing card/header drag behavior remains available.
- Add Category follows the shared compact, centered bottom-row layout; opening it still creates the existing full category editor.
- Category menus offer Edit, Color, and Remove; Color follows the shared picker behavior.
- Budget Board offers a Categories Per Row selector on desktop with up to 1, 2, or 3 equal-width categories, defaulting to 3. Categories in an incomplete row expand equally to fill that row. The selection saves with the budget and changes layout without resetting open editor fields. Phone browsers retain one column and hide the selector.
- Desktop Budget Board combines its title, Categories Total, Budget Period dropdown, Categories Per Row dropdown, and collapse control in one header row. Controls wrap when space is limited; the collapse control stays on the right. Mobile retains its separate title and metadata rows.
- Desktop shows category collapse controls when Categories Per Row is 1. They use the shared saved category preferences and hide only items, groups, and the add-item button. Switching to 2 or 3 shows all category contents and hides the controls without clearing collapse preferences; switching back to 1 reapplies them without resetting editors.
- Hamburger and group collapse buttons are equal-width/height 32-pixel circles with 16-pixel icons. Phone browser layouts use 48-pixel touch targets around 36-pixel visible circles.
- Edge indicators show the exact insertion location above or below categories, groups, normal items, and group members.
- Dropping an item on a normal item or a group combines it into a group (creating a new group when necessary). Dropping a group on another group makes the moved group, including its descendants, a subgroup rather than merging both groups. Edge drops retain edge insertion behavior.
- Dragging an item out of a group clears its group tag. When moving it out, edge insertion before or after a group remains available and is visually indicated.
- Center-dropping onto a group member creates a subgroup containing the two items; edge drops insert before/after that member.
- Dropping an item into a group assigns that group. Normal items can also be inserted above or below group members without changing the group.
- Adding an item to an existing group preserves that group's position among its siblings; it does not swap the incoming item's order with a group member.
- Dropping an item before or after a subgroup inserts it in that subgroup's parent, including parents containing only subgroups. Group-edge insertion uses the shared tree-aware movement helper.

- Desktop organization uses mouse drag and drop; phone layouts stack cards and fields vertically.
- Net Income defaults to collapsed under the shared preference rules; entries use hamburger menus with Edit/Remove actions, including on initial page load. Menu options have a small visible gap.
- Net Income, Budget Board, and Notes controls use Click To Expand/Collapse wording and preserve the saved section state. FAQ retains its native disclosure control and saves its section state.
- The browser uses its existing local storage key and JSON download/import workflow.

- At widths up to 720px, cards/forms stack vertically with 48px action targets, wrapping text, compact gutters, and no accumulating subgroup indentation. Desktop responsive category columns and all drag/drop handlers remain available.
- Desktop browser category editors retain their existing live draft autosave behavior.
- Storage uses MyBudgeter-save-v1, with a 150ms save debounce and pending-save flushes on page hide/background.

- Desktop Complete Summary centers its frequency dropdown without visible Period text, using equal outer columns to match Budget Board. The accessible name remains Complete Summary Period. Phone browsers retain the title-row selector.
- Phone browser item creation/editing retains the visible item position and avoids automatic smooth scrolling; desktop new-item scrolling remains available.

- Phone browsers use the compact title-row backup icons and version beneath the title, matching Android while retaining browser download/import behavior. Desktop keeps labeled backup buttons and the inline version.

- Detected mobile browsers (Android, iPhone/iPad, mobile user-agent metadata, and iPad desktop-mode touch identification) reuse the Android phone interface in portrait and landscape: compact app header without portfolio masthead/subtitle, one category column, compact metrics, touch dragging with preview/guidance, Move menus, Tap wording, and the contact footer. Desktop browser behavior stays available on desktop devices. The mobile layout uses the shared mobile-app CSS class; native Android messaging remains separate.
- Mobile browsers retain browser local storage, locale-based currency detection, downloads and HTML file imports, and browser-specific storage/backup help. Budgets do not sync automatically with Android. Mobile category edits commit on Save; Cancel discards changes. Native document pickers, app-private storage, Back handling, and Android draft/lifecycle recovery remain native-only.
