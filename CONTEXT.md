# oops 2 issues

A Manifest V3 Chrome extension that captures the page (Screenshot or Recording),
lets the user compose a description, and files it as a GitHub **Issue** via a
Personal Access Token. No backend of its own — it speaks to the GitHub REST API
(and one github.com web route for inline images) directly from the browser.

## Language

### The filed artifact

**Issue**:
The GitHub issue the extension files — title plus a composed markdown body.
_Avoid_: task, ticket. (Legacy code comments say "task"; the domain term is Issue.)

**Issue Body**:
The composed markdown body of an Issue — the user's markdown assembled with the
Screenshot blocks, Reference section, and Checklist. One concept, one module.
_Avoid_: description, task body. ("description" is the user's input, not the
composed whole.)

**Description**:
The user-authored markdown the user types into the editor. A _part_ of the
Issue Body, not the whole. (Recordings are appended here as links.)
_Avoid_: body, content.

### Parts of an Issue Body

**Screenshot**:
A captured image of the page (full visible tab or a drag-selected region),
compressed to WebP, embedded inline with its source page.
_Avoid_: image, capture. ("capture" is the act, not the artifact.)

**Reference**:
A user-attached file (drag & drop or browse) that is NOT a Screenshot — image,
PDF, doc, archive, etc. Listed under the Issue Body's References section.
_Avoid_: attachment. ("attachment" is generic; the term is Reference.)

**Recording**:
A screen-plus-microphone video capture (≤60s). GitHub strips inline `<video>`,
so it is committed to the repo and embedded as a link inside the Description.
_Avoid_: video.

**Checklist**:
Verification steps the user adds; shipped as a GitHub-native task list
(`- [ ]` / `- [x]`) of real checkboxes.
_Avoid_: todos, steps.

### Around the edges

**Capture**:
The act of grabbing a Screenshot (full or region) or a Recording from the page.
_Avoid_: grab, snapshot.

**Account**:
A stored GitHub PAT together with its verified user and optional Assets
Repository. Several may coexist (typically one per org); one is active.
_Avoid_: token, user. ("user" is the GitHub identity; "Account" is the record.)

**Assets Repository**:
A public repo used as the fallback upload target so inline images render on any
target repo's visibility. Auto-provisions as `<login>/oops-assets`.
_Avoid_: assets repo.
