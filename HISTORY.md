# GutCheck — Handoff v12 (Session 1 in Claude Code)
**Date:** May 5, 2026
**Session scope:** First Claude Code session — scaffold project at `C:\Claude Projects\GutCheck`, verify untested build runs, walk smoke tests, light-mode sweep.

---

## Session 1 results (2026-05-05)

### What was done
- Scaffolded fresh project root at `C:\Claude Projects\GutCheck` by copying from `C:\Users\kye\OneDrive\Documents\Personal\NourishLog\gutcheck`: `src/`, `public/`, `package.json`, `package-lock.json`, `vite.config.js`, `index.html`, `.gitignore`. Skipped `node_modules/`, `.git/`, `.github/`, `SETUP_GUIDE.md`, and the malformed `{public,src` directory.
- Overlaid the new `src/App.jsx` (3,553 lines) and `src/utils/helpers.js` (682 lines) from the staging payload. OneDrive copies were significantly stale (App.jsx 3,091 lines; helpers.js only 98 lines — missing the entire calcCorr V2 / lift / EoE / stacking logic).
- Merged the 14 CSS vars from `app-css-additions.css` into `src/styles/app.css`. Note: actual selector structure was bare `:root` (dark, default) and `[data-theme="light"]`, not `:root[data-theme="dark"]` as the additions file described — adjusted accordingly.
- `npm install` (486 packages, 18s, 8 vulnerabilities flagged for later audit) and `npx vite` started cleanly on `http://localhost:5173/GutCheck/`.

### Smoke test results — all 8 PASS
1. Insights tab loads, all 4 sub-tabs (Overview/Timeline/Calendar/Data) clickable, no console errors.
2. Allergen → Symptom Correlation shows "Need more data" empty state cleanly (no crash on empty-data path).
3. Data sub-tab renders with 7d/30d/All filters and allergen chips.
4. SymForm progressive disclosure works — picker only until a symptom is picked, "Pick a symptom to continue" empty state.
5. Picking "Diarrhea" reveals all expected fields: Severity, Duration, Consistency (6 chips with correct emojis + Bristol auto-derived helper text), Urgency, collapsible Stool details, Notes, collapsible Photo, Log Symptom + Log Another.
6. Quick-log button → bottom sheet → save works. Toast appears, symptom appears in list.
7. Long-press → edit sheet opens correctly with pre-filled state. After bug fixes (see below), Save Changes + Remove buttons reachable.
8. Multi-symptom combo pin creation works — picked Nausea + Vomiting, configure step pre-filled correctly, new combo pin appeared in Quick Log row.

### Light-mode sweep — PASS
Severity badges legible, type chips visible, orange Reorder/FAB readable, bottom nav clean, no invisible elements. Color cleanup survived.

### Bugs found and fixed in-session
1. **Bottom nav obscuring `.ql-sheet` content** (functional, blocking). The QuickLogSheet/AddQuickSymSheet had `padding-bottom: 28px`, not enough to clear the ~80px-tall fixed bottom nav. Save Changes / Remove buttons rendered but hidden under the nav, with no scroll path to reach them. **Fix:** bumped `.ql-sheet` bottom padding from 28px to 100px in `src/styles/app.css`.
2. **FAB visible during overlays** (cosmetic, but compounded the above). The orange `+` FAB rendered even while modals/sheets were open due to a stacking-context trap (FAB at z-index:85 should sit below sheet at 111, but `.app` ancestor traps both into the same context). **Fix:** added `!showMF && !showSF` guard to the FAB JSX (App component) in `src/App.jsx` line 523, plus a CSS rule `body:has(.ql-sheet) .fab { display: none; }` in `src/styles/app.css` to cover QuickLogSheet/AddQuickSymSheet sheets that aren't tracked at App scope.

### Bugs noted but not yet fixed
- `npm audit` reports 8 vulns (5 high, 1 critical). Almost certainly dev-dep transitives. Run `npm audit` properly before session 2's GitHub push — review each vuln rather than blindly running `npm audit fix`.

### Other small fixes during session
- `index.html`: added modern `<meta name="mobile-web-app-capable" content="yes" />` alongside the legacy `apple-mobile-web-app-capable` so the deprecation warning Kye saw in DevTools goes away.

### State as of end of session
- App runs cleanly at `http://localhost:5173/GutCheck/` in dark mode, no console errors.
- Light mode toggle clean.
- Project directory ready for git init in session 2.
- No GitHub remote operations performed.
- Firebase untouched (still stubbed).
- Staging artifacts (`App.jsx`, `helpers.js`, `app-css-additions.css`) cleaned out of project root.

### Queued for session 2
- `git init` here, verify `.gitignore` excludes `node_modules/`, `dist/`, `.env`, exported user JSON.
- Rename `KyeAnderson575/GutCheck` → `GutCheck-archive` on github.com (Kye action via web UI).
- Create fresh empty `KyeAnderson575/GutCheck`.
- Single `git push` covering session 1 build state.
- Re-add `.github/workflows/` for Pages deploy.
- Verify GitHub Actions deploy succeeds and live URL works.
- Test on iPhone via live URL (long-press feel will need real-device tuning).

### Queued for session 3
- Firebase project setup, auth UI, Firestore sync layer, migration of existing local data (`/users/{uid}/...` schema). Per BACKLOG.md §4. Target: working multi-user/multi-device beta.

---

## Original Handoff v11 (April 17, 2026)
**Session scope:** Static bug fixes + SymForm redesign + pin management + drag-to-reorder + color cleanup + backlog specs

---

## WHAT WAS BUILT IN THIS SESSION

### Helpers.js changes (2 fixes)

**1. EoE baseline sampling** — now uses ALL non-EoE days instead of the first 20 chronologically. Hoisted date computation outside the per-allergen loop (performance). More statistically honest lift values.

**2. Stacking detection** — only counts GI-relevant symptoms (gi-upper/gi-lower/bm/eoe) as following a meal. Skin/systemic symptoms 23hr later no longer inflate the multiplier.

### App.jsx changes (5 things)

**1. `loadAllData` guard ordering fix** — minor cosmetic, checks `d` exists before validating.

**2. SymForm full rewrite (Piece 2)** — progressive disclosure:
- Symptom picker with search bar shows first
- Rest of form stays hidden until a symptom is picked
- Smart fields appear based on selected category (BM → Consistency + Urgency + Stool Details)
- Consistency replaces Bristol in UI (Bristol still saved for backward compat via auto-derive)
- Collapsible Stool Details and Photo sections (collapsed unless populated)
- Bristol-to-consistency auto-map when editing old entries

**3. AddQuickSymSheet rewrite (Piece 3)** — multi-symptom combos + edit mode:
- Picker step allows multi-select (Nausea + Vomiting, etc.)
- Combo dedupe with warning
- Editable label, emoji, fields
- Edit mode: pass `edit={{pin, idx}}` to open at configure step pre-filled
- Remove button with confirm inside edit mode

**4. HealthTab rewiring:**
- Long-press on a pin now opens the edit sheet (unified UX for edit + remove)
- `lpFired` ref guards the post-long-press click from firing quick-log
- Suppressed during reorder mode

**5. Drag-to-reorder pins:**
- "↕ Reorder" button next to Quick Log label
- In reorder mode, pins display as vertical list with ◀ ▶ buttons
- Works on touch + mouse (no drag-drop API needed)
- "✓ Done" button exits reorder mode

### Color cleanup pass (147 replacements total)

- **34 hex literal replacements** — `#f87171` → `var(--er)`, `#fbbf24` → `var(--wn)`, `#60a5fa` → `var(--in)`, `#34d399` → `var(--ok)`
- **113 rgba literal replacements** — all tinted backgrounds replaced with semantic vars:
  - `var(--pb-t1/t2/t3)` (purple accent)
  - `var(--er-t1/t2/t3)` (red)
  - `var(--wn-t1/t2/t3)` (amber)
  - `var(--ok-t1/t2/t3)` (green)
  - `var(--in-t1/t2/t3)` (blue)
  - `var(--shadow-soft)` + `var(--shadow-strong)` (black shadows)
- PDF template (lines 1483-1539) intentionally UNTOUCHED — those colors are for the printed report and should stay as-is
- **New CSS vars needed in `app.css`** — see `app-css-additions.css` for exact values (dark + light mode definitions). Drop these inside the existing `:root[data-theme="dark"]` and `:root[data-theme="light"]` blocks.

### Backlog specs (3 features, specs only — no code)

See `GutCheck-Backlog-Specs-v1.md` for full details:

1. **CSV Importer** — Google Form data import, column mapping UI, duplicate detection
2. **Onboarding Flow** — 6-step first-launch wizard with diet phase + quick-log setup
3. **Back-Date Helper** — catch-up modal for filling gaps in tracking

Each spec includes UI flow, data considerations, implementation notes, edge cases, and effort estimate.

---

## FILES CHANGED / ADDED

### Modified (2):
1. **`src/App.jsx`** (3,553 lines — up from 3,314 original) — SymForm rewrite, AddQuickSymSheet rewrite, HealthTab (long-press + reorder), loadAllData guard, 147 color replacements
2. **`src/utils/helpers.js`** (682 lines — up from 677) — EoE baseline fix, stacking detection fix

### New (added to project):
3. **`app-css-additions.css`** — Must be merged into `src/styles/app.css` before the color cleanup code will theme correctly
4. **`GutCheck-Backlog-Specs-v1.md`** — Spec document for the 3 unbuilt features

### Unchanged:
- All data files, Firebase, routing, existing CSS

---

## DEPLOYMENT STEPS

When you're at your dev machine:

1. **Export your data first** (Settings → Export) — safety net
2. Replace `src/utils/helpers.js` with the new `helpers.js`
3. Replace `src/App.jsx` with the new `App.jsx`
4. **Merge `app-css-additions.css` into `src/styles/app.css`** — open app-css-additions.css, copy the two blocks (dark + light) into the corresponding `:root[data-theme="..."]` selectors in your existing app.css
5. Run `npx vite` and test
6. Walk the testing guide (`STAGE5-PIECE23-TESTING.md` — still applies, plus new items below for reorder + colors)

**If you skip step 4**, the app will still work but the rgba tints will fall back to nothing (transparent), making some backgrounds invisible. The hex color replacements (step 2/3) will still work because those CSS vars already exist.

---

## NEW TESTING ITEMS (not in STAGE5-PIECE23-TESTING.md)

### Drag-to-reorder pins

- [ ] Tap "↕ Reorder" next to Quick Log label → pins switch to vertical list view
- [ ] Each pin shows ◀ and ▶ arrows, disabled at edges (first pin can't go up, last can't go down)
- [ ] Tapping ▶ on first pin moves it to second position, all others shift
- [ ] Tapping ◀ on last pin moves it to second-last position
- [ ] Position counter (1/6, 2/6, etc.) updates correctly
- [ ] Long-press is suppressed while in reorder mode (no edit sheet opens)
- [ ] "✓ Done" button returns to normal pin row
- [ ] Reload the page → new order persists

### Color cleanup

- [ ] App loads in dark mode — visually identical to before (should be indistinguishable)
- [ ] Switch to light mode (Settings → Theme) — status-colored elements (red severity badges, amber warnings, green success) remain legible
- [ ] Quick Log label "long-press to edit" hint uses var(--t3), readable in both themes
- [ ] Severity badges (Mild/Moderate/Severe) visible in both themes
- [ ] Undo toast border is visible in light mode
- [ ] Daily summary cards have subtle tinted backgrounds in both themes
- [ ] Symptom cards with urgency "Urgent"/"Emergency" show in red in both themes
- [ ] No elements appear "missing" or "invisible" — if something disappears in light mode, the CSS additions weren't applied correctly

---

## CRITICAL CODE RULES (updated)

All previous rules 1-50 still apply, plus:

51. **Color cleanup convention:** For status colors use `var(--er)`, `var(--wn)`, `var(--ok)`, `var(--in)` (solid). For tinted backgrounds use `var(--X-t1/t2/t3)` where X is the color family and t1=subtle, t2=medium, t3=bold.
52. **Do NOT replace colors inside the PDF template** (`const css=...` around line 1483). That template generates printed HTML reports that should look like paper regardless of app theme.
53. **Reorder mode pattern:** toggle via explicit button, not gesture. Pins display as vertical list with step buttons, not drag handles. Simpler to implement and works equally on touch and mouse without extra libraries.
54. **`rgba()` literals are now banned in App.jsx UI code.** Use a CSS var. If you need a new alpha tier, add it to `app-css-additions.css` and document it.

---

## KNOWN ISSUES

1. **EVERYTHING in this build is untested.** Stage 5 + Piece 1 + Piece 2/3 + drag-reorder + color cleanup + the CSS vars.
2. **Firebase not configured** — placeholder config, protected by `isFirebaseReady()` guard
3. **Nothing pushed to GitHub** — all changes local
4. **Manual barcode lookup** — placeholder `alert()`
5. **Stacking values may differ** from previous test runs because we tightened the symptom-following-meal criteria. Intentional.
6. **Bristol 1 ↔ Consistency "Hard" mapping is lossy** — intentional design decision, not a bug.
7. **Light mode tints are calibrated but not tested** — the `app-css-additions.css` light-mode values are a reasonable first pass based on the dark-mode values scaled up in alpha. If anything looks washed out or too dark in light mode, tweak those specific values.

---

## PRIORITIES FOR NEXT SESSION

### 1. Testing + bug fixes (blocking)
- Walk `STAGE5-PIECE23-TESTING.md` + the "New testing items" above
- Fix whatever breaks
- Pay attention to light mode — biggest regression surface from the color cleanup

### 2. Push to GitHub
- Single commit covering everything in this build
- Verify GitHub Actions deploy
- Test on iPhone via the live URL

### 3. Pick a backlog feature (optional)
- See `GutCheck-Backlog-Specs-v1.md`
- Recommendation: CSV Importer first (unlocks your Google Form history)

### Longer-term backlog (unchanged)
- Wire up manual barcode text lookup (Open Food Facts API)
- Auto-sync on data changes (Firebase)
- Expanded restaurant menus / ingredient database

---

## WHY I'M NOT WORRIED ABOUT TESTING DELAY

The risks in this build are skewed toward *visual* issues (colors), not *functional* issues. Here's my read:

- **Helpers.js math changes:** return shape identical, numerical values slightly different. Low risk of crash, moderate risk of "numbers feel off" that's actually more accurate.
- **SymForm rewrite:** payload shape identical to before. Progressive disclosure is additive UX, not a change to what gets saved. Low risk of data loss.
- **AddQuickSymSheet rewrite:** new props are additive; old signature still works. Low risk.
- **HealthTab long-press + reorder:** gesture changes. On-device feel might need tuning (500ms long-press could feel wrong). Easy to tweak.
- **Color cleanup:** purely visual. If the CSS vars aren't defined, some backgrounds vanish. Easy to spot, easy to fix.

**Highest-risk items to check first:** light mode after adding the CSS vars, and long-press behavior on an actual iPhone (touch timing differs from mouse).
