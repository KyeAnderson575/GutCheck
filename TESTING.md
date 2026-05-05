# GutCheck — Stage 5 + Piece 1 + Piece 2/3 Testing Guide

**Scope:** One build, everything untested. This covers the original Stage 5 + Piece 1 checklist plus the new Piece 2/3 changes.

## Deploy

1. Replace `src/utils/helpers.js` with the new `helpers.js`
2. Replace `src/App.jsx` with the new `App.jsx`
3. `cd` into project and run `npx vite`
4. Open `http://localhost:5173/GutCheck/`

No CSS changes this round — everything uses existing `.ch`, `.fi`, `.ql-*`, `.tt.on` classes.

---

## PART A: Correlation Engine V2 (Stage 5)

### A1: Backward compatibility (CRITICAL — test first)
- [ ] Open Insights with NO meals/symptoms → shows "Need more data" messages, no crash
- [ ] With existing data, Insights Overview loads without errors
- [ ] 8-Week Trend chart still renders
- [ ] Appointment Prep opens (both New Doctor and Full views)
- [ ] PDF export still works (downloads the HTML file)

### A2: Allergen correlation display (now lift values)
- [ ] Allergen → Symptom section shows "2.3x" not "76%"
- [ ] Bar width scales with lift (lift of 3.0 = full bar)
- [ ] Colors: red (≥2.5x), orange (≥1.5x), blue (≥1.0x), green (<1.0x)
- [ ] Each row shows: allergen icon+name, top symptom, bar, lift value
- [ ] Sub-line shows: "Lift: Xx · Exposure: Y% of meals" and confidence level
- [ ] With <3 meals for an allergen, it does NOT appear

### A3: Ingredient correlation (new section)
- [ ] "🥘 Ingredient → Symptom Correlation" section appears
- [ ] Shows lift values per ingredient
- [ ] Long ingredient names truncated at 28 chars with "…"
- [ ] If no ingredients in your meals, shows "Need ingredient data" message
- [ ] Confidence shows Low/Medium/High

### A4: Pattern cards (new)

**Time-of-day:**
- [ ] Bar chart with Morning/Afternoon/Evening/Night
- [ ] Orange alerts appear if 60%+ of a symptom clusters in one period
- [ ] Needs 5+ symptoms

**Day-of-week:**
- [ ] 7-bar chart (Sun-Sat)
- [ ] Alert if any day has 1.5x+ the average
- [ ] Needs 7+ symptoms

**Meal-gap:**
- [ ] Distribution of time-since-last-meal
- [ ] Buckets: <1hr, 1-3hr, 3-6hr, 6-12hr, 12hr+
- [ ] Alert if 50%+ cluster in one bucket

**Stacking:**
- [ ] Only appears if significant (5+ meals in each category, multiplier >1.3x)
- [ ] Shows multiplier and comparison
- [ ] **NEW IN THIS BUILD:** Stacking now only counts GI-relevant follow-up symptoms (gi-upper/gi-lower/bm/eoe). Skin rash 23hr later no longer inflates the multiplier. Numbers may be slightly different from your last test.

### A5: EoE analysis
Only shows with 2+ swallowing-related symptoms.
- [ ] "🔴 Swallowing / EoE Analysis" section appears
- [ ] Shows per-allergen 72hr cumulative exposure rates
- [ ] Shows lift comparing EoE windows vs baseline
- [ ] Detail text: "X of Y meals in 72hr windows..."
- [ ] **NEW IN THIS BUILD:** baseline now uses ALL your non-swallowing days, not the first 20 chronologically. Lift values will be more accurate if you have months of data.

### A6: View raw data link
- [ ] "📋 View raw data →" button appears below correlation sections
- [ ] Clicking switches to the Data sub-tab

---

## PART B: Data View Sub-Tab (Stage 5)

### B1: Sub-tab navigation
- [ ] "📋 Data" tab appears in Insights sub-tab bar
- [ ] Clicking shows Data View
- [ ] Can switch back to Overview/Timeline/Calendar

### B2: Date range filter
- [ ] "7 days" / "30 days" / "All" work
- [ ] Counts update: "X days · Y meals · Z symptoms"

### B3: Allergen filter
- [ ] Tapping chip filters to only days with that allergen
- [ ] Symptoms only show on days with filtered allergen's meals
- [ ] Tapping same chip again clears
- [ ] "All" button clears

### B4: Chronological display
- [ ] Entries grouped by date (newest first)
- [ ] Date headers: day name + date (e.g., "Mon Apr 07 (Today)")
- [ ] Within each day, entries sorted by time
- [ ] Meals show: time, name, allergens, ingredients (up to 6, then "+N more")
- [ ] Symptoms show: time, severity, types, consistency/Bristol, duration

---

## PART C: PDF Correlation Appendix (Stage 5)

### C1: Toggle
- [ ] "Include Correlation Analysis" toggle in Appointment Prep
- [ ] OFF by default

### C2: PDF content (toggle ON, export)
- [ ] Disclaimer paragraph at top of appendix
- [ ] Allergen correlation table: Allergen, Lift, Top Symptom, Confidence, Meals, Episodes
- [ ] Ingredient correlation table (if data exists)
- [ ] EoE section (if swallowing symptoms exist)
- [ ] Time-of-day table (if alerts exist)
- [ ] Stacking summary (if significant)
- [ ] With toggle OFF, none of this appears

---

## PART D: Piece 1 — Quick-Log System (still untested from last session)

### D1: Quick-log buttons
- [ ] Health tab shows pinned quick-log buttons
- [ ] Default pins: Normal BM, Diarrhea, Nausea+Vomit, Nausea only, Stomach Pain, Swallowing issue
- [ ] Tapping a button opens bottom sheet (30-40% screen height)
- [ ] Bottom sheet has drag handle, title, relevant fields only
- [ ] "Open full form →" link at bottom

### D2: Quick-log bottom sheet fields
- [ ] Normal BM → consistency + notes
- [ ] Diarrhea → consistency + urgency
- [ ] Nausea+Vomit / Nausea only → severity
- [ ] Stomach Pain → severity
- [ ] Swallowing issue → severity

### D3: Quick-log save
- [ ] Tap "Save" → symptom saved immediately
- [ ] Toast notification appears ("✓ 🤢 Nausea logged" etc.)
- [ ] Toast disappears after ~2.5 seconds
- [ ] Saved symptom appears in the list
- [ ] Correct date, time, types, fields

### D4: Consistency display
- [ ] Cards show "Consistency: Normal" style (not "Bristol Type X")
- [ ] Old symptoms with only `bristol` field still show "Bristol Type X"
- [ ] Pattern: consistency first, Bristol fallback

---

## PART E: Piece 2 — Symptom Form Redesign (NEW this session)

### E1: Progressive disclosure
- [ ] Open SymForm (via FAB + button with no symptoms selected)
- [ ] Only the symptom picker + search bar + empty-state message show initially
- [ ] Pick a symptom → the rest of the form appears (time/date, severity, duration, notes, photo)
- [ ] Deselect all symptoms → the rest of the form disappears again

### E2: Searchable symptom picker
- [ ] Type "diarr" into the search bar → "Diarrhea" appears in the filtered list above the common chips
- [ ] Tapping a search result adds it to selected types AND clears the search
- [ ] Empty search shows the common chips only
- [ ] Search finds custom symptoms too (if you've added any)

### E3: Smart fields based on category
- [ ] Pick "Nausea" → only see Severity/Duration/Notes (no BM fields)
- [ ] Pick "Diarrhea" → Consistency + Urgency + Stool Details section appears
- [ ] Pick "Bowel Movement (normal)" → same BM fields appear
- [ ] Pick both Nausea AND Diarrhea → all fields (GI-upper severity + BM fields) show
- [ ] Deselect Diarrhea → BM fields disappear
- [ ] Pick a non-BM symptom → BM fields stay hidden

### E4: Consistency replaces Bristol
- [ ] Consistency chips: ⚫ Hard / 🟤 Firm / ✅ Normal / 🟡 Soft / 🟠 Loose / 🔴 Watery
- [ ] Small helper text shows "Bristol Type N — saved for clinical compatibility"
- [ ] Save a new entry with Consistency → card shows "Consistency: X" and PDF shows Bristol

### E5: Backward compatibility with old Bristol data
- [ ] Edit an old symptom that has `bristol` but no `consistency` → the form shows the corresponding consistency chip pre-selected (e.g. Bristol 4 → Normal)
- [ ] Save without changing → both `consistency` and `bristol` are preserved

### E6: Collapsible sections
- [ ] Stool Details starts collapsed unless the entry already has flags
- [ ] "▼ Stool details (optional)" → tapping expands, tapping again collapses
- [ ] Label updates: "Stool details (2 selected)" when flags are chosen
- [ ] Photo starts collapsed unless entry has a photo
- [ ] "▼ 📸 Photo (PIN-locked, optional)" → tapping expands

### E7: "Log Another" still works
- [ ] Save with "Log Another" → form resets symptoms/severity/notes/photo/consistency/urgency/stoolFlags, keeps date/time updated to current
- [ ] The form returns to the empty-state view (no symptom selected)

### E8: Edit mode
- [ ] Editing an existing symptom shows the full form immediately (because types are pre-populated)
- [ ] All fields pre-fill correctly including consistency derived from bristol for old entries

---

## PART F: Piece 3 — Advanced Pin Management (NEW this session)

### F1: Multi-symptom combos
- [ ] Tap "+" on quick-log row → AddQuickSymSheet opens
- [ ] Picker step: tap multiple symptoms (e.g. "Nausea" then "Vomiting")
- [ ] Both show up in the "Selected:" chip preview above the list
- [ ] Tapping an already-selected chip in the preview removes it
- [ ] Warning "⚠️ This combo is already pinned" shows if you pick a combination that matches an existing pin
- [ ] "Next: Configure →" is disabled with 0 selected, enabled with 1+

### F2: Pin configuration
- [ ] Configure step shows the combo in a read-only "Symptoms" section
- [ ] "← Change symptoms" link goes back to picker
- [ ] Button Label field auto-fills from first symptom or combo (e.g. "Nausea + Vomiting")
- [ ] Emoji field can be edited
- [ ] Field chips (Severity/Consistency/Urgency/Notes) auto-pick sensible defaults based on category
- [ ] Save creates the new pin

### F3: Edit existing pins (long-press)
- [ ] Long-press (hold ~0.5s) on any existing quick-log button → opens AddQuickSymSheet in edit mode
- [ ] Short tap still opens the quick-log sheet for that pin (not the edit sheet)
- [ ] Long-press on phone (touch) works
- [ ] Long-press on desktop (mouse hold) works

### F4: Edit sheet content
- [ ] Sheet opens directly at the "configure" step (not picker)
- [ ] Pre-fills the current label, emoji, fields, and symptoms
- [ ] "← Change symptoms" goes to picker with current selection intact
- [ ] "Save Changes" updates the pin in place (same position in the row)
- [ ] "🗑 Remove" has a confirm dialog, then removes the pin

### F5: Persistence
- [ ] Add a new custom pin → reload the page → pin still there
- [ ] Edit an existing pin → reload → changes persist
- [ ] Remove a pin → reload → pin stays removed
- [ ] Export data JSON → includes `pinnedQuickSyms` with all your custom pins
- [ ] Import JSON with custom pins → pins restore

---

## Quick Smoke Test (5 minutes)

If short on time, verify these:
1. [ ] Insights tab loads without crash
2. [ ] Allergen section shows "Xx" lift values (not "X%")
3. [ ] Data sub-tab loads and shows chronological entries
4. [ ] Open SymForm → no symptom selected → form stays hidden except picker
5. [ ] Pick "Diarrhea" → Consistency + Urgency + Stool Details appear
6. [ ] Quick-log button tap → bottom sheet opens → save works
7. [ ] Long-press a quick-log button → edit sheet opens → remove works
8. [ ] Tap "+" on quick-log row → pick 2 symptoms → configure → save → new combo pin works

---

## Known Edge Cases

1. **Bristol → Consistency mapping:** Bristol 1 and 2 both map to "Hard" (there's no separate "Bristol 1" vs "Bristol 2" distinction in the consistency system). When you edit an old Bristol 1 entry and save, it will save as consistency "Hard" and Bristol will be derived as `2` (the upper end of the Hard range). Not a bug — it's intentional, consistency is a deliberate abstraction. But if you want Bristol 1 preserved exactly, don't save the edit without changing anything.

2. **Long-press + drag-to-scroll:** If you start pressing a pin and scroll before the 500ms timer fires, the long-press is cancelled (via `onTouchMove` handler). This is correct behavior — you don't want accidental edit sheets when scrolling.

3. **Stacking detection change:** If you had stacking alerts showing before, they may disappear or change in this build because we tightened what counts as a "follow-up symptom." Only GI-relevant symptoms now count. This is the intended fix.
