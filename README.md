# BugSnap — Chrome Extension

A Manifest V3 Chrome extension that captures a screenshot (full tab **or** a
drag-selected region), writes a markdown bug description, and **files a task in
the EP Project Manager** — signing in to the EP API and saving into a chosen
project.

The UI lives entirely in the Chrome **side panel**. It is vanilla JS (no
framework, no build step) with inline SVG icons for a clean, fast UI, and it
takes **zero page space** when closed — the region selector is injected only
during the selection gesture and torn down immediately afterwards.

## Features

- **Sign in** to the EP Project Manager API (`POST /api/auth/login`) — JWT stored locally.
- **Pick a project** fetched live from `GET /api/projects`.
- **Capture**: two one-click buttons — **Full Screen** grabs the visible tab immediately, **Partial** injects the drag-to-select overlay (the screen dims outside; the selection stays clear). You can attach **multiple** screenshots (full + region, any mix) to one task.
- **Markdown editor** with a formatting toolbar, a **Write/Preview tab** switch, and a live rendered preview.
- **Multiple screenshots** per task — full tab or region, any mix. Each capture has its own **description** ("why it's important") that is stored on the attachment (`DocumentAttachment.description`) and shown as a caption in the task body.
- **Per-screenshot source URL** — because the panel stays open while you browse, every capture remembers the page it came from (`url`, `title`, `capturedAt`). The thumbnail shows a clickable source link, and the task body lists each source. Captures from **several different pages** in one task are fully supported.
- **Checklist** — build a reusable verification/steps checklist (add / check / remove) that is sent as a structured `checklist` field on the task, matching the main app's task checklist (`{ id, text, completed, createdAt, completedAt }`). Survives draft restore.
- **Screenshot upload** (`POST /api/upload` with a per-file `description`) → embedded as `![](url)` + italic caption in the description AND attached as structured `attachments` so the main app's attachment panel shows them with captions.
- **Reference attachments** — drag & drop (or **browse**) any file to attach it as a reference: images, PDFs, Office docs, spreadsheets, archives, text/code. Each reference gets an optional caption and is uploaded via the same `/api/upload` endpoint, merged into the task's `attachments`, and rendered as a `#### References` section (images embed inline, other files link by name). Type/size are validated against the same rules as `/api/upload` (≤ 25 MB).
- **Create task** (`POST /api/tasks`) with title, priority, description, and `attachments` (jsonb array of `{url, name, type, size, description, …}`).
- Smart prefill: title ← page title, description ← selected text.
- Draft resilience: capture + form are persisted to `chrome.storage.session`.

## Architecture

```
Side Panel (UI)              Background SW              Page (on demand)
sidepanel.js  ──CAPTURE_*──▶  background.js  ──executeScript──▶ content.js (metadata)
  • auth / projects            • captureVisibleTab       • extractMetadata()
  • markdown editor            • inject region selector  ──selector overlay──▶ selector.js
  • upload + create task  ◀──dataUrl + metadata───        ◀──REGION_SELECTED──
```

**Full capture:** `captureVisibleTab` → PNG → compressed to WebP (≤1280px, q=0.7) in the side panel.

**Region capture:** capture full PNG first → inject `selector.js` + `selector.css` overlay over the live page (whole screen dims) → drag a rectangle (clear inside, dark outside via box-shadow) → overlay reports the rect (CSS px) → side panel crops the clean PNG on a canvas → compress to WebP → added to the screenshot list. The overlay removes itself on confirm/cancel (zero footprint). Each capture is appended, so a task can carry several screenshots.

## File layout

```
bugsnap-extension/
├── manifest.json          # MV3 (side panel)
├── background.js          # service worker: capture, region inject, messaging
├── content.js             # extractMetadata() (read-only, self-contained)
├── selector.js            # region selection overlay (injected, self-contained)
├── selector.css           # overlay styles (injected via insertCSS — CSP-safe)
├── lib/
│   ├── api.js             # EP API client: login, getProjects, upload, createTask
│   ├── icons.js           # inline SVG icon set (currentColor)
│   └── markdown.js        # tiny, safe markdown → HTML for preview
├── sidepanel/
│   ├── sidepanel.html     # auth / compose / settings views
│   ├── sidepanel.js       # controller (ES module)
│   └── sidepanel.css      # elegant dark theme
├── icons/                 # 16/48/128 px PNGs ("EP" wordmark)
└── scripts/gen-icons.js   # one-shot icon generator (node, no deps)
```

## Build & load it in Chrome

The extension is vanilla JS (no bundler), but the source folder contains
tests, scripts, and config that Chrome doesn't need. Build a clean copy into
`dist/` (gitignored) and load that:

```bash
cd bugsnap-extension
npm run build          # → dist/  (only the files Chrome needs)
npm run watch          # rebuild dist/ on every source change (optional)
```

Then:

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select `bugsnap-extension/dist/`.
3. Click the BugSnap toolbar icon → the side panel opens.
4. **Sign in** with your **email** and password. The extension connects to `https://management.epsoftware.com.br` by default. Your session stays signed in for 30 days — you won't be asked again until the token expires (override the API URL in **Settings** for local development).

> Tip: with `npm run watch` running, just hit the **reload** icon on the
> extension card after editing source — Chrome picks up the new `dist/` files.

## How a task is created

Given one or more captures and a markdown description, the submitted task body is:

```
<your markdown>

![Screenshot](<uploaded url>)
*<caption — why this matters>*

# — or, with multiple captures (possibly from different pages) —

#### Screenshots

![Screenshot 1](<url 1>)
*<caption 1> — [<page title 1>](<page url 1>)*

![Screenshot 2](<url 2>)
*<caption 2> — [<page title 2>](<page url 2>)*

#### Context

- **Sources (2 pages):**
  1. [<page title 1>](<page url 1>)
  2. [<page title 2>](<page url 2>)
- **Captured:** 2026-06-15T...

# — or, with reference files attached (drag & drop) —

#### References

![design.png](<url>)
*the proposed layout*

- **[error.log](<url>)** — *tail of prod logs*
- **[spec.pdf](<url>)*
```

Then `POST /api/tasks { projectId, title, description, priority: <low|medium|high|critical>, status: 'open', taskType: 'bug_fix', attachments: <json string of [{url,name,type,size,description,...}]>, checklist: <json string of [{id,text,completed,createdAt,completedAt}] or null> }`.

> The `attachments` array merges both **screenshots** and **reference files** (drag & drop). Reference images also embed inline under `#### References`; non-image references are listed as named links. Either way they appear natively in EP Project Manager's attachment panel.

> Per-screenshot descriptions are a **main-app-supported feature**: `DocumentAttachment.description` is part of the type, the `/api/upload` endpoint accepts a `description` form field, and the attachments UI renders it — so captions entered in BugSnap show up natively in EP Project Manager.

## Performance & safety notes

- **No UI blocking.** `captureVisibleTab` runs in the worker; canvas crop/compress is awaited after the status paints.
- **WebP over PNG.** PNG screenshots (2–5 MB) compress to ~150–300 KB at 1280px / q=0.7.
- **Zero page footprint.** No persistent content scripts. The region overlay exists only during selection.
- **No remote code.** No Tailwind CDN (MV3 forbids it); hand-written CSS + inline SVG only. Markdown preview is parsed via `DOMParser` and sanitized (scripts, `on*` handlers, and unsafe URL schemes stripped).

## Configure

- **API URL** — set on the sign-in form or in Settings (persisted in `chrome.storage.local`).
- **Sign out** — top-bar button clears the stored token.

## Re-generate icons

```bash
cd bugsnap-extension
node scripts/gen-icons.js   # → icons/icon{16,48,128}.png (rose "EP" wordmark)
```

## Testing

Unit tests cover the pure main flows — task-body composition (incl. multi-
page source dedup), per-screenshot source building, draft normalization, the
markdown preview renderer, page-metadata extraction, and the EP API client.
They run on the host repo's Vitest + jsdom (the extension itself ships zero
runtime deps):

```bash
npm run test:extension         # from the repo root
npm run test:extension:watch   # watch mode
```

The controller (`sidepanel.js`) stays UI/Chrome-coupled; its testable logic
lives in `sidepanel/logic.js`, which `sidepanel.js` imports.

## Package

```bash
cd bugsnap-extension && npm run zip   # builds dist/, then → bugsnap-extension.zip
```
