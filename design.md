# LumiPanel Design PRD (for UI Redesign)

## 1) Product Summary

LumiPanel is a Chrome side-panel extension for quickly saving, organizing, and reopening links while browsing. The product is designed for fast capture (single tab, all tabs, pasted URLs, keyboard shortcut), lightweight organization (groups), and low-friction retrieval (search + filters + open).

Core product promise:
- Save now, organize as needed, find later in seconds.
- Keep interaction fast enough to use many times per day.

This redesign should improve visual quality, clarity, and information hierarchy **without reducing current capabilities**.

## 2) Users and Jobs-to-be-Done

Primary users:
- Heavy browser users (researchers, students, developers, PM/design teams).
- People who open many tabs and need quick triage.

Top jobs:
- Save the current tab instantly.
- Save all open tabs during context switching.
- Add links from clipboard/manual paste.
- Group related links and re-group later.
- Search/filter and reopen links quickly.
- Export/import library for backup or migration.

## 3) Current Feature Inventory (Must Preserve)

### Navigation
- Two primary sections:
  - `Links`
  - `Settings`
- Bottom nav with icon buttons.

### Links section
- Header title + quick actions:
  - `Save Current`
  - `Save All`
- Add link input (`paste URL + Enter` or button).
- Group filter chips:
  - `All`
  - `Ungrouped`
  - User-created groups
- Search input filters by title and URL.
- Link list cards show:
  - Favicon
  - Title
  - Relative timestamp
  - URL
  - Group tag
  - Group selector (move link between groups)
  - Open action
  - Delete action
- Empty state when no matches.

### Settings section
- Theme selector:
  - Match system
  - NoteBar Light
  - NoteBar Dark
  - NoteBar Ocean
- Font selector:
  - Manrope
  - Source Sans 3
  - Work Sans
- Shortcut editor:
  - Toggle panel command
  - Save current command
  - Applies on blur; invalid/unavailable combos are rejected.
- Group management:
  - Create group
  - Delete group
- Data transfer:
  - Export CSV
  - Export JSON
  - Import CSV
  - Import JSON
  - Import dedupes by URL and can create groups from import payload
- Danger zone:
  - Clear all links

### Feedback and system behavior
- Toast notifications for success/error status.
- Duplicate URL protection.
- URL validation/normalization (`https://` fallback).
- Legacy migration from localStorage key `myLeads`.
- Storage sync via `chrome.storage.local` and `chrome.storage.onChanged`.
- Keyboard command support from background worker, with fallback shortcut attempts.

## 4) Product Constraints

Platform and runtime:
- Chrome Extension Manifest V3.
- Side panel context (not full-page web app).

Layout constraints:
- Must work at narrow panel widths (current min width is 360px; design should handle ~320-420px gracefully).
- Full-height app with sticky/clear nav and scrollable main content.

Functional constraints:
- Keep existing information architecture (Links + Settings).
- Keep all existing actions and data states.
- Preserve theming + font personalization concepts (exact styling may change).
- Preserve keyboard-first speed (Enter to add, quick save actions, minimal interaction cost).

## 5) Current UX Pain Points (to Solve)

Observed opportunities from current implementation:
- Visual hierarchy is flat; quick actions, filters, and list compete for attention.
- Controls are dense and visually similar (buttons/pills/inputs feel same weight).
- Grouping model is powerful but not obvious (create/manage groups split across screens).
- Link card actions can feel busy for narrow width.
- Search/filter context is not strongly communicated (what subset is active).
- Settings page is functional but visually utilitarian and long.

## 6) Redesign Goals

1. **Increase scannability**
   - Faster recognition of primary actions and active context.
2. **Make organization feel deliberate**
   - Better affordances for groups, grouping state, and movement between groups.
3. **Improve card/list readability**
   - Clear title/url/time priority and less action clutter.
4. **Modernize visual language**
   - Distinct, intentional brand feel while still lightweight.
5. **Preserve speed**
   - No added friction for core workflows.

Success signals (qualitative):
- User can save/open/group links with near-zero learning.
- Active filter/group is always obvious.
- Settings options are discoverable without feeling overwhelming.

## 7) Non-Goals

- No backend/cloud sync feature.
- No account/auth system.
- No change to core storage model or extension architecture.
- No net reduction of existing feature set.

## 8) Information Architecture and Flows

### Primary flow A: Save current context quickly
1. Open side panel or use shortcut.
2. Press `Save Current` (or shortcut) / `Save All`.
3. Receive toast confirmation.
4. Optionally assign/move to group.

### Primary flow B: Capture from pasted URL
1. Paste URL into add input.
2. Press Enter.
3. URL is normalized/validated.
4. Link appears in list (deduped if already present).

### Primary flow C: Retrieve and act
1. Filter by group (All/Ungrouped/specific).
2. Optionally search by title/url.
3. Open or delete link.

### Primary flow D: Library maintenance
1. Go to Settings.
2. Create/delete groups, adjust theme/font, update shortcuts.
3. Export/import data as CSV/JSON.
4. Optional destructive clear-all.

## 9) Required States and Edge Cases

Design must include clear treatment for:
- Empty library (no links).
- No search matches.
- Duplicate save attempt.
- Invalid pasted URL.
- Import file with no valid links.
- Import where all links already exist.
- Import partial success (imported + skipped + groups created).
- Shortcut update failure (combo unavailable).
- Group deletion and resulting ungrouped links.
- Loading/progress states (`Adding...`, `Creating...`, `Importing...`, `Clearing...`).

## 10) Interaction and Accessibility Requirements

- Keyboard accessibility for all controls.
- Clear visible focus states.
- Touch target size suitable for compact panel usage.
- Sufficient contrast in all themes.
- Icon-only actions must retain tooltips/accessible labels.
- Do not rely on color alone for critical state.

## 11) Content and Voice

Tone:
- Simple, direct, low-cognitive-load labels.

Preserve or improve key microcopy intent:
- Fast action labels (`Save Current`, `Save All`, `Add Link`).
- Clear state feedback via toasts.
- Warnings/irreversible actions should be explicit in danger zone.

## 12) Visual Direction (for Design Agent)

Create a cohesive, premium utility aesthetic that is:
- Calm and focused for long-term daily use.
- Distinct from generic settings dashboards.
- Optimized for narrow side-panel ergonomics.

Suggested principles:
- Strong typographic rhythm and spacing hierarchy.
- Elevated “capture” and “retrieve” actions as first-class UI moments.
- Group chips/filters should feel navigational, not decorative.
- Cards should prioritize title and action clarity over decorative chrome.
- Reduce visual noise while preserving all controls.

## 13) Handoff Checklist for Redesign Output

The redesign proposal should include:
- Updated layout spec for `Links` and `Settings` screens.
- Component-level spec (buttons, pills, inputs, cards, nav, toasts).
- State variants (empty/error/loading/success).
- Theme behavior spec (system + 3 named themes, or clear equivalent mapping).
- Mobile/narrow-width behavior notes for side panel constraints.
- Accessibility notes (focus, contrast, keyboard flow).

## 14) Source of Truth in Codebase

Main implementation files:
- `src/App.tsx`
- `src/components/LinkList.tsx`
- `src/components/LinkCard.tsx`
- `src/components/SettingsPanel.tsx`
- `src/hooks/useStorage.ts`
- `src/styles.css`
- `public/background.js`
- `manifest.json`

Use these files as functional truth; redesign should change presentation and UX quality, not remove behavior.
