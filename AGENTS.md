# Project Instructions

- Before changing application behavior, UI, data handling, or design, read `implementation-shared.md` plus the affected platform reference (`implementation.md` for browser, `android/implementation.md` for Android) and preserve its documented features unless the user explicitly requests a change.
- When a task adds, removes, or materially changes a feature or design behavior, update the shared and/or affected platform implementation reference in the same change. Document platform differences explicitly; implementation references describe completed behavior, while planned work belongs in plan documents.
- Keep Android and browser semantic versions matched through shared APP_VERSION. Feature-branch commits do not need version bumps. Bump once when preparing changes for main, ensuring the pushed version is higher than remote main; do not bump per iterative commit unless the user explicitly requests it.
- Keep all generated or modified code well formatted and easy for a human developer to read, edit, and maintain.
- For every UI change, verify balanced spacing, visual alignment, and centered icons/text at desktop and phone widths, including long names and enlarged text. Check the rendered result, not only CSS dimensions.
- When application logic changes, add or update the relevant unit tests and run them before handing off the change.
- Use the Ponytail approach for code changes: first reuse existing helpers, patterns, and native platform features whenever possible instead of duplicating code.
- When a change makes code, state fields, styles, handlers, or UI paths unused, remove that obsolete code in the same change when it is safe to do so.
