/**
 * oops 2 issues — record bridge.
 *
 * Decouples submit.js from record.js. submit.js must flush an unsaved
 * Recording before creating the issue (and reset the controller afterwards),
 * but importing the record controller into the submit path would couple the two
 * and risk a cycle. Instead, sidepanel.js (the controller) registers the record
 * controller's two ops here at init; submit.js reads them through this tiny
 * indirection.
 *
 * Extracted out of core.js so core stops growing a hook every time two feature
 * modules need to talk. Leaf module — imports nothing.
 */

let recordResetFn = () => {};
let recordResultFn = () => null;

/** Producer (sidepanel.js): register the record controller's reset op. */
export function setRecordReset(fn) {
	recordResetFn = typeof fn === "function" ? fn : () => {};
}

/** Producer (sidepanel.js): register the record controller's result getter. */
export function setRecordResultGetter(fn) {
	recordResultFn = typeof fn === "function" ? fn : () => null;
}

/** Consumer (submit.js): the finalized recording preview, or null. */
export function getRecordResult() {
	return recordResultFn();
}

/** Consumer (submit.js): reset the record controller (after issue creation). */
export function recordReset() {
	recordResetFn();
}
