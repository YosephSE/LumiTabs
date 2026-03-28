# Tabs - Browser Extension (Chrome + Firefox)

A side-panel/sidebar bookmark manager with themes, fonts, shortcuts, and metadata previews.
Built with React + Vite + TypeScript.

## Features
- Save current or all open tabs, with duplicate protection.
- Keyboard shortcuts for activating the extension and saving the current page.
- Theming: system default plus Light/Dark/Ocean palettes.
- Fonts: Manrope, Source Sans 3, and Work Sans.
- Metadata previews (favicon, title, URL) and quick open/delete.
- Settings and saved links are persisted in extension local storage.

## Development
```bash
npm install
npm run dev
```

## Build Targets
```bash
npm run build:chrome   # outputs dist/chrome
npm run build:firefox  # outputs dist/firefox
npm run build:all      # outputs both
```

`npm run build` defaults to `build:chrome`.

## Loading the Extension
- Chrome: load unpacked from `dist/chrome`.
- Firefox: load temporary add-on from `dist/firefox/manifest.json`.

## Firefox (AMO-ready) Notes
- Firefox manifest includes:
  - `browser_specific_settings.gecko.id = "tabs@app.local"`
  - `browser_specific_settings.gecko.data_collection_permissions.required = ["none"]`
- If you need a different AMO ID, edit `manifests/manifest.firefox.json`.

## Shortcuts
- Activate extension: `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS)
- Save current tab: `Ctrl+Shift+U`

Shortcut management is browser-specific and is opened from the extension Settings screen.
