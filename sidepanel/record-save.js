/**
 * record-save — the BugSnap Save path (task 3/4).
 *
 * Uploads the finalized webm Blob via EpApi.uploadFile and returns both the
 * markdown block to embed in the task description (the caller appends it to
 * the editor buffer) AND the uploaded file object (so the caller can attach
 * it to the task's structured attachments — otherwise the video never reaches
 * the native Attachments panel). Re-records never reach here — no Blob is
 * created until Save is pressed (the recorder engine + session UI guarantee
 * this).
 *
 * Thin glue over EpApi + logic.buildVideoMarkdown. The upload + embed contract
 * is locked in record-save.test.js.
 */
import { EpApi } from '../lib/api.js'
import { debugStep } from './debug.js'
import { buildVideoMarkdown } from './logic.js'

function fmtDuration(ms) {
  const total = Math.floor((ms ?? 0) / 1000)
  const m = String(Math.floor(total / 60)).padStart(2, '0')
  const s = String(total % 60).padStart(2, '0')
  return `${m}:${s}`
}

/**
 * Upload the recording and return the markdown embed block.
 *
 * @param {{blob: Blob, hasAudio: boolean, durationMs: number, getToken: () => string|null, api?: object}} args
 * @returns {Promise<{markdown: string, file: object}>} the `<video controls src="url"></video>` markdown + the uploaded file
 * @throws when there is no token or the upload fails (nothing is embedded)
 */
export async function saveRecording({
  blob,
  hasAudio,
  durationMs,
  getToken,
  api,
}) {
  const token = getToken()
  if (!token) {
    throw new Error('Not signed in — auth token missing.')
  }
  const client = typeof api === 'function' ? api() : (api ?? new EpApi())
  const duration = fmtDuration(durationMs)
  debugStep('save:start', {
    blobSize: blob?.size,
    blobType: blob?.type,
    durationMs,
    hasAudio,
    hasToken: Boolean(token),
  })
  const description = hasAudio
    ? `BugSnap recording (${duration})`
    : `BugSnap recording (${duration}, no audio)`
  const file = await client.uploadFile(
    token,
    blob,
    `bugsnap-${Date.now()}.webm`,
    description
  )
  debugStep('save:upload-response', {
    hasUrl: Boolean(file?.url),
    name: file?.name,
    type: file?.type,
    size: file?.size,
    category: file?.category,
  })
  if (!file?.url) {
    throw new Error('Upload succeeded but no file URL was returned.')
  }
  return { markdown: buildVideoMarkdown(file.url), file }
}
