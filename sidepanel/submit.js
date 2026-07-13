/**
 * BugSnap — task submission + form reset.
 *
 * Uploads screenshots then reference files (each with its caption), merges
 * them into the structured attachments array, composes the description, and
 * creates the task.
 */
import {
  el,
  state,
  api,
  setStatus,
  setBusy,
  setButtonLoading,
  showFormToast,
  recordReset,
  clearDraft,
  getRecordResult,
} from './core.js'
import { buildDescription } from './logic.js'
import { buildReferences } from './attachments.js'
import { debugStep } from './debug.js'
import { renderShots } from './screenshots.js'
import { renderAttachments } from './references.js'
import { renderChecklist } from './checklist.js'
import { syncPreview } from './editor.js'
import { saveRecording } from './record-save.js'

function dataUrlToBlob(dataUrl) {
  return fetch(dataUrl).then(r => r.blob())
}

export async function handleSubmit() {
  if (state.busy) return
  const projectId = el.project.value
  const title = el.title.value.trim()
  if (!projectId) {
    setStatus('err', 'Choose a project first.')
    return
  }
  if (!title) {
    setStatus('err', 'Title is required.')
    el.title.focus()
    return
  }

  setBusy(true)
  setButtonLoading(el.submitBtn, true)
  try {
    // Upload every screenshot (full or region) WITH its per-image description.
    // The upload endpoint stores `description` on the file object, which the
    // main app's attachments UI renders natively (DocumentAttachment.description).
    const files = []
    for (let i = 0; i < state.screenshots.length; i++) {
      const shot = state.screenshots[i]
      const data = shot.data ?? shot
      const desc = shot.description ?? ''
      setStatus(
        'busy',
        `Uploading screenshot ${i + 1}/${state.screenshots.length}…`
      )
      setButtonLoading(el.submitBtn, true, 'Uploading…')
      const blob = await dataUrlToBlob(data)
      files.push(await api().uploadScreenshot(state.token, blob, desc))
    }

    // Structured attachments (native panel + descriptions) + markdown captions.
    const attachments = files.map(toAttachment)

    // If the user stopped recording but didn't click Save (or Save click failed),
    // save it now before creating the task. One video preview = one upload.
    const pendingRecording = getRecordResult()
    if (pendingRecording?.blob) {
      setStatus('busy', 'Uploading recording…')
      setButtonLoading(el.submitBtn, true, 'Uploading recording…')
      const { markdown, file } = await saveRecording({
        blob: pendingRecording.blob,
        hasAudio: pendingRecording.hasAudio,
        durationMs: pendingRecording.durationMs,
        getToken: () => state.token,
        api,
      })
      state.uploaded.push(file)
      const cur = el.description.value.trim()
      el.description.value = cur ? `${cur}\n\n${markdown}` : markdown
      el.description.dispatchEvent(new Event('input', { bubbles: true }))
    }

    // Reference files (drag & drop / browse) — upload each with its caption,
    // then merge into the structured attachments array for the native panel.
    const refFiles = []
    for (let i = 0; i < state.attachments.length; i++) {
      const att = state.attachments[i]
      setStatus(
        'busy',
        `Uploading reference ${i + 1}/${state.attachments.length}…`
      )
      setButtonLoading(el.submitBtn, true, 'Uploading…')
      const blob = await dataUrlToBlob(att.data)
      refFiles.push(
        await api().uploadFile(state.token, blob, att.name, att.description)
      )
    }
    refFiles.map(toAttachment).forEach(a => attachments.push(a))
    // Already-uploaded files (e.g. saved videos) — attach as-is, no re-upload.
    state.uploaded.map(toAttachment).forEach(a => attachments.push(a))

    setStatus('busy', 'Creating task…')
    setButtonLoading(el.submitBtn, true, 'Creating task…')
    const description = [
      buildDescription(el.description.value, files, state.screenshots),
      buildReferences(refFiles),
    ]
      .filter(Boolean)
      .join('\n\n')
    const payload = {
      projectId,
      title,
      description,
      priority: state.priority,
      status: 'open',
      taskType: 'bug_fix',
      attachments: JSON.stringify(attachments),
      checklist: state.checklist.length
        ? JSON.stringify(state.checklist)
        : null,
    }
    debugStep('submit:create-payload', {
      screenshotUploads: files.length,
      referenceUploads: refFiles.length,
      savedUploads: state.uploaded.length,
      attachments: attachments.length,
      videoAttachments: attachments.filter(a => a.type?.startsWith('video/'))
        .length,
      descriptionHasVideo: description.includes('<video'),
    })
    const task = await api().createTask(state.token, payload)
    debugStep('submit:create-response', {
      taskId: task?.id,
      returnedAttachments: task?.attachments ? 'present' : 'missing',
    })

    setStatus('ok', 'Task created.')
    showFormToast('ok', 'Task created.')
    resetForm()
  } catch (err) {
    setStatus('err', err?.message || 'Failed to create task.')
  } finally {
    setButtonLoading(el.submitBtn, false, 'Create task')
    setBusy(false)
  }
}

/** Shape an uploaded file object into the task's DocumentAttachment form. */
function toAttachment(f) {
  return {
    id: f.id,
    name: f.name,
    url: f.url,
    type: f.type,
    size: f.size,
    uploadedAt: f.uploadedAt,
    uploadedBy: f.uploadedBy,
    description: f.description,
  }
}

export function resetForm() {
  el.title.value = ''
  el.description.value = ''
  el.project.value = ''
  state.metadata = null
  state.fullPng = null
  state.screenshots = []
  state.attachments = []
  state.uploaded = []
  state.checklist = []
  renderShots()
  renderAttachments()
  renderChecklist()
  recordReset()
  syncPreview()
  clearDraft()
}
