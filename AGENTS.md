# Project Instructions

- Before changing application behavior, UI, data handling, or design, read `implementation.md` and preserve its documented features unless the user explicitly requests a change.
- When a task adds, removes, or materially changes a feature or design behavior, update `implementation.md` in the same change so it remains the authoritative record of the implemented product.
- Keep all generated or modified code well formatted and easy for a human developer to read, edit, and maintain.
- When application logic changes, add or update the relevant unit tests and run them before handing off the change.
- Use the Ponytail approach for code changes: first reuse existing helpers, patterns, and native platform features whenever possible instead of duplicating code.
- When a change makes code, state fields, styles, handlers, or UI paths unused, remove that obsolete code in the same change when it is safe to do so.
