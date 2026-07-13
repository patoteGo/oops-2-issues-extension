const PREFIX = '[BugSnap video debug]'

export function debugStep(step, details = {}) {
  try {
    console.debug(PREFIX, step, details)
  } catch {
    /* debug must never break capture */
  }
}
