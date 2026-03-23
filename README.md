# LumiPanel - Chrome Side Panel Extension

A side-panel bookmark manager with themes, fonts, shortcuts, and metadata previews. Built with React + Vite + TypeScript.

## Features
- Save current or all open tabs, with duplicate protection.
- Keyboard shortcuts (toggle panel, save page) with fallback handling and user overrides.
- Theming: system default plus NoteBar-inspired Light/Dark/Ocean palettes.
- Fonts: choose between Manrope, Source Sans 3, and Work Sans.
- Metadata previews (favicon, title, URL) and quick open/delete.
- Settings persisted in chrome.storage.local; legacy localStorage data is migrated automatically.

## Development
`ash
npm install
npm run dev   # serves the panel at http://localhost:5173
npm run build # outputs dist/ with manifest for loading unpacked
`

Load the unpacked extension from dist/ after 
pm run build (or from the repo root for quick dev with manifest.json).

## Shortcuts
- Toggle panel: Alt+Shift+L (fallbacks: Alt+Shift+K, Alt+Shift+U)
- Save current tab: Alt+Shift+S (fallbacks: Alt+Shift+D, Alt+Shift+P)

Adjust shortcuts in Settings; we attempt the new combo and show a toast if unavailable.
