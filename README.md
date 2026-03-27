# Tabs - Chrome Side Panel Extension

A side-panel bookmark manager with themes, fonts, shortcuts, and metadata previews.
Built with React + Vite + TypeScript.

## Features
- Save current or all open tabs, with duplicate protection.
- Keyboard shortcuts for activating the extension and saving the current page.
- Theming: system default plus Light/Dark/Ocean palettes.
- Fonts: Manrope, Source Sans 3, and Work Sans.
- Metadata previews (favicon, title, URL) and quick open/delete.
- Settings and saved links are persisted in `chrome.storage.local`.

## Development
```bash
npm install
npm run dev   # serves the panel at http://localhost:5173
npm run build # outputs dist/ with manifest for loading unpacked
```

Load the unpacked extension from `dist/` after `npm run build`
(or from the repo root for quick dev with `manifest.json`).

## Shortcuts
- Activate extension (open side panel): `Ctrl+Shift+Y` (`Command+Shift+Y` on macOS)
- Save current tab: `Ctrl+Shift+U`

Shortcuts are managed in Chrome at `chrome://extensions/shortcuts`.
