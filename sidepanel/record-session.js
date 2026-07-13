/**
 * record-session — the oops 2 issues recording session state machine (task 2/4).
 *
 * Pure reducer over the recording session. Phases:
 *   idle      → nothing captured yet
 *   recording → capture in progress, elapsedMs ticks live
 *   preview   → stopped, blob in hand, awaiting Save or Re-record
 *
 * Transitions:
 *   startRecording: idle → recording
 *   tick:           recording → recording (+elapsedMs), marks capReached at 60s
 *   stopRecording:  recording → preview (carries blob/hasAudio/durationMs)
 *   reRecord:       preview → recording (discards the blob)
 *   cancel:         any → idle (drops everything, clears errors)
 *
 * The DOM controller drives this against the ScreenRecorder engine + renders
 * the derived view state. Pure so the rules + view derivation are testable.
 */

/** PRD: hard 60s cap to protect Vercel Blob quota. */
const CAP_MS = 60_000

/** Build the initial idle session. */
export function createSession() {
  return {
    phase: 'idle',
    elapsedMs: 0,
    blob: null,
    hasAudio: false,
    durationMs: 0,
    capReached: false,
    error: null,
  }
}

/** idle → recording. Refuses when already recording. */
export function startRecording(s) {
  if (s.phase === 'recording') {
    return { ...s, error: 'Already recording' }
  }
  return { ...createSession(), phase: 'recording' }
}

/** Advance the live timer. Marks capReached at the 60s cap (caller stops). */
export function tick(s, deltaMs) {
  if (s.phase !== 'recording') return s
  const elapsedMs = s.elapsedMs + deltaMs
  return { ...s, elapsedMs, capReached: elapsedMs >= CAP_MS }
}

/** recording → preview, carrying the captured webm. */
export function stopRecording(s, { blob, hasAudio, durationMs }) {
  if (s.phase !== 'recording') return s
  return {
    ...s,
    phase: 'preview',
    blob,
    hasAudio,
    durationMs: durationMs ?? s.elapsedMs,
    capReached: false,
  }
}

/** preview → recording, discarding the blob. Refuses outside preview. */
export function reRecord(s) {
  if (s.phase !== 'preview') {
    return { ...s, error: 'Can only re-record from preview' }
  }
  return { ...createSession(), phase: 'recording' }
}

/** any → idle, dropping the blob and clearing errors. */
export function cancel(s) {
  return createSession()
}
