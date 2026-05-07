# GutCheck — Session Start Prompt + Current State

This file has two parts: the **paste-ready prompt** to start a new Claude Code session, and the **Current state** snapshot of where work was left off. The Current state section is rewritten wholesale at the end of every session.

---

## § Session-start prompt (paste into a new Claude Code session)

```
I'm starting a new session of GutCheck. Project lives at C:\Claude Projects\GutCheck.

Begin by reading these in order:

1. CLAUDE.md — durable project context, rules, GitHub strategy.
2. START_PROMPT.md (this file) — read the "Current state" section below to know where the last session left off.
3. SESSIONS.md — multi-device git workflow + common gotchas. Skim it; deep-read only if a git or environment issue comes up.
4. HISTORY.md — append-only chronological log. Read the most recent session block (top of the file) for hot context. Older blocks are reference only.
5. BACKLOG.md — unbuilt features with specs.
6. TESTING.md — manual test checklist.

Then verify the working state:
- `git status` and `git log --oneline -5` so we both know what's committed and what isn't.
- If anything in the project root looks unexpected (untracked staging files, half-applied edits), surface it before starting work.

Stay in Plan mode. Propose a plan covering:
1. What I asked for in this session.
2. What state the working tree is actually in (verified, not assumed).
3. The safest first action and the predicted first failure mode.
4. Anything ambiguous in the docs that needs clarification before executing.

Constraints (always apply):
- Never push to GitHub without explicit approval. Show the diff/file summary first.
- No `git push --force` ever.
- No Firebase / multi-user work unless that's explicitly the session's goal.
- Confirm before any `git remote` operation, any push, or any CI/secret config write.
- If `npm audit` flags anything, surface it before deploying — don't blindly run `npm audit fix`.
- Tell me when I need to do something outside Claude Code (browser, phone, OS).
- Explain errors in plain English before retrying.
- Ask clarifying questions instead of guessing.

Don't start executing until I approve the plan.
```

---

## § Current state (as of 2026-05-07, end of session 3)

### Deployment

- **Live URL: `https://kyeanderson575.github.io/GutCheck/`** — confirmed working on iPhone Safari with real Firebase auth.
- Deploy pipeline unchanged from session 2 (Node 20, `npm ci`, `vite build`, `actions/deploy-pages@v4`). The `Build` step now also injects 6 `VITE_FIREBASE_*` env vars from GitHub Actions secrets so Vite can inline the Firebase config at build time.

### Git state

- Repo: `https://github.com/KyeAnderson575/GutCheck` (public). Branch: `main`. Remote: `origin`.
- Three commits on `main` at end of session 3:
  1. `78b427d` — Initial commit: GutCheck beta build (session 1+2 build state).
  2. `7592fd0` — Add GitHub Pages deploy workflow (session 2).
  3. `66ba587` — Wire Firebase auth (Slice 1): env-var config, email-only sign-in (session 3).
  4. (Session 3 wrap-up docs commit lands as the final action of this session.)
- Session 3 was authored on a worktree branch (`claude/trusting-sammet-b935db`) and pushed directly into `origin/main` via `git push origin HEAD:main`.
- Local identity is still the GitHub no-reply email — see SESSIONS.md gotcha 9.
- Old repo preserved as `KyeAnderson575/Archive_GutCheck` (private). Do not push to it; do not delete it.

### Working-tree state

- Clean at end of session (after wrap-up commit lands). All session 3 work committed and pushed.
- All session 3 verification PASS, both `localhost:5174` and live URL on Safari:
  - 👤 button visible (env vars loaded) → Sign Up → reload persists → Sign Out → Sign In / Sign Up button in Settings opens AuthModal → Sign In → wrong-password + email-already-used both show friendly errors.
  - PWA hard-close + reopen on iPhone picks up the new service-worker bundle correctly.

### Firebase (NEW this session)

- Real project: `gutcheck-beta`, free Spark plan, Kye's personal Google account (no Workspace org parent).
- **Authentication providers:** Email/Password ONLY. Google, Apple, Phone, etc. all disabled.
- **Authorized domains:** `localhost` + `kyeanderson575.github.io`.
- **Firestore:** database created in `us-west3 (Salt Lake City)`. Production-default rules (deny all). NOT YET WIRED FOR PER-RECORD SYNC — the existing `syncUpload`/`syncDownload` in `firebase.js` (single-doc blob) will fail until Slice 2 lands proper rules. That's expected.
- **Config plumbing:** `firebase.js` reads `import.meta.env.VITE_FIREBASE_*`. `.env.local` (gitignored) holds dev values; `.env.example` (committed) is the template; `.github/workflows/deploy.yml` injects the same vars from GitHub Actions Repository Secrets at build.
- **Six secrets added** to repo Settings → Actions → Secrets: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`. Names must match exactly — Vite is case-sensitive on `VITE_*`.

### Build

- `npm audit`: 0 vulnerabilities (carryover from session 2; not re-checked this session, no new deps added — `firebase` was already at `^12.11.0`).
- `npm run build` succeeds. 1.4 MB single-chunk warning still present, still pre-existing, still post-beta concern.

### Auth UX in current build

- Header 👤 / ✓ button (top-right) opens `AuthModal`. Email + password form only.
- Sign Up requires ≥6-char password (Firebase enforces). Friendly error messages for wrong-password, user-not-found, email-already-in-use, invalid-email.
- Settings → Cloud Sync section: when signed-out, shows "Sign In / Sign Up" button that opens the same AuthModal. When signed-in, shows user card + sign-out + (currently broken) Upload/Download buttons.
- Sessions persist via Firebase's IndexedDB-backed token storage.
- The "Skip — offline only" affordance specced in BACKLOG §4 is NOT implemented yet — current UX is "skip by default, opt-in via 👤," which is functionally equivalent for now.

### Queued for session 4 (Firebase Slice 2)

- Firestore security rules: `match /users/{userId}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == userId; }`. Deploy via console or `firebase deploy --only firestore:rules`.
- Replace the legacy single-doc `syncUpload`/`syncDownload` in `firebase.js` with per-collection writes (`/users/{uid}/meals/{mealId}`, `/users/{uid}/syms/{symId}`, etc. per BACKLOG §4 schema).
- Migration of existing local IndexedDB data into the per-user cloud schema on first sign-in.
- Conflict resolution strategy (last-write-wins on record `ts`).
- Sync status indicator in header (synced / syncing / offline / error).
- Reconsider "Skip — offline only" first-launch UX once sign-in is load-bearing.

### Open items / nice-to-have (non-blocking)

- **1.4 MB single-chunk JS bundle** — code-split eventually, post-beta.
- **No feedback-collection mechanism** on live URL — flag for later.
- **PowerShell execution policy** on Kye's home machine still blocks `npm run dev`. One-time fix: `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell. Worked around this session with `npm.cmd run dev`.
- **Stray Vite process on port 5173** (probably from a different working tree) — Vite fell back to 5174 during testing. Harmless, not investigated.
- **Worktree gotcha worth documenting in SESSIONS.md eventually:** `npm run dev` must be run from the active worktree path, not the main repo path, or you'll be testing the old code. Ran into this once this session.
