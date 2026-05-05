# GutCheck — Claude Code Project Context

## What this app is

GutCheck is a Progressive Web App (PWA) for tracking gastrointestinal health: meals, drinks, symptoms, medications, weight, and medical records. It runs in the browser, installs to home screen, and stores data locally with optional Firebase sync. Built with React + Vite. Single-user per device currently; multi-user is on the roadmap (see `BACKLOG.md`).

The user is **Kye**. He has EoE (eosinophilic esophagitis) and other GI conditions, so this app is built for real clinical use and gets reviewed by his doctors. Take that seriously — accuracy matters.

## Immediate goal

**Beta-ready for 2–10 user testers.** Not a hardened public release — just stable enough for friends/family/early clinical feedback to use without confusion or data loss. Concrete blockers:
1. Test pass on the current build (Stage 5 + Pieces 1/2/3 + reorder + color cleanup are all untested)
2. Onboarding flow so non-Kye users can land on the app and know what to do
3. Multi-user with cross-device persistence (scope this carefully — see "Multi-user note" below)
4. A working deployed URL with feedback collection
5. Light-mode polish (the color cleanup pass should mostly handle this; verify visually)

Don't build new features beyond beta requirements until beta works.

## How to start a new session with Kye

**Always begin in Plan mode.** Don't write code in the first turn. Kye will paste the start prompt from `START_PROMPT.md`; follow its reading order (CLAUDE.md → START_PROMPT.md "Current state" → SESSIONS.md → HISTORY.md most-recent block → BACKLOG.md → TESTING.md), then propose what you'll do and why. Wait for Kye's confirmation before executing.

## Docs files

GutCheck uses a 3-file convention for session continuity, plus several durable reference files:

| File | Role | Update cadence |
|---|---|---|
| `START_PROMPT.md` | Paste-ready session-start prompt + "Current state" snapshot. The hot context for the next session. | Rewritten wholesale at the **end** of every session. |
| `CLAUDE.md` (this file) | Durable project context: architecture, schema, design decisions, invariants, operational rules. | Updated only when something architectural or long-lived changes. |
| `SESSIONS.md` | Multi-device git workflow: first-time setup, daily loop, common gotchas. | Read on demand when git/environment issues come up. |
| `HISTORY.md` | Append-only chronological log of session-by-session work. Newest session at the top. | New section appended at the end of each session; existing sections never edited. |
| `BACKLOG.md` | Specs for unbuilt features. | Updated when features get specced or pulled into a session. |
| `SETUP.md` | Environment setup steps for a fresh machine. | Updated when toolchain or dependency assumptions change. |
| `TESTING.md` | Manual test checklist. | Updated when new testable surface area lands. |

## User preferences (Kye's)

These are non-negotiable. Apply them every session:

- **Always start in Plan mode.** Outline the work in plain English before doing it.
- **Never push to GitHub without explicit permission**, and tell Kye exactly what will be pushed before he approves.
- **Explain what you're about to do in plain English** before each significant action.
- **When you hit an error, explain what went wrong in plain English** before trying to fix it. Don't silently retry.
- **Tell Kye when he needs to do something outside Claude Code** (browser, terminal, OS settings, etc.) — don't assume he's watching the same tab you are.
- **Update this CLAUDE.md whenever an architectural decision is made.** Not minor edits — the kind of thing a future you would need to know to avoid repeating a debate.
- **Always cite your sources** when you find external info.
- **Always ask if you have questions, suggest improvements proactively.**

## GitHub strategy

- The original repo (`KyeAnderson575/GutCheck`) needs to be **renamed to `GutCheck-archive`** before any push from this version.
- Then a **fresh empty `GutCheck` repo** gets created when Kye is ready to push.
- Until that's done, **do not push anything**. Local commits are fine.
- When the fresh repo is ready, the first push is a single commit covering the entire current state — not a replay of the prior history.
- This means before first push: verify `.gitignore` is correct (no `node_modules/`, no `.env`, no Firebase secrets, no exported user data JSON files).

## Critical code rules

These exist because they've burned us before.

1. **Always put a SPACE between `return` and `<` in JSX.** `return <div>` not `return<div>`. JSX parsing does not enforce this and the resulting bug is silent until you try to render.
2. **All `<input>` and `<textarea>` elements MUST have font-size ≥ 16px.** iOS Safari auto-zooms anything smaller, ruining mobile UX.
3. **Times displayed in 12-hour format** using the `fmt12()` helper. Don't hand-roll time formatting.
4. **Toggles use `.tt.on` class pattern.** Don't reinvent with inline styles.
5. **GitHub repo name is `GutCheck`** (capital G, capital C). Must match in `vite.config.js` `base` path.
6. **Theme uses `[data-theme]` attribute on `<html>`.** CSS vars switch automatically. Don't write conditional JS color logic.
7. **Firebase is optional.** Always check `isFirebaseReady()` before any Firebase call. App must work fully offline.
8. **Schema versioning:** `SCHEMA_VERSION = 4`, `RESTAURANT_DB_VERSION = 2`, export version `"nl-v4"`. Bump when format changes.
9. **Allergens are computed via useMemo from `manualAllergens` state.** Don't write to `al` directly.
10. **Meal `desc` (label) ≠ `ings[]` (ingredients).** They're separate fields. Don't conflate.
11. **MealForm + SymForm both use progressive disclosure.** Form fields stay hidden until prerequisite is picked (source for meals, symptom type for symptoms).
12. **Saving to "My Recipes" requires a name.** Error if toggle is on but `desc` is empty.
13. **Bottom nav order:** Meals | Drinks | Health | Insights | More. Don't reorder.
14. **Health tab sub-tabs:** Symptoms + Medications.
15. **More tab sub-tabs:** Foods | Weight | Medical | Settings.
16. **FavsTab sub-tabs:** My Recipes | Restaurants | My Pantry.
17. **`setRestaurants` must be passed to MealForm** as a prop. Easy to miss.
18. **Consistency replaces Bristol in UI**, but **save BOTH** `consistency` and `bristol` for clinical compatibility. Auto-derive Bristol via `consistencyToBristol()`.
19. **Display rule:** `{s.consistency && <consistency>}{!s.consistency && s.bristol && <bristol>}` — consistency first, Bristol fallback for old data.
20. **Quick-log buttons are pinnable, editable, and reorderable.** State is `pinnedQuickSyms || DEFAULT_QUICK_SYMS`.
21. **Long-press on a pin opens the edit sheet** (not a separate remove UI). Use `lpFired` ref to guard the post-long-press click from firing the quick-log.
22. **Reorder mode is button-toggled, not gesture-based.** Pins display as a vertical list with ◀ ▶ buttons. Simpler to implement, works on touch + mouse without drag-drop libraries.
23. **Pin combo dedupe key:** `[...types].sort().join("|")`.
24. **Quick-log saves via `onQuickSave`** — instant save with toast, not the full SymForm.
25. **`calcCorr` returns a rich object** with `ingredients`, `allergens`, `eoe`, `patterns`, `timeline` plus backward-compat `ac`, `fc`, `tl`. Don't break those legacy fields without a migration.
26. **Lift is the primary correlation metric.** Display as "Xx" format ("2.3x"), not percentages.
27. **Minimum 3 data points** before showing any correlation. Statistical floor.
28. **EoE section is conditional** — only renders when `corr.eoe` is non-null (i.e. ≥2 swallowing-related symptoms exist).
29. **Stacking only counts GI-relevant follow-up symptoms** (categories: gi-upper, gi-lower, bm, eoe). Skin/systemic symptoms within 24hr don't count toward stacking lift.
30. **EoE baseline uses ALL non-EoE days**, not the first 20 chronologically. Statistical honesty.
31. **`ENGINE_SYM_CATS` in helpers.js must stay in sync with `SYM_CATS` in App.jsx.** If you add a symptom type, update both.
32. **Color convention:**
    - Solid status colors: `var(--er)`, `var(--wn)`, `var(--ok)`, `var(--in)`
    - Tinted backgrounds: `var(--X-t1)` subtle, `var(--X-t2)` medium, `var(--X-t3)` bold (X = pb, er, wn, ok, in)
    - Shadows: `var(--shadow-soft)`, `var(--shadow-strong)`
    - **No `rgba()` literals in UI code.** Add a CSS var if a new tier is needed.
33. **DO NOT touch the PDF template colors.** They live around lines 1483-1539 inside the `const css=...` template string. Those are for printed reports and must stay light-mode regardless of app theme.
34. **`SymForm` is progressive disclosure.** The bulk of the form is wrapped in `{hasPicked && <>...</>}`.
35. **Bristol 1 ↔ Consistency "Hard" mapping is lossy by design.** Bristol 1 and 2 both map to Hard. Acceptable abstraction, not a bug.

## Critical files

The project lives at `C:\Users\kye\OneDrive\Documents\Personal\NourishLog\gutcheck` (Kye's home machine). Key files:

```
src/
  App.jsx                    — main component (~3,553 lines after this build)
  main.jsx                   — React mount
  db.js                      — IndexedDB wrapper
  firebase.js                — Firebase config (currently stubbed)
  styles/
    app.css                  — all styles, CSS vars for both themes
  data/
    constants.js             — SYM_LIST, AL list, DEFAULT_QUICK_SYMS, etc.
    giRisk.js                — risk-flagging logic
    commonFoods.js           — food database
    defaultFoods.js          — seed data
  utils/
    helpers.js               — calcCorr, validation, parsing (~682 lines)
    searchDB.js              — food search
  components/
    BarcodeScanner.jsx
    SafeBdg.jsx
vite.config.js               — build config (base path = '/GutCheck/')
package.json
index.html
```

When Kye says "the app", he usually means `App.jsx`. When he says "helpers", he means `src/utils/helpers.js`.

## What's currently in the build (untested)

The current `App.jsx` and `helpers.js` on Kye's machine include all of the following, but **none of it has been tested end-to-end**:

- **Stage 3:** Light/dark theme system (CSS vars, `[data-theme]` attribute)
- **Stage 4:** PWA setup, manifest, service worker
- **Piece 1:** Quick-log bottom sheet system (instant-save symptom buttons on Health tab)
- **Stage 5:** Correlation engine V2 — lift values instead of percentages, ingredient-level correlation, time-of-day patterns, stacking detection, EoE 72hr exposure analysis
- **Piece 2:** SymForm redesign — progressive disclosure, consistency replaces Bristol in UI, searchable symptom picker
- **Piece 3:** Advanced pin management — multi-symptom combos, edit existing pins, drag-to-reorder via button toggle
- **Color cleanup:** 147 hardcoded color literals replaced with CSS variables (34 hex + 113 rgba). Requires `app-css-additions.css` to be merged into `app.css` or some backgrounds will be invisible.
- **Two helpers.js bug fixes:** EoE baseline now uses all non-EoE days; stacking only counts GI-relevant symptoms.

See `HANDOFF.md` for full details.

## Testing approach

`TESTING.md` has the full checklist. Suggested order on first test pass:
1. App loads in dark mode without crashes (sanity)
2. Insights tab works and shows lift values
3. Light mode after CSS additions are merged — biggest visual regression surface
4. SymForm progressive disclosure
5. Quick-log + edit + reorder
6. Long-press feel on actual iPhone (gesture timing differs from mouse)

## Multi-user note

Kye wants:
- **Per-user data persistence across devices** (not just local)
- **Multi-user capability** (2–10 testers can each have isolated accounts)

This is bigger than it sounds. Don't pick an architecture in passing — propose options first. Likely candidates:
- **Firebase Auth + Firestore** — simplest, already partially scaffolded in the codebase. Each user has a UID, data scoped by UID. Real-time sync built in. Free tier handles 10 testers easily.
- **Supabase** — open-source alternative, similar capabilities, slightly more control.
- **Custom backend** — overkill for 10 users.

Recommend Firebase unless there's a specific reason not to. Scaffolding is already there. The work is: configure a real Firebase project (replace placeholder config), implement sign-in UI, scope all data reads/writes by `auth.currentUser.uid`, handle the offline-first → cloud-sync conflict resolution, build a "sign in / sign up / sign out" flow.

For beta with 10 users, this is ~1–2 sessions of focused work. Not trivial, but achievable.

## Don't do these

- Don't refactor `App.jsx` into many files before beta. It's monolithic but works. Refactoring is post-beta.
- Don't reskin the UI. Color cleanup is the limit of cosmetic change for now.
- Don't add new features from outside the immediate-goal list without flagging it for Kye.
- Don't change the schema without bumping `SCHEMA_VERSION` and writing a migration.
- Don't push to GitHub without confirmation. Don't even initialize a remote without asking.
- Don't add analytics or telemetry that phones home without explicit consent flow.

## Background context: what got us here

The app started life as "NourishLog" — a meal tracker. Over many sessions it evolved into GutCheck (a full GI health tracker) with renames, schema migrations, and a long backlog of feature work. There's a lot of legacy code paths and naming inconsistencies (e.g. export version is still `nl-v4`, internal config keys still use `nl-` prefix). That's intentional — preserving compat with existing user data backups outweighs naming purity.

Kye runs an "old-machine handoff → new-machine handoff" workflow because he switches between his home dev machine and a secondary device. That's why the docs are exhaustive — they're often the only context the next session has.

Read `HANDOFF.md` for the full session-by-session history. Read `BACKLOG.md` for unbuilt features that have specs.
