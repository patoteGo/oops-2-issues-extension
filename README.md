# oops 2 issues — Chrome Extension

[![CI](https://github.com/patoteGo/oops-2-issues-exntension/actions/workflows/ci.yml/badge.svg)](https://github.com/patoteGo/oops-2-issues-exntension/actions/workflows/ci.yml)
[![tests](https://img.shields.io/badge/tests-141%20passing-brightgreen?logo=vitest&logoColor=white)](https://github.com/patoteGo/oops-2-issues-exntension/actions/workflows/ci.yml)
[![version](https://img.shields.io/github/package-json/v/patoteGo/oops-2-issues-exntension?label=version&color=blue)](https://github.com/patoteGo/oops-2-issues-exntension)
[![Chrome MV3](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Manifest](https://img.shields.io/badge/Manifest-V3-34A853)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![runtime deps](https://img.shields.io/badge/runtime%20deps-0-success?logo=javascript&logoColor=black)](#file-layout)
[![made for GitHub](https://img.shields.io/badge/made%20for-GitHub%20Issues-181717?logo=github&logoColor=white)](https://github.com/patoteGo/oops-2-issues-exntension)

A Manifest V3 Chrome extension that captures a screenshot (full tab **or** a
drag-selected region), lets you write a markdown description, and **files it
as a GitHub issue** in any repository you can access — using a **GitHub
Personal Access Token (PAT)**. No backend of our own; it talks to the GitHub
REST API directly from your browser.

The UI lives entirely in the Chrome **side panel**. It is vanilla JS (no
framework, no build step) with inline SVG icons, and it takes **zero page
space** when closed — the region selector is injected only during the
selection gesture and torn down immediately afterwards.

## Features

- **Connect with a GitHub PAT** — enter a token once; it's verified against
  `GET /user` and stored locally (never sent anywhere except `api.github.com`).
- **Pick a repository** fetched live from `GET /user/repos` (your owned,
  collaborator, and org repos, most recently updated first; 🔒 marks private).
- **Capture**: two one-click buttons — **Full Screen** grabs the visible tab
  immediately; **Partial** injects a drag-to-select overlay (the screen dims
  outside, the selection stays clear). Attach **multiple** screenshots to one
  issue.
- **Markdown editor** with a formatting toolbar, a **Write/Preview** tab
  switch, and a live rendered preview.
- **Per-screenshot source URL** — every capture remembers the page it came
  from; the issue body lists each source.
- **Record video** (screen + mic, up to 60s) — uploaded to the repo and linked
  in the issue body (GitHub strips inline `<video>`, so recordings are
  embedded as a clickable link).
- **Reference attachments** — drag & drop (or browse) any file ≤ 25 MB; images
  embed inline, other files link by name.
- **Checklist** — rendered as a GitHub-native task list (`- [ ]` / `- [x]`)
  with real checkboxes on GitHub.
- **Create issue** (`POST /repos/{owner}/{repo}/issues`) — on success a toast
  with an **Open on GitHub** link appears.
- Smart prefill: title ← page title, description ← selected text.
- Draft resilience: capture + form are persisted to `chrome.storage.session`.

## How screenshots/references are stored

GitHub **strips `data:`/base64 images** from issue bodies, so raw base64
embedding is impossible. Instead oops 2 issues uses a two-strategy upload
that renders inline on **both public and private** repos:

1. **Strategy A — GitHub user-attachments (primary).** When you're logged
   into github.com in the browser, the extension uploads each image through
   GitHub's own `github.com/.../upload/policies/assets` web flow (the same one
   the issue editor uses when you paste/drag an image). The result is a
   `github.com/user-attachments/assets/<id>` URL that renders inline on public
   *and* private repos, is account-level (not tied to the target repo), and
   commits nothing. This is an undocumented `github.com` web route, so it uses
   your browser session cookie — not the PAT.
2. **Strategy B — public assets repo (automatic fallback).** If Strategy A is
   unavailable (you're not logged in, or GitHub changed the flow), the image is
   uploaded to a **public** assets repository via the Contents API and
   referenced by its raw URL, which also renders inline regardless of the
   target repo's visibility. By default this auto-creates `<you>/oops-assets`;
   set a custom one in **Settings → Assets repository**.

Each Strategy-B upload is a single commit on the assets repo's default branch
with the message `chore: add <name> (oops 2 issues)`.

## Create a GitHub token

1. Open **<https://github.com/settings/tokens?type=beta>** (fine-grained,
   recommended) or **<https://github.com/settings/tokens>** (classic).
2. Fine-grained scopes (per repository or "all repositories"):
   - **Contents: Read and write** (upload screenshots + create issue)
   - **Issues: Read and write** (create issues)
   - **Metadata: Read** (auto-included)
3. Classic scopes: **`repo`** (covers public + private repos, contents, and issues).
4. Copy the token — you'll paste it into the extension.

## Install (load unpacked)

The extension is vanilla JS (no bundler), but the source folder contains
tests, scripts, and config Chrome doesn't need. Build a clean copy into
`dist/` (gitignored) and load that:

```bash
npm ci            # install dev deps (vitest + jsdom for the tests)
npm run build      # → dist/  (only the files Chrome needs)
npm run watch      # rebuild dist/ on every source change (optional)
```

Then in Chrome / Edge / Brave:

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`dist/`** folder.
4. Pin the **oops 2 issues** toolbar icon and click it → the side panel opens.
5. **Paste your GitHub token** → **Connect**.
6. **Pick a repository**, snap, describe, **Create issue**.

> Tip: with `npm run watch` running, hit the **reload** icon on the extension
> card after editing source — Chrome picks up the new `dist/` files.

## Use it

1. Browse to the page with the bug. Click the **oops 2 issues** icon → the
   side panel opens.
2. **Repository** — pick the target repo from the dropdown (🔁 refresh).
3. **Title** — auto-filled from the page title; edit as needed. Set **Priority**.
4. **Description** — write markdown. The selected text on the page is pre-filled.
5. **Screenshots** — click **Full Screen** or **Partial** (drag a region).
   Add several; each can have a caption and remembers its source page.
6. **Checklist** (optional) — add steps to verify; they ship as GitHub checkboxes.
7. **References** (optional) — drag & drop files.
8. **Create issue** — screenshots attach inline (via your github.com session,
   with a public-assets fallback), then the issue is created. An
   **Open on GitHub** link appears in the toast.

## Architecture

```
Side Panel (UI)              Background SW              Page (on demand)
sidepanel.js  ──CAPTURE_*──▶  background.js  ──executeScript──▶ content.js (metadata)
  • token / repos              • captureVisibleTab       • extractMetadata()
  • markdown editor            • inject region selector  ──selector overlay──▶ selector.js
  • upload + create issue ◀──dataUrl + metadata───        ◀──REGION_SELECTED──
```

**Full capture:** `captureVisibleTab` → PNG → compressed to WebP (≤1280px, q=0.7) in the side panel.

**Region capture:** capture full PNG first → inject `selector.js` + `selector.css` overlay over the live page (whole screen dims) → drag a rectangle (clear inside, dark outside via box-shadow) → overlay reports the rect (CSS px) → side panel crops the clean PNG on a canvas → compress to WebP → added to the screenshot list. The overlay removes itself on confirm/cancel (zero footprint).

**Issue body** is composed from your markdown + `![caption](rawUrl)` screenshot blocks (each with its source link), a `#### Context` section listing source pages, an optional `#### References` section for dropped files, and a `#### Checklist` rendered as `- [ ]` task items.

## File layout

```
oops-2-issues/
├── manifest.json          # MV3 (side panel)
├── background.js          # service worker: capture, region inject, messaging
├── content.js             # extractMetadata() (read-only, self-contained)
├── selector.js            # region selection overlay (injected, self-contained)
├── selector.css           # overlay styles (injected via insertCSS — CSP-safe)
├── lib/
│   ├── api.js             # GitHub API client: verify, getUser, getRepos, uploadFile, createIssue
│   ├── icons.js           # inline SVG icon set (currentColor)
│   └── markdown.js        # tiny, safe markdown → HTML for preview
├── sidepanel/
│   ├── sidepanel.html     # connect / compose / settings views
│   ├── sidepanel.js       # controller (ES module)
│   └── sidepanel.css      # elegant dark theme
├── icons/                 # 16/48/128 px PNGs
└── scripts/
    ├── build.js           # one-shot build → dist/
    └── gen-icons.js       # icon generator (node, no deps)
```

## Testing

Unit tests cover the pure flows — the GitHub API client, issue-body
composition, reference formatting, draft normalization, the markdown preview
renderer, page-metadata extraction, and the recorder state machine. They run
on Vitest + jsdom (the extension itself ships zero runtime deps):

```bash
npm test            # one-shot
npm run test:watch  # watch mode
```

The controller (`sidepanel.js`) stays UI/Chrome-coupled; its testable logic
lives in `sidepanel/logic.js`, which `sidepanel.js` imports.

## Package

```bash
npm run zip   # builds dist/, then → oops-2-issues.zip
```

## Configure / troubleshoot

- **Change token / reconnect** — open **Settings** (gear icon), paste a new
  token, **Save & connect**.
- **Assets repository** — optional; set a public `owner/name` repo for the
  image fallback (Strategy B). Leave blank to auto-create `<you>/oops-assets`.
- **Disconnect** — the sign-out button (top bar) clears the stored token.
- **Screenshots don't render inline?** You're probably not logged into
  github.com in the browser, so Strategy A is skipped — images still upload via
  the public assets repo (Strategy B) and render there. Log into github.com to
  get the cleaner no-commit Strategy A.
- **404 on create** — the token lacks **Issues: write**, or the repo doesn't
  exist / isn't visible to the token.

## Privacy

The token and captured screenshots are stored locally in Chrome (`chrome.storage.local`
and `chrome.storage.session`). All network traffic goes to
`https://api.github.com` and `https://raw.githubusercontent.com` only.

## Re-generate icons

```bash
node scripts/gen-icons.js   # → icons/icon{16,48,128}.png
```
