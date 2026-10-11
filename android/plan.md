# MyBudgeter Android Implementation Plan

## Summary

Add a Kotlin Android host in mybudgeter/android/, packaging shared HTML, CSS, and JavaScript into an offline WebView. Deliver a debug-signed APK named MyBudgetPlanner. Leave the separate Android repository untouched.

## Documentation

Keep implementation-shared.md for common requirements, root implementation.md for browser behavior, and android/implementation.md for completed Android behavior. Preserve root plan.md. Maintain this approved plan separately from implementation references. Update AGENTS.md and README.

## Foundation

Reuse the budget engine, templates, and events. Gradle packages shared assets without duplicate source. Add a platform adapter for load/save/import/export. Use WebViewAssetLoader at a fixed HTTPS origin; bundle styling locally and open external links in the browser. Restrict messaging to defined operations, the bundled origin, and main frame. Report unsupported WebView messaging. Use JDK 17, AGP 8.13.2, Gradle 8.13, compile/target SDK 36, and min SDK 26; pin dependencies and commit the wrapper.

## Mobile experience

Keep one scrolling page in existing section order with all five summary cards expanded. Stack cards/forms, preserve theme/colors/calculations, wrap long labels, reduce nested-group indentation without limiting depth, and eliminate horizontal overflow. Share phone-responsive improvements while retaining desktop dragging. Provide accessible 48px targets, decimal keyboards, focus/status announcements, inline editing, and keyboard-safe scrolling.
Replace Android dragging with searchable Move controls: category insertion/swapping; item/group category/group destinations and insertion positions; grouping, ungrouping, and subtree nesting. Reject invalid/self/descendant destinations and preserve collision behavior. Respect insets; Back closes keyboard/panels and confirms unsaved editor discard. Restore drafts and scroll after recreation.

## Persistence

Use serialized atomic app-private JSON writes and acknowledge Saved only after success. Retain failed changes for retry. Preserve unreadable data and offer recovery instead of silent reset. Flush pending changes on background/exit. Use native document pickers without broad storage permission. Validate imports before confirmation and persist before switching budgets. Preserve v1 compatibility and round trips. Explain separate browser/app storage and manual transfer; disable automatic Android cloud backup.

## Verification and delivery

Run existing Node tests (baseline 11 passing), add movement/subtree/order/collapse tests, and verify older v1/browser/app round trips. Test cancellation, malformed imports, failed writes, unreadable startup, and rapid saves. Check offline start, relaunch, background, rotation, process recreation, and upgrades. Check 320?430px widths, landscape, large text, TalkBack, deep groups, long names, keyboard, and desktop dragging/backups. Run Android tests, lint, and assembly; check API 26/36 emulators and a physical phone when available.
Document installation and release signing; keep secrets outside Git. MyBudgeter remains the page title; MyBudgetPlanner is the launcher name. No accounts, bank links, sync, notifications, or Play Store submission. Clearing app data/uninstall removes local budgets; exported backups remain necessary.
