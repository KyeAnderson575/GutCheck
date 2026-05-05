# GutCheck — Sessions / Multi-Device Git Workflow

Reference for the day-to-day git + environment workflow across Kye's machines (home dev box + secondary device). Read on demand when something git-related or environment-related goes sideways. Not part of every session.

---

## First-time setup on a new device

When pulling GutCheck onto a machine that's never seen it before:

```bash
# 1. Clone (HTTPS — adjust if you've set up SSH)
cd "C:\Claude Projects"     # or wherever you keep projects on that machine
git clone https://github.com/KyeAnderson575/GutCheck.git
cd GutCheck

# 2. Install deps (use ci, not install — locks to package-lock.json exactly)
npm ci

# 3. Verify the dev server starts
npm run dev
# Should serve at http://localhost:5173/GutCheck/  (note the /GutCheck/ subpath — that matches the deploy)
```

Expected state after `npm ci`:
- `node_modules/` populated, ~486 packages.
- No `.env` file (Firebase isn't wired up yet — session 3+).
- `npm audit` may flag dev-dependency vulns; that's a build-pipeline-only concern.

If the dev server fails to start: check Node version (`node --version`). Project assumes Node 20+ (matches the CI workflow).

---

## Daily loop (the normal session shape)

Run from the project root (`C:\Claude Projects\GutCheck` on the home machine).

```bash
# 1. Start every session by syncing
git status            # confirm clean tree (or note in-progress work)
git pull              # bring in any commits made on the other machine
                      # if pull says "Already up to date." you're good

# 2. Work. Test locally with `npm run dev`.

# 3. Before committing, look at what changed
git status
git diff              # for unstaged changes
git diff --staged     # for staged changes

# 4. Stage + commit (named files, never `git add -A` for routine work — see Gotcha 4)
git add path/to/changed/file
git commit -m "short imperative message"

# 5. Push
git push

# 6. Confirm CI deploy went green
# Browser: https://github.com/KyeAnderson575/GutCheck/actions
# Wait for the latest run on `main` to show a green check (~1–2 min).
# Then verify the live URL: https://kyeanderson575.github.io/GutCheck/
# Hard-reload on phone (close PWA fully, reopen) to dodge service-worker caching.
```

If the Actions run goes red: open the failed step's log, read the actual error (don't guess), fix locally, commit, push again. Never `--force`.

---

## Common gotchas with concrete fixes

### 1. `vite.config.js` `base` path mismatch breaks the deploy

**Symptom:** Live URL loads a blank page or 404s on assets. DevTools network tab shows requests to `/assets/...` instead of `/GutCheck/assets/...`.

**Cause:** `base` in `vite.config.js` got changed (or the repo got renamed without updating it).

**Fix:** Confirm `base: '/GutCheck/'` in `vite.config.js`. The base must exactly match the GitHub repo name (case-sensitive). If the repo is ever renamed, update this line and the `start_url` / `scope` inside the PWA manifest in the same file.

### 2. GitHub Pages "Source" toggle reverting

**Symptom:** Pushed to `main`, Actions ran green, but the live URL still serves the old version (or 404s with "There isn't a GitHub Pages site here").

**Cause:** Pages "Source" got reset to "Deploy from a branch" instead of "GitHub Actions".

**Fix:** Browser → `https://github.com/KyeAnderson575/GutCheck/settings/pages` → "Build and deployment" → Source → select **"GitHub Actions"**. Save. Re-run the latest workflow from the Actions tab (or push a no-op commit).

### 3. PWA service worker serving the old version after a deploy

**Symptom:** Deploy went green, hard-reload still shows the old UI.

**Cause:** The previously installed service worker is serving cached assets. `registerType: 'autoUpdate'` in `vite.config.js` should pick up new versions, but PWAs aggressively cache.

**Fix order (try in this order):**
1. Hard refresh: Cmd/Ctrl+Shift+R on desktop. On iOS Safari: close the tab fully, reopen.
2. If installed as a home-screen PWA on iPhone: close the app fully (swipe up in app switcher), reopen. May take one or two reopens for the SW to update.
3. Last resort, in DevTools (desktop): Application → Service Workers → "Unregister" → reload.
4. Nuclear option: bump the `name` field inside the PWA manifest (forces a fresh install identifier). Don't do this unless the above all fail.

### 4. `npm ci` vs `npm install` on CI vs locally

**Use `npm ci` on CI** (it's in the deploy workflow). It's faster and refuses to update `package-lock.json`, which is what we want for deterministic builds.

**Use `npm install` locally only when adding/upgrading a dep.** Otherwise prefer `npm ci` locally too — it gets you the exact state the deploy will use, no surprise transitives.

If `npm ci` fails locally with "package-lock.json out of sync" but the lock file was just committed: someone (probably Claude) ran `npm install` and changed the lock without committing. Fix: `git status` to find the dirty `package-lock.json`, decide whether to commit or revert.

### 5. Line-ending churn between Kye's machines

**Symptom:** `git status` shows a file as modified even though you didn't touch it. `git diff` is mostly empty or shows `^M` characters.

**Cause:** Git's `core.autocrlf` setting differs across machines.

**Fix:** Add a `.gitattributes` file at the project root with at minimum:
```
* text=auto eol=lf
*.png binary
*.jpg binary
*.svg text
```
Then run `git add --renormalize .` once. Future commits will be consistent regardless of which machine is editing.

This hasn't bitten us yet — only add `.gitattributes` if it actually shows up.

### 6. `git add -A` accidentally staging build artifacts

**Symptom:** `git status` shows `dist/`, `dev-dist/`, or some other build output as staged.

**Cause:** Either `.gitignore` is missing a pattern or `git add -A` swept up something it shouldn't.

**Fix:** Check `.gitignore` includes the path. If it does and the file is still tracked, it was added before the ignore rule landed:
```bash
git rm --cached path/to/tracked/file
git commit -m "Stop tracking <file>"
```

### 7. Pushing fails with "fetch first" / non-fast-forward

**Symptom:** `git push` rejects with "Updates were rejected because the remote contains work that you do not have locally."

**Cause:** You committed on machine B, then committed on machine A without pulling first.

**Fix:**
```bash
git pull --rebase    # replays your local commits on top of remote
# resolve any conflicts, then
git push
```
**Never** `git push --force`. If the rebase lands you in a state you don't trust, stop and ask before doing anything else.

### 8. Old GutCheck repo lives at `Archive_GutCheck`

The legacy v11-era repo (NourishLog → GutCheck rename history, before the fresh-history reset in session 2) was renamed to `KyeAnderson575/Archive_GutCheck` and made private. It exists as a permanent backup. **Do not push to it. Do not delete it.** If you ever need to recover something from before the session 2 fresh start, that's where to look.

### 9. First push rejected with `GH007: Your push would publish a private email address`

**Symptom:** `git push` is rejected with:
```
remote: error: GH007: Your push would publish a private email address.
remote: You can make your email public or disable this protection by visiting:
remote: https://github.com/settings/emails
```

**Cause:** Your commit was authored with a real email address (e.g. `kye@co-innovate.com`) that you've marked private on GitHub. GitHub blocks the push so the email doesn't end up in public commit history.

**Fix (privacy-preserving — recommended):**
1. Find your GitHub no-reply email at `https://github.com/settings/emails`. It looks like `<numeric-id>+<username>@users.noreply.github.com`.
2. Update the local repo's identity: `git config user.email "<numeric-id>+<username>@users.noreply.github.com"`.
3. Amend the existing commit's author to use the new email: `git commit --amend --reset-author --no-edit`.
4. Push again.

This only needs to happen once on a fresh repo. After the first commit lands with the no-reply email, future commits inherit the right identity from `git config`.

**Already-known no-reply for this account:** `270755902+KyeAnderson575@users.noreply.github.com`.

### 10. Switching between Kye's machines mid-feature

If you have uncommitted work on machine A and need to move to machine B, easiest path is to commit the WIP and push:

```bash
git add -A
git commit -m "WIP: <one-liner>"
git push
```

On machine B: `git pull`, continue, eventually amend or squash the WIP into a real commit before the next deploy. The CI deploys on every push to `main`, so a WIP push will overwrite the live site — if that's a problem, work on a branch instead:

```bash
# machine A
git checkout -b wip/feature
git add -A && git commit -m "WIP" && git push -u origin wip/feature
# machine B
git fetch && git checkout wip/feature
# ...finish, merge to main when ready
```

---

## When in doubt

Ask Kye before any operation that:
- Touches `origin` (push, force, branch deletion on remote).
- Rewrites local history (rebase, reset --hard, amend on a pushed commit).
- Changes `.gitignore` rules retroactively for already-tracked files.
- Adds or modifies CI workflow files.
- Touches GitHub repo settings (visibility, Pages source, branch protection).

The cost of pausing is one extra message. The cost of an unwanted rewrite or wrong push is hours of recovery.
