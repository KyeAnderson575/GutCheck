# GutCheck — Backlog Feature Specs (v1)

Three features from the backlog, fully specified but not yet implemented. Each section is self-contained — you can pick one, hand the spec to a new session, and build it in isolation.

---

# 1. CSV Importer (Google Form Data)

## Why this exists

You've been tracking symptoms manually in a Google Form since before GutCheck existed. That history is valuable for correlation analysis but can't be retyped reasonably. A CSV importer lets you get it into the app without losing months of data.

## What it does

A new sub-section in **Settings → Data Management** called "Import CSV from Google Form" that:
1. Accepts a `.csv` file from the user's Google Form export
2. Previews the detected column mapping (and lets the user correct it)
3. Validates the data and reports warnings
4. Imports rows as meals, symptoms, or both
5. Tags every imported record with `_source: 'csv-import'` so you can see what came from where

## Assumptions about the source CSV

Google Form exports have a standard shape: first row is question text, each subsequent row is a response. Every response has a timestamp column. The form you were using probably has columns like:

- Timestamp
- What did you eat? (or similar)
- When did you eat it?
- What symptoms are you having?
- How severe? (Mild/Moderate/Severe)
- Any stool details?
- Notes

The importer should handle the specific Google Form column names flexibly — not hardcode them.

## UI flow

**Step 1 — Upload**
- File picker (accepts `.csv` only)
- Shows detected row count and column count
- Button: "Preview Mapping"

**Step 2 — Map columns**
- Table showing each detected CSV column with a dropdown for what field to import it as
- Dropdown options:
  - Ignore (default for unrecognized columns)
  - Meal fields: Date, Time, Description, Meal Type, Allergens, Tags, Notes, Portion, Completion, Ingredients
  - Symptom fields: Date, Time, Symptom Types, Severity, Consistency, Bristol, Urgency, Stool Flags, Duration, Notes
- Auto-detect button uses column names to guess (e.g. "Timestamp" → Date+Time, "Symptoms" → Symptom Types, "Severity" → Severity)
- For Symptom Types and Allergens columns, user specifies the delimiter (comma, semicolon, pipe)
- For Date/Time columns, user picks the format (MM/DD/YYYY, DD/MM/YYYY, ISO, etc.) — auto-detect attempts first

**Step 3 — Validate**
- Shows first 5 rows with parsed field values
- Reports warnings:
  - Rows with invalid dates
  - Rows with unknown symptom types (offers to create as custom symptoms)
  - Rows with allergen strings not in the app's allergen list (offers to add as tags instead)
  - Duplicate detection (same date/time as an existing entry)
- User checkboxes: "Import as meals", "Import as symptoms", "Skip duplicates"

**Step 4 — Import**
- Shows import progress
- Success toast with counts: "Imported 47 meals, 89 symptoms, skipped 3 duplicates"

## Data considerations

1. **`_source` tag on every imported record** — lets you filter them out of correlation analysis if you want a clean pre-app/post-app comparison
2. **`_importedAt` timestamp** — for audit trail
3. **No automatic deletion** — if the import goes wrong, user restores from export backup (already exists)
4. **Default to `_source: 'csv-import'` visible in the Data View** — so imported records have a small badge

## Implementation notes

**New component:** `CSVImportModal` — lives in SettingsSub. Progressive disclosure matching the meal form pattern.

**New helpers (new file `src/utils/csvImport.js`):**
- `parseCSV(text)` — returns `{ headers: string[], rows: string[][] }`. Handle quoted fields with embedded commas.
- `detectDateFormat(samples)` — returns `'MM/DD/YYYY' | 'DD/MM/YYYY' | 'ISO' | null`
- `parseDate(str, format)` — returns ISO date string or null
- `autoMapColumns(headers)` — returns a guess at field mapping based on keyword matching
- `validateRow(row, mapping)` — returns `{ valid, warnings, parsed }`
- `rowToMeal(row, mapping)` — returns meal object
- `rowToSymptom(row, mapping)` — returns symptom object

**No new schema fields in stored data** beyond `_source` and `_importedAt` on meals/syms. No schema version bump needed (additive).

**Edge case to handle:** some CSV rows might represent BOTH a meal and a symptom (same form entry tracked both). The importer needs to emit two records from one row in that case. Handle via a "This row contains:" selector per-mapping.

## Effort estimate
Medium. 2–3 hours of focused build + 1 hour of testing. The parser is straightforward, but column mapping UX and edge cases (bad dates, unknown symptom names, duplicates) need care.

## Recommendations
- Build `csvImport.js` first, test it with `console.log` before any UI
- Use `Papaparse` (already listed as an available artifact library — should work in the PWA too; confirm in package.json first)
- Don't skip duplicate detection — you will accidentally double-import when testing

---

# 2. Onboarding Flow (First-Launch Wizard)

## Why this exists

New users (including anyone you share the PWA with, or yourself on a fresh install) land on an empty Meals tab with no idea what to do. The app has a LOT of features that don't surface without exploration: quick-log pins, PIN-protected medical records, diet phases, import/export, custom symptoms. An onboarding flow introduces the core concepts in ~60 seconds.

## What it does

First-launch only. Triggered when `nl-config` is either missing or has `onboardingCompleted: false`. Shows a multi-step modal walkthrough. User can skip at any time.

## Flow

**Step 1 — Welcome**
- "Welcome to GutCheck"
- One-paragraph pitch: "Track what you eat and how you feel. GutCheck finds patterns in your data so you can share real evidence with your doctor."
- Buttons: "Get Started" / "Skip Intro"

**Step 2 — What to track**
- Icon grid showing the 5 core data types with one-line descriptions:
  - 🍽️ Meals (what you ate, when)
  - 🥤 Drinks (hydration tracking)
  - 🩺 Symptoms (how you feel + patterns)
  - 💊 Medications (what you're taking)
  - 📋 Medical Records (PIN-protected)
- "The more you log, the more useful the insights become."

**Step 3 — Import existing data?**
- "Have data from another app or a Google Form?"
- Two buttons: "Import JSON backup" / "Import CSV" / "Skip — start fresh"
- Opens the existing import UI if chosen

**Step 4 — Set up diet phase (optional)**
- "Are you currently on an elimination diet or in reintroduction?"
- Options: Baseline (default) / Elimination / Reintro
- If Elimination chosen: multi-select of common foods (dairy/gluten/eggs/soy/nuts/fish/sesame)
- Skip button

**Step 5 — Customize Quick-Log (optional)**
- "Your Health tab has quick-log buttons for common symptoms. You can customize these anytime by long-pressing a button."
- Small preview of the 6 default pins
- "Want to change them now?" → opens AddQuickSymSheet / "Later"

**Step 6 — Pro tip**
- "Tap + at the bottom of the Meals or Health tab to log a full entry with all details."
- "Your data stays on your device (or syncs to Firebase if you sign in)."
- "Tap the person icon in the top-right to sign in for cross-device sync (optional)."
- Button: "Start using GutCheck"

## UI design

- Full-screen modal (mobile-style), not a centered dialog
- Progress dots at top (6 dots, active one filled)
- Back arrow in top-left (disabled on step 1)
- Skip link in top-right on every step except the last
- Large, tappable buttons — this is the first impression, make it feel premium
- Existing CSS vars: use `--pb` for active progress dot, `--t2` for inactive, `--bg` for page background

## State

- New config field: `onboardingCompleted: boolean` (default false on fresh install, true after completion OR skip)
- New config field: `onboardingVersion: number` (currently 1) — so future updates can trigger a "what's new" overlay for returning users

## Implementation notes

**New component:** `OnboardingFlow` — full-screen modal, rendered by App if `!config.onboardingCompleted`.

**Renders in App.jsx** right after the `loaded` check, before the main UI. If onboarding is showing, the main app doesn't render — keeps the DOM simple.

**Steps are a single array** `const ONBOARDING_STEPS = [...]` with each step as `{ id, title, content: () => JSX }`. Makes it easy to add/reorder steps later.

**Skip behavior:** always sets `onboardingCompleted: true`. Users can re-trigger the flow from Settings → "Show welcome tour again" if they change their mind.

**No schema bump needed** — `onboardingCompleted` and `onboardingVersion` are additive.

## Edge cases

- User closes browser mid-onboarding → next launch starts from step 1 (no partial state persistence — not worth the complexity)
- User is importing data in step 3 → after import succeeds, advance to step 4 automatically
- User is on mobile with an older iOS that doesn't support `<dialog>` → use a regular fixed-position `<div>` with `z-index: 1000`

## Effort estimate
Medium-low. 2 hours of build + 30 min testing. Mostly layout work, no complex state.

## Recommendations
- Write the copy first, then build around it. Copy is what makes this feel friendly vs corporate.
- Record yourself going through it once — if your own onboarding feels too long, cut a step.
- Don't gate ANY feature behind onboarding — skip should leave the user fully functional.

---

# 3. Back-Date Helper (for missed days)

## Why this exists

Chronic symptom tracking is high-adherence for the first week and then reality happens — you skip a day, then three, then a week. By the time you catch up you've forgotten what you ate on Tuesday. Currently the only way to fill a gap is to manually set the date/time on every entry, which is friction-heavy.

A back-date helper reduces that friction so catching up stays a realistic habit.

## What it does

A new top-right menu option on the Meals tab: "⏮ Catch up". Opens a focused modal that:
1. Detects recent gaps in your logging (days with no meals / no symptoms logged)
2. Lets you pick which day to catch up on
3. Presents a streamlined form for that day: multiple meals + multiple symptoms with smart time presets
4. Saves everything in one batch

## UI flow

**Step 1 — Pick a day to catch up**
- Shows the last 14 days as a grid
- Each day cell shows: day name, date, and dots indicating what was logged that day
  - 🍽️ dot if any meal logged
  - 🩺 dot if any symptom logged
  - 💧 dot if water logged
  - 💊 dot if meds logged
- Days with NO data are visually highlighted (red outline or "!" badge)
- Today and future days are dimmed/disabled
- User taps a day → Step 2

**Step 2 — Fill the day**
- Large header: "Catching up on [day name], [date]"
- Three tabs: 🍽️ Meals / 🩺 Symptoms / 💧 Water & Meds
- **Meals tab:**
  - Time-of-day shortcuts: [Morning 8am] [Lunch 12pm] [Dinner 6pm] [Snack 3pm]
  - Each shortcut opens the mini meal form inline (pre-fills time and type)
  - Saved meals show as a compact list below the shortcuts
  - Edit and delete icons on each saved entry
  - "+ Another meal" button for custom time
- **Symptoms tab:**
  - Similar pattern: quick-log pins (same as Health tab) pre-fill the date
  - Time defaults to "right now" but user can adjust
  - Saved symptoms show as a compact list
- **Water & Meds tab:**
  - Water: simple oz input with +8 / +16 / +32 shortcuts
  - Meds: checkbox list of active meds with "Took all" shortcut
- Bottom: "Done with this day" button returns to Step 1 so they can pick another

**Step 3 — Summary (optional)**
- After closing, a toast: "Added N meals, M symptoms for Apr 10" — with an Undo link that rolls back the batch

## Smart features

**Memory of recent patterns** — when catching up on a Monday, pre-populate the meal type shortcuts with your most common Monday breakfast/lunch/dinner (or just most common recent). Makes catching up 2x faster.

**"Repeat yesterday" button** — on the meals tab of the fill-day view, offer a "Copy yesterday's meals" button that clones the previous day's meals into this day with the same times. User can then edit/remove.

**Confidence flag on back-dated entries** — every entry created via the back-date helper gets a `_backdated: true` field. Useful for two things:
1. Correlation engine can weight these slightly less than real-time entries (less accurate timing)
2. User can see in Data View which entries were logged retroactively

## Data considerations

- New meal/symptom field: `_backdated: true` (optional, only set on back-dated records)
- No schema version bump (additive)
- Batch save groups all entries from one "Done with this day" session with the same `_batchId` for undo support

## Implementation notes

**New component:** `CatchUpModal` — full-screen modal, three sub-views (day picker, fill day, confirmation).

**Reuses existing forms** — MealForm and SymForm with `pf` (prefill) props for date/time. No new form components needed.

**Top-right menu on Meals tab** — small ⋮ button that opens a dropdown: "⏮ Catch up" / "Export data" / "Settings". Currently those options are scattered; consolidating them here is a usability win.

**Gap detection function** in App.jsx:
```
const detectGaps = (meals, syms) => {
  // Returns array of { date, hasMeals, hasSyms, hasWater, hasMeds } for last 14 days
};
```

**Batch undo** — similar to existing `undoItem` pattern but for an array of items. Keep the 5-second window.

## Edge cases

- User catches up on a day with existing data → don't clear it, just add to it. Show existing entries at the top of the fill-day view.
- User back-dates a meal with time later than current time (for today) → warn, then allow (they might be planning a meal)
- Future dates are locked — no catching up on tomorrow

## Effort estimate
Medium-high. 4 hours of build + 1 hour of testing. The day picker UI and the "repeat yesterday" feature are the meatiest parts.

## Recommendations
- Build the day picker first, standalone, as a read-only view. Get that looking right before wiring the fill-day flow.
- The "repeat yesterday" feature is the highest-ROI part — test it with real data early.
- If you're short on time, skip the "Water & Meds" tab in the catch-up modal. Those are logged less critically than meals/symptoms and the existing tabs handle them fine.

---

# Sequencing recommendation

If you build all three, do them in this order:

1. **CSV Importer first.** You have old data waiting. Getting it in unlocks better correlation analysis immediately.
2. **Back-Date Helper second.** High-impact on daily usage — this is what keeps you actually tracking when life gets in the way.
3. **Onboarding last.** You're the only real user right now. Onboarding matters when you share GutCheck with someone else or start fresh on a new device.

Each is a ~half-day focused session. Don't try to do two in one session — the context overlap isn't worth it and you'll end up with bugs bleeding between features.

---

# 4. Multi-User + Cross-Device Persistence

## Why this exists

Kye wants 2–10 user testers (himself plus friends/family/clinicians) to each have isolated accounts with data that persists across their devices. The current architecture is single-user, local-only (with stubbed Firebase). For real testing, especially clinical feedback, each user needs their own account so their data doesn't mix and they can use the app on phone + laptop.

This is a **near-term priority but not part of the first beta-ready session.** It should be tackled after the current build is verified working, before broad tester invitations.

## Constraints

- **Beta scope:** 2–10 users. Don't over-engineer for scale.
- **Offline-first must remain true.** Users can be in places with no signal (planes, hospitals, rural areas). The app must work fully offline and sync when connection returns.
- **Data privacy is critical.** This is medical data. No analytics, no shared keys, no debugging-friendly defaults that leak data.
- **Existing local data must migrate cleanly** to the user's account on first sign-in. Kye has months of data on his current device.
- **Data export remains local-controlled.** Users export their own JSON, not "request from admin."

## Recommended approach: Firebase Auth + Firestore

Firebase scaffolding already exists in the codebase (placeholder config, `isFirebaseReady()` guards). Continuing on Firebase is the path of least resistance.

**Architecture:**
- **Auth:** Firebase Auth with email/password + Google sign-in (Apple sign-in optional for iOS users)
- **Storage:** Firestore, all documents under `/users/{uid}/...` paths so security rules can enforce per-user isolation
- **Sync model:** offline-first with Firestore's built-in offline persistence. Local IndexedDB stays the canonical local store, Firestore syncs when online.
- **Conflict resolution:** last-write-wins per record (each meal/symptom has a `ts` timestamp already). Acceptable for personal medical data — users rarely edit the same record from two devices simultaneously.

**Security rules to write:**
```
match /users/{userId}/{document=**} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```
That's it. Each user can only read/write their own data. No admin god-mode (we don't need it for beta).

## UI changes needed

**1. Auth screen on first launch (or sign-out)**
- Sign in / Sign up tabs
- Email + password fields
- "Continue with Google" button
- "Skip — use offline (data won't sync)" link for users who don't want an account
- Privacy note: "Your data is stored encrypted in Google Firebase. Only you can access it."

**2. Account section in Settings**
- Currently Settings has a stubbed sign-in. Build it out:
  - Show current user email
  - Sign out button
  - Delete account button (with confirm — wipes Firestore data + auth record)
  - Last sync timestamp
  - Manual sync button

**3. Sync status indicator**
- Small icon in the header showing sync state: synced / syncing / offline / sync error
- Tap to see details: "Last synced 2 min ago" or "Offline — 3 changes pending"

## Migration logic

When a previously-offline user signs in for the first time:
1. Detect existing local data (`config`, `meals`, `syms`, etc. in IndexedDB)
2. Show modal: "We found local data on this device. Sync it to your account?"
3. If yes: upload all local records to `/users/{uid}/...`
4. If no: keep using local-only mode (don't break their workflow)
5. After successful upload, switch to Firestore-backed sync

## What gets stored in Firestore

Mirror the local schema, one collection per data type, scoped under the user:
- `/users/{uid}/meals/{mealId}`
- `/users/{uid}/syms/{symId}`
- `/users/{uid}/water/{date}` (date-keyed for water entries)
- `/users/{uid}/medLog/{date}`
- `/users/{uid}/weight/{date}`
- `/users/{uid}/medical/{recordId}` (PIN-protected — see security note below)
- `/users/{uid}/config` (single doc with user prefs, pinned quick-syms, etc.)
- `/users/{uid}/customFoods/{foodId}`
- `/users/{uid}/myFoods/{foodId}` (recipes)
- `/users/{uid}/restaurants/{restaurantId}`

## Security note on medical records

The Medical sub-tab is currently PIN-locked locally. Question for Kye: should those records sync to Firestore or stay device-only?

**Argument for syncing:** users want them on their phone if they go to a doctor's appointment.
**Argument against:** Firebase staff theoretically have access to encrypted-at-rest data. For high-sensitivity records (medical photos, prescriptions), this might not be acceptable to clinical users.

**Recommendation:** sync them, but encrypt client-side with a key derived from the user's PIN before upload. Firestore stores ciphertext; only the user's PIN unlocks it. Slightly more work but the right call for medical data.

Defer this decision until Kye reviews. For beta with friends/family it's probably fine to sync them in plaintext; for clinical testers, encrypt.

## Effort estimate

- **Auth flow + basic sign-in:** half a day
- **Firestore sync layer + offline handling:** 1 day
- **Migration of existing local data:** half a day
- **Sync status indicator + settings polish:** half a day
- **Testing across devices:** half a day
- **Total:** ~2.5–3 days of focused work

## Sequencing

1. Get the current build verified working (single-user) and pushed to fresh GitHub repo first
2. Create real Firebase project (Kye does this in browser console)
3. Implement auth + sign-in UI in a feature branch
4. Implement Firestore sync layer
5. Implement migration of existing local data
6. Test on Kye's two devices (phone + laptop) before inviting any testers
7. Roll out to testers with onboarding flow that includes account creation

## Recommendations

- **Don't skip the offline-first requirement.** It's tempting to assume Firestore sync "just handles" offline mode, but the conflict-resolution edge cases will bite you. Test offline scenarios deliberately.
- **Use Firebase emulators for local dev.** Don't burn through quota during development.
- **Keep the "Skip — offline only" option** even after multi-user is shipped. Some users won't want accounts.
- **Don't build admin/cross-user features.** Each user is an island. Comparative analysis across users (if ever needed for clinical research) is a separate, much later project.
