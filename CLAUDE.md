# Fantasy Sweat: notes for Claude

Chrome extension (MV3, plain JS, no build step, no dependencies) that shows Sleeper and ESPN fantasy matchups and who to cheer or root against. See README.md for features, data sources and publishing.

## How we work
- **One branch and pull request per change** (`gh pr create`). For GitHub issues, one branch per issue, with `Fixes #N` in the PR so merging closes it. Only merge when the user says so (`gh pr merge N --merge --delete-branch`), then pull `main`.
- **Ask before changing things you found yourself** (bugs, cleanups): list them first and let the user pick.
- After opening a PR, switch the local folder back to `main`, unless the user wants to test the branch. The folder is what Chrome loads unpacked, so the checked-out branch is what they see after reloading.
- Commit or push only when asked.

## Don't
- **Don't change `"version"` in `manifest.json` unless asked.** Raising it on `main` makes GitHub Actions publish to the Chrome Web Store (`.github/workflows/publish.yml`).
- Never read, write or ask for the store secrets (`EXTENSION_ID`, `PUBLISHER_ID`, `CLIENT_ID`, `CLIENT_SECRET`, `REFRESH_TOKEN`). The user manages them in the repo settings.
- The repo is public: no leaguemates' private data, real league IDs, or other people's info in code, docs or placeholders.

## Testing
- Real extension: `chrome://extensions` → ↻ on Fantasy Sweat after changing files.
- Quick browser preview: serve this folder with any static server (e.g. `python3 -m http.server 8765`) and open `popup.html?full=1` (or `?window=1` for the popout layout). Outside the extension, settings fall back to `localStorage`.
- The preview can't run Chrome-only APIs (`chrome.windows`, `chrome.tabs`, `chrome.runtime.getContexts`). Say so and give the user steps to check those in real Chrome.
- ESPN's scoreboard rejects non-browser user agents (curl, scripts), so test ESPN data from a browser page.
- Sleeper's Game Center `graphql` feed and ESPN's APIs are unofficial and can change.

## Code conventions
- Everything is in `popup.js` / `popup.css` / `popup.html`. DOM is built with the `h()` helper, and storage goes through `store` (chrome.storage or localStorage).
- Match the existing style: short comments that explain why, and small named helpers.
- Store zip for a manual upload: `manifest.json`, `popup.html`, `popup.css`, `popup.js`, `icons/` at the zip root, with forward-slash paths.
