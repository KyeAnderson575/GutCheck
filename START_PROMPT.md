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

## § Current state (as of 2026-05-05, end of session 1)

**Note:** Session 2 is currently in progress. This block reflects state at the end of session 1 and will be rewritten when session 2 wraps. See `HISTORY.md` for the most recent completed session.

### Deployment

- **No live URL yet.** GitHub Pages deploy is queued for session 2.
- Local dev: `npm run dev` serves at `http://localhost:5173/GutCheck/`. Confirmed working in dark + light modes.
- Build target: `https://kyeanderson575.github.io/GutCheck/` (will exist after session 2's deploy).

### Git state

- **Not yet a git repo.** `git init` is queued for session 2's first action after docs reorg.
- Old repo `KyeAnderson575/GutCheck` (legacy v11 era) needs to be renamed to `GutCheck-archive` and a fresh empty `GutCheck` created. Both are browser actions Kye performs; Claude does not touch github.com without confirmation.

### Working-tree state

- All session 1 work is uncommitted (no git history exists yet).
- Two real bug fixes from session 1, both in the working tree, **must** ship in the first commit:
  1. **FAB stacking-context guard** at `src/App.jsx` ~line 523: added `!showMF && !showSF` condition so the orange `+` FAB hides while modals/sheets are open. Plus CSS rule `body:has(.ql-sheet) .fab { display: none; }` in `src/styles/app.css` for the QuickLogSheet/AddQuickSymSheet cases not tracked at App scope.
  2. **`.ql-sheet` bottom padding** in `src/styles/app.css`: bumped from `28px` to `100px` so Save Changes / Remove buttons clear the ~80px-tall fixed bottom nav.
- `index.html` carries both the legacy `apple-mobile-web-app-capable` and modern `mobile-web-app-capable` meta tags (deprecation warning fix).

### Build

- `npm install` clean (486 packages). `npm audit` reports 8 vulns (5 high, 1 critical) — **review pending in session 2** before any push.
- `vite.config.js` `base: '/GutCheck/'` ✓.
- PWA scaffolding via `vite-plugin-pwa` works locally; service-worker behavior on the deployed `/GutCheck/` scope still untested.

### Firebase

- Untouched. Stubbed out behind `isFirebaseReady()` guard. No real config, no service-account JSON anywhere in the tree.
- All Firebase work deferred to **session 3**. See `BACKLOG.md` §4 and `CLAUDE.md` §"Multi-user note".

### Untested as of session 1 smoke pass

- Stage 5 correlation engine V2 (lift values, EoE 72hr, stacking): smoke-tested empty-state path only, real-data path needs eyes on once enough symptoms are logged.
- Iphone-specific touch behaviors: long-press timing on real iOS hardware not yet verified. Flagged in `TESTING.md`.
- Light-mode visual sweep on actual iPhone: queued for session 2 as part of live-URL smoke test.

### Queued for session 2

- Docs reorg → adopt `START_PROMPT.md` + `SESSIONS.md` + `HISTORY.md` (formerly HANDOFF.md) convention. **In progress.**
- `.gitignore` audit + additions for user-data exports, Firebase secrets, `dev-dist/`.
- `npm audit` review.
- `git init` + first commit.
- GitHub repo migration (rename old → archive, create fresh).
- `.github/workflows/deploy.yml` for Pages deploy.
- Live-URL smoke test on iPhone.

### Queued for session 3

- Firebase project setup (real config, env-var-based).
- Auth UI (sign in / sign up / sign out).
- Firestore sync layer with `/users/{uid}/...` schema.
- Migration of existing local IndexedDB data into the per-user cloud schema.
- Conflict resolution for offline-first → cloud-sync edge cases.

### Open questions / decisions deferred

- Repo description text on GitHub: optional, Kye picks at create time.
- Whether the npm audit critical vuln warrants a breaking-change upgrade or can wait — depends on what the audit actually flags.
- Whether `.gitattributes` is needed for line-ending consistency between Kye's home machine and secondary device — TBD if any line-ending churn appears in early diffs.
