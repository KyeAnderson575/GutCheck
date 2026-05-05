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

## § Current state (as of 2026-05-05, end of session 2)

### Deployment

- **Live URL: `https://kyeanderson575.github.io/GutCheck/`** — confirmed working on iPhone Safari and as a home-screen PWA.
- Deploy pipeline: `.github/workflows/deploy.yml` runs on every push to `main` (Node 20, `npm ci`, `vite build`, `actions/deploy-pages@v4`). Pages source is set to "GitHub Actions" in repo settings.
- First green deploy: workflow run from commit `7592fd0` (session 2). Build time ~1–2 min end to end.

### Git state

- Repo: `https://github.com/KyeAnderson575/GutCheck` (public). Branch: `main`. Remote: `origin`.
- Two commits in history at end of session 2:
  1. `78b427d` — Initial commit: GutCheck beta build (32 files, 16,469 insertions).
  2. `7592fd0` — Add GitHub Pages deploy workflow.
- Old repo preserved as `KyeAnderson575/Archive_GutCheck` (private). Do not push to it; do not delete it. It holds the legacy v11 history.
- Local identity is the GitHub no-reply email (`270755902+KyeAnderson575@users.noreply.github.com`), not `kye@co-innovate.com`. This was set after GitHub's privacy guard rejected a push exposing the work email — see SESSIONS.md gotcha 9. Future commits stay anonymized.

### Working-tree state

- Clean at end of session. All session 2 work is committed and pushed.
- All session 1 fixes verified live in the deployed bundle:
  - FAB hides during overlays (Health tab edit sheet → no orange `+` visible) ✓
  - `.ql-sheet` bottom padding: Save Changes / Remove buttons fully tappable above the bottom nav ✓
  - `index.html` carries both legacy + modern `mobile-web-app-capable` meta tags ✓

### Build

- `npm audit`: **0 vulnerabilities** as of end of session 2. Resolved in session 2 via `npm audit fix` (no `--force`): patch/minor bumps to vite, postcss, protobufjs, serialize-javascript transitives. Workbox internals upgraded 7.4.0 → 7.4.1, plugin-terser 0.4.4 → 1.0.0 (workbox-internal major bump, no impact on our code).
- Build: `npm run build` succeeds. Single 1.4 MB JS chunk warning is pre-existing — code-splitting is post-beta.
- `vite.config.js` `base: '/GutCheck/'` ✓.
- PWA: service worker generates at `dist/sw.js`. Verified on live URL — manifest path resolves correctly under `/GutCheck/` scope, install-to-home-screen works on iOS.

### Firebase

- Untouched. Stubbed out behind `isFirebaseReady()` guard. No real config, no service-account JSON anywhere in the tree.
- All Firebase work deferred to **session 3**. See `BACKLOG.md` §4 and `CLAUDE.md` §"Multi-user note".

### Smoke test results (live URL on iPhone)

All 12 items from session 2's iPhone smoke test passed cleanly:
- Cold load, all 5 bottom-nav tabs render, Insights empty state.
- Bottom-sheet clearance + FAB hide-during-overlay verified live.
- Symptom + meal save round-trip, IndexedDB persistence across reload.
- Light/dark theme toggle.
- PWA install + standalone launch.
- Long-press timing (~500ms) feels right on iOS.

### Queued for session 3

- Firebase project setup (real config, env-var-based).
- Auth UI (sign in / sign up / sign out).
- Firestore sync layer with `/users/{uid}/...` schema.
- Migration of existing local IndexedDB data into the per-user cloud schema.
- Conflict resolution for offline-first → cloud-sync edge cases.
- Onboarding flow for non-Kye testers (specced in `BACKLOG.md` §2).

### Open items / nice-to-have (non-blocking)

- 1.4 MB single-chunk JS bundle: should be code-split eventually for faster initial load, but not blocking beta.
- Bundle size warning is the only noise from `npm run build`; everything else is clean.
- No feedback-collection mechanism on the live URL yet — beta testers reporting issues is currently word-of-mouth. Could add a simple "Report" link in More tab pointing to email or a GitHub Issue template — flag for session 3 or later.
