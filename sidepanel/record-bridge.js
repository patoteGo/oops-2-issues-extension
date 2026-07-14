/**
 * oops 2 issues — record reset seam.
 *
 * The pending Recording itself now flows through state.pendingRecording (set by
 * record.js on stop, read by the upload pipeline + the Save path) — the same
 * backbone as Screenshots/References/uploaded. What stays here is the one
 * control op that can't live in state: resetting the record controller's
 * internal phase machine + "saved" badge after an issue is created. The
 * controller instance is owned by sidepanel.js; submit.js's resetForm reaches
 * its reset() through this registration rather than holding the instance.
 *
 * Leaf module — imports nothing.
 */

let recordResetFn = () => {};

/** Producer (sidepanel.js): register the record controller's reset op. */
export function setRecordReset(fn) {
	recordResetFn = typeof fn === "function" ? fn : () => {};
}

/** Consumer (submit.js): reset the record controller (after issue creation). */
export function recordReset() {
	recordResetFn();
}
