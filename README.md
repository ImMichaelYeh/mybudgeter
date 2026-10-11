# MyBudgeter

MyBudgeter is a local budgeting board for browsers and Android. Add income sources, assign monthly budget targets to categories, and track recurring expenses or savings items at different frequencies. The board converts entries to monthly amounts so you can compare actual spending, savings, and unspent income against your budget.

Key features include:

- Income sources with notes and configurable frequency.
- Drag-and-drop budget categories, items, and groups.
- Expense and savings categories with monthly targets, actual percentages, and summary totals.
- Grouped items, recurring cost quantities, and a personal notes area.
- Automatic local browser saving, plus download and import of save files for backup.

Open `index.html` in a modern browser to use the app. Your budget is stored locally in that browser; download a save file regularly for a safe backup. Importing a save file replaces the current budget.

## Versioning

The app follows semantic versioning. Increase the major version only when old save files can no longer be imported, the minor version for backwards-compatible features, and the patch version for fixes or non-visible changes. Keep browser and Android versions matched through `APP_VERSION` in `src/budget.js`; Android reads it at build time. Hold the current version during iteration until the preceding version is committed to GitHub or an explicit bump is requested. Exported save files record that same version. Git is configured to use `.githooks/pre-commit`, which blocks commits that do not update it; clone users can enable it with `git config core.hooksPath .githooks`.

## Testing

Run `node --test` to execute the budgeting logic tests.

## Android app

The Android project lives in `android/` and packages the same HTML, CSS, and JavaScript as the website. No separate Android repository or duplicated budget engine is required. My Budget Planner works offline on Android 8.0+ with Android System WebView/Chrome version 100+.

The app keeps the same budgeting features on one vertically scrolling page. Hold a category header, item name, or group name, then drag to organize it. Drop near an edge to insert before/after, or in the center to swap categories or group entries. Hold near a screen edge to scroll while dragging. The hamburger menu provides Edit/Remove and, on Android, Move. Move transfers items/groups between groups or categories; focused names also support Alt+Up/Down keyboard ordering. Budgets save privately on the device; **Export Save File** and **Import Save File** use Android's document picker. Browser and app budgets are separate: transfer a budget with a JSON backup. Clearing app data or uninstalling removes the local budget. Automatic cloud/device-transfer backup is disabled, so keep exported backups. Imports are limited to 16 MiB.

### Build and install

Install JDK 17 and Android SDK platform 36/build tools. Open `android/` in Android Studio to generate your local SDK configuration, or create an ignored `android/local.properties` with an escaped SDK path, for example `sdk.dir=C\:/Users/you/AppData/Local/Android/Sdk`.

From the repository root:

```powershell
.\android\gradlew.bat -p android :app:assembleDebug
adb install -r .\android\app\build\outputs\apk\debug\app-debug.apk
```

The debug APK is signed automatically for local installation. You can also transfer it to a phone and open it to install; Android may ask you to allow installation from that source. Retain the same debug key when installing updates; a different signing key requires backup and reinstall.

### Android checks

```powershell
node --test
.\android\gradlew.bat -p android :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
adb devices
$env:ANDROID_SERIAL = "emulator-5554" # Use the serial of your disposable test emulator.
.\android\gradlew.bat -p android :app:connectedDebugAndroidTest
```

Connected tests require an unlocked emulator/device. Budget interaction tests need a supported WebView; older providers exercise the update-instructions screen instead. These tests replace the installed app's budget with disposable fixtures, so use a dedicated test emulator rather than your personal budget installation. Tests cover offline loading, save recovery, draft recreation, phone layouts, and shared browser-mode dragging/storage. Native document-provider behavior and TalkBack should also be checked on the intended phone.

### Release signing

Create and retain a private signing keystore outside the repository. Build an unsigned release APK, then use your Android SDK's `apksigner`:

```powershell
.\android\gradlew.bat -p android :app:assembleRelease
apksigner sign --ks C:\private\MyBudgetPlanner.jks --ks-key-alias mybudgetplanner --out MyBudgetPlanner-release.apk .\android\app\build\outputs\apk\release\app-release-unsigned.apk
apksigner verify --verbose MyBudgetPlanner-release.apk
```

Let signing tools prompt for passwords; do not put secrets in source or command history. Use the same application ID and signing key for updates, and increase Android `versionCode` for each release. Keep Android `versionName` aligned with `APP_VERSION`. A release-signed APK cannot upgrade a debug-signed installation; export a backup before switching. Play Store publication is not included.

## Product references

- [Shared implementation](implementation-shared.md): common requirements and save compatibility.
- [Browser implementation](implementation.md): browser-specific layout, storage, and dragging.
- [Android implementation](android/implementation.md): Android UI, storage, lifecycle, and security behavior.
- [Approved Android plan](android/plan.md): the saved implementation plan.
