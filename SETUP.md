# GutCheck — Kye's Setup Checklist

Step-by-step to go from where you are now to a working Claude Code session on the project.

## Step 1 — Install Claude Code

Pick one:
- **VS Code extension** (recommended) — easiest, lets you read code + run terminal + edit files in one window
- **Terminal-only** — works fine, but you'll be jumping between editor and terminal

Install link: https://docs.claude.com/en/docs/claude-code/installation (or whatever the current install URL is — check the Claude apps menu in the chat sidebar)

## Step 2 — Make sure your project folder has the latest source files

Your project lives at: `C:\Users\kye\OneDrive\Documents\Personal\NourishLog\gutcheck`

The `src/App.jsx` and `src/utils/helpers.js` on your machine should already be the latest versions (you've been working on them locally). If you're unsure whether they match what's been delivered in chat, run:

```
wc -l src/App.jsx src/utils/helpers.js
```

Expected: `App.jsx` should be around 3,553 lines, `helpers.js` should be around 682 lines. If the line counts are way off, replace them with the files I delivered in the chat outputs (`/mnt/user-data/outputs/App.jsx` and `helpers.js`).

## Step 3 — Drop the handoff files into the project root

Copy these files from this chat's outputs into your project root folder (same level as `package.json`, NOT inside `src/`):

- `CLAUDE.md` — Claude Code reads this automatically
- `HANDOFF.md` — full session history
- `BACKLOG.md` — feature specs (CSV importer, onboarding, back-date helper, multi-user)
- `TESTING.md` — test checklist for the current build
- `app-css-additions.css` — CSS vars that need to be merged into `src/styles/app.css`
- `CLAUDE-CODE-FIRST-SESSION-PROMPT.md` — the prompt you'll paste into Claude Code

You can delete `CLAUDE-CODE-FIRST-SESSION-PROMPT.md` after your first session — it's not needed long-term.

After this step, your project root looks like:
```
gutcheck/
  CLAUDE.md                         ← new
  HANDOFF.md                        ← new
  BACKLOG.md                        ← new
  TESTING.md                        ← new
  app-css-additions.css             ← new (temporary)
  CLAUDE-CODE-FIRST-SESSION-PROMPT.md ← new (temporary)
  package.json
  vite.config.js
  index.html
  src/...
  ...
```

## Step 4 — Don't touch GitHub yet

The GitHub strategy is:
1. Rename existing `KyeAnderson575/GutCheck` repo to `GutCheck-archive` (keep history as a backup)
2. Create a new empty `KyeAnderson575/GutCheck` repo
3. Push the current state as a single commit later

**You'll do this with Claude Code's help, not before.** Claude Code will guide you through it when the time comes. Do NOT delete the existing repo.

If you want to be extra-cautious before any GitHub work begins, you can rename the repo manually now:
- Go to https://github.com/KyeAnderson575/GutCheck/settings
- Scroll down to "Repository name"
- Change to `GutCheck-archive`
- Click Rename

This is optional — Claude Code can walk you through it later.

## Step 5 — Open the project in Claude Code

- Open VS Code (or your terminal)
- Open the `gutcheck/` folder
- Start a Claude Code session (in VS Code: command palette → "Claude Code: Start Session"; in terminal: `claude` from the project root)

## Step 6 — Paste the first-session prompt

Open `CLAUDE-CODE-FIRST-SESSION-PROMPT.md`, copy its entire contents, and paste as your first message to Claude Code.

It will then:
- Read CLAUDE.md, HANDOFF.md, BACKLOG.md, TESTING.md
- Read App.jsx and helpers.js
- Stay in plan mode and propose what to do first
- Ask you clarifying questions

## Step 7 — Approve the plan or push back

Read what Claude Code proposes. If it looks right, say "go ahead" or "approved." If it doesn't, tell it what's wrong and have it revise.

Don't let it skip the plan stage. The plan is the contract for the session.

## What to expect from the first session

Probably:
1. Claude Code reads everything and asks one or two clarifying questions
2. Proposes: "let's merge the CSS additions, run vite, walk the testing checklist"
3. You approve
4. It walks you through merging the CSS file (it'll show you which lines go where)
5. You run `npx vite` in the terminal (Claude Code can run it for you, but I'd run it yourself the first time so you know how)
6. The app loads
7. You walk the smoke test together — Claude Code asks what you see, fixes issues as they surface
8. By end of session: you've got a build that works, a list of any leftover bugs, and a plan for next session

Don't expect to also do GitHub setup or multi-user in the same session. Save those for follow-ups.

## If something goes wrong

- **App won't load / crashes on open:** Claude Code reads the console error, walks you through the fix
- **Light mode looks broken:** the CSS additions weren't merged correctly. Re-do step in `app-css-additions.css`
- **You break something accidentally:** Claude Code can revert the file with git (`git checkout -- src/App.jsx`)
- **Claude Code proposes something wild:** push back. Say "no, let's stick to the plan" or "explain why first."
