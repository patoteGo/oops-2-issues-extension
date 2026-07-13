# oops 2 issues video recording — Manual Test Matrix (QA Gate)

Task 4 of the screen-video-recording feature (PRD objective). Run this matrix
before shipping any change that touches `lib/recorder.js`, `sidepanel/record*.js`,
or the upload path. The **automated regression invariants** live in
`sidepanel/__tests__/video-qa-regression.test.js`; this matrix covers the flows
that need a real browser + real `getDisplayMedia` share dialog.

**Setup:** `chrome://extensions` → Developer mode → Load unpacked → `oops-2-issues/dist` (after `npm run build`). Connect to GitHub in the side panel and pick a repository. Open the compose view.

---

## 1. Happy path — record, preview, save

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Record video** | Browser share dialog opens |
| 2 | Pick **Entire screen**, click **Share** | Timer starts (`00:00` → ticking); **Stop sharing** bar appears |
| 3 | Speak into the mic, move the cursor | No errors in the side panel |
| 4 | Click **Stop** within 60s | Timer freezes; preview `<video>` appears with **Re-record** + **Save** |
| 5 | Play the preview `<video>` | Webm plays with audio **and** the moving cursor; no **No audio** badge |
| 6 | Click **Save** | Status: "Recording embedded in the description." |
| 7 | Inspect the description | A `**[Screen recording](raw-url)** (mm:ss)` link is appended |
| 8 | DevTools → Network | Exactly **one** `PUT /repos/{owner}/{repo}/contents` fired; the response carried a `file.url` |

- [ ] Pass

## 2. Mic denied — silent clip with badge

| Step | Action | Expected |
|------|--------|----------|
| 1 | When the mic prompt appears, choose **Block** | Recording still proceeds (no abort) |
| 2 | Click **Stop** | Preview `<video>` appears |
| 3 | Preview | **No audio** badge is visible next to the video |
| 4 | Play the saved webm | Video plays; **no audio track** |

- [ ] Pass

## 3. 60s auto-stop (quota guard)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start a recording and **let it run** (do not click Stop) | Timer counts up |
| 2 | Wait past 60s | Recording **stops itself**; preview appears |
| 3 | Inspect the webm size | A few MB (compressed webm), **not** hundreds of MB |

- [ ] Pass

## 4. Browser "Stop sharing" (orphaned-stream guard)

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start a recording | Timer running |
| 2 | Click the browser's **Stop sharing** bar (or the chrome bar → Stop) | Recording ends cleanly |
| 3 | Side panel | Preview appears; no orphaned capture indicator; no errors |

- [ ] Pass

## 5. Re-record never uploads

| Step | Action | Expected |
|------|--------|----------|
| 1 | Record a short clip, **Stop** → preview | Preview visible |
| 2 | Open DevTools → Network, clear the log | — |
| 3 | Click **Re-record** | First blob discarded; recording restarts |
| 4 | DevTools → Network | **Zero** `PUT /repos/{owner}/{repo}/contents` calls fired (no upload until Save) |
| 5 | Record again, **Stop**, **Save** | Exactly one upload fires |

- [ ] Pass

## 6. Save path — single upload + single task create

| Step | Action | Expected |
|------|--------|----------|
| 1 | From a fresh preview, click **Save** | Description updated with `<video controls src=...>` |
| 2 | Fill title, pick repository, click **Create issue** | One `POST /repos/{owner}/{repo}/issues` fires |
| 3 | DevTools → Network total | Exactly **one** `PUT /repos/{owner}/{repo}/contents` (from Save) + **one** `POST /repos/{owner}/{repo}/issues` (from Submit) |
| 4 | Open the created issue | Description renders a **bold link** to the recording in `.oops-assets/` (GitHub strips inline `<video>`) |

- [ ] Pass

## 7. Regression — screenshot capture unchanged

| Step | Action | Expected |
|------|--------|----------|
| 1 | Click **Full Screen** capture | Screenshot added to the shot list |
| 2 | Submit the task | Description contains `![Screenshot 1](…)` (image embed, not `<video>`) |
| 3 | Existing PNG/WebP upload path | Works exactly as before this feature |

- [ ] Pass

## 8. Unsupported context — graceful disable

| Step | Action | Expected |
|------|--------|----------|
| 1 | In a context without `getDisplayMedia` (if testable), open the panel | **Record video** button disabled with a tooltip, **or** clicking surfaces a clear error status |
| 2 | Screenshot path | Still fully available |

- [ ] Pass

---

## Automated regression invariants (run via `npm test`)

These run on every commit and lock the rules the manual matrix verifies by hand:

- `video-qa-regression.test.js`
  - `buildVideoMarkdown('')` / `(null)` → `''` (re-record / no-URL never embeds a broken `<video>`)
  - `saveRecording` calls `uploadFile` **exactly once** per Save
  - `buildDescription` still emits `![label](url)` for images (video did not break the screenshot path)
  - `buildVideoMarkdown` emits `<video controls`, never `![]`

## Sign-off

- [ ] All 8 manual sections pass
- [ ] `npm test` green (132+ tests)
- [ ] Recorded on: ______  Tester: ______
