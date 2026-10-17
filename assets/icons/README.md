# My Budget icon sources

- `app-source.png`: approved navy-backed artwork for Android and Apple touch icons.
- `favicon-source.png`: enlarged circular artwork with transparent outer corners for browser favicons.

Both sources were created with the built-in image generation tool. PNG/ICO exports were resized and encoded with Windows System.Drawing, preserving alpha for favicons.

Runtime browser exports are in `src/icons`. The Android raster is `android/app/src/main/res/drawable-nodpi/my_budget_foreground.png`; native adaptive-icon resources apply the smaller, centered placement. The Apple touch icon remains opaque; browser favicon PNGs and ICO frames retain transparent outer corners.

Earlier concepts, duplicate export sizes, preview sheets, and ZIP bundles have been removed. These two sources are retained for future exports.
