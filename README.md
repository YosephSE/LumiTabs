# LumiPanel - Chrome Side Panel Extension

A side-panel bookmark manager with themes, fonts, shortcuts, and metadata previews.
Built with React + Vite + TypeScript.

## Features
- Save current or all open tabs, with duplicate protection.
- Keyboard shortcuts for toggling the panel and saving the current page.
- Theming: system default plus NoteBar-inspired Light/Dark/Ocean palettes.
- Fonts: Manrope, Source Sans 3, and Work Sans.
- Metadata previews (favicon, title, URL) and quick open/delete.
- Settings persisted in `chrome.storage.local`; legacy `localStorage` data is migrated automatically.

## Development
```bash
npm install
npm run dev   # serves the panel at http://localhost:5173
npm run build # outputs dist/ with manifest for loading unpacked
```

Load the unpacked extension from `dist/` after `npm run build`
(or from the repo root for quick dev with `manifest.json`).

## Shortcuts
- Save current tab: `Ctrl+Shift+U`

Shortcuts are managed in Chrome at `chrome://extensions/shortcuts`.
