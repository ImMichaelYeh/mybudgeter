# Browser Implementation Reference

Read [shared behavior](implementation-shared.md) alongside this document. Android differences are recorded in [android/implementation.md](android/implementation.md).

## Browser behavior

- The page title and app header read My Budget Planner. The subtitle reads "My budget planner is designed to help you categorize your income." Android continues to omit the subtitle.
- Browser currency symbols follow navigator.language on desktop and phone browsers. An explicit locale region determines the currency; language-only settings use Intl.Locale's likely region. A bundled region/currency table derived from Unicode CLDR 48, current as of 2026-10-11, keeps this offline and needs no location permissions or network requests. Unsupported regions, invalid language settings, or older browsers without Intl.Locale fall back to USD. Detection runs before rendering on each page load; only the symbol changes, without currency conversion or changes to saved amounts. Comma grouping and two decimals remain consistent.
- The working budget is automatically saved in browser local storage. A brief Saved status is shown after persistence.
- The header keeps Download Save File and Import Save File controls together at the top right.
- The save help text explains that the budget is stored locally in the browser, recommends downloading a backup, and warns that importing overwrites current data.
- The page uses a wide, responsive layout that grows with the browser window up to a 1600px content width rather than staying in a narrow fixed column. Its content gutters and Michael Yeh masthead align with the portfolio at the same browser width.
- The masthead loads the canonical Michael Yeh navigation stylesheet from the portfolio site.
- Categories and expense/savings items have no grab icons or reserved grip space; dragging their card surface retains the existing drag behavior. Categories can be manually reordered with center and edge drag targets. Dropping in the center swaps categories; dropping on the left or right edge inserts between categories.
- Groups and subgroups have no grab icons or reserved grip space; their existing card/header drag behavior remains available.
- Add Category follows the shared compact, centered bottom-row layout; opening it still creates the existing full category editor.
- Category menus offer Edit, Color, and Remove; Color follows the shared picker behavior.
- Budget Board offers a Categories Per Row selector on desktop with up to 1, 2, or 3 equal-width categories, defaulting to 3. Categories in an incomplete row expand equally to fill that row. The selection saves with the budget and changes layout without resetting open editor fields. Phone browsers retain one column and hide the selector.
- Desktop Budget Board metadata places Categories Total on the left, Budget Period centered in the section, and Categories Per Row on the right. Equal outer columns keep the period centered regardless of the outer labels' widths; controls can wrap when space is limited.
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
- Browser category editors retain their existing live draft autosave behavior.
- Storage uses MyBudgeter-save-v1, with a 150ms save debounce and pending-save flushes on page hide/background.

- Desktop Complete Summary centers its frequency dropdown without visible Period text, using equal outer columns to match Budget Board. The accessible name remains Complete Summary Period. Phone browsers retain the title-row selector.
- Phone browser item creation/editing retains the visible item position and avoids automatic smooth scrolling; desktop new-item scrolling remains available.

- Phone browsers use the compact title-row backup icons and version beneath the title, matching Android while retaining browser download/import behavior. Desktop keeps labeled backup buttons and the inline version.
