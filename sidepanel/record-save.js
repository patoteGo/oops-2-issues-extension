/**
 * record-save — the oops 2 issues Save path.
 *
 * Uploads the finalized webm Blob through a bound uploader (Strategy A → B
 * fallback) and returns the markdown block to embed in the issue body (the
 * caller appends it to the editor buffer) AND the uploaded file object.
 * Re-records never reach here — no Blob is created until Save is pressed.
 *
 * GitHub's issue-body sanitizer strips inline `<video>` tags, so the recording
 * is embedded as a bold markdown link (the file is still committed to the
 * repo and downloadable from the issue).
 */
import { buildRecordingMarkdown } from "./issue-body.js";
import { debugStep } from "./debug.js";

function fmtDuration(ms) {
	const total = Math.floor((ms ?? 0) / 1000);
	const m = String(Math.floor(total / 60)).padStart(2, "0");
	const s = String(total % 60).padStart(2, "0");
	return `${m}:${s}`;
}

/**
 * Upload the recording and return the markdown embed block.
 *
 * @param {{blob: Blob, hasAudio: boolean, durationMs: number, uploader: {upload: Function}}} args
 * @returns {Promise<{markdown: string, file: object}>}
 * @throws when the upload fails (nothing is embedded)
 */
export async function saveRecording({ blob, hasAudio, durationMs, uploader }) {
	const duration = fmtDuration(durationMs);
	debugStep("save:start", {
		blobSize: blob?.size,
		blobType: blob?.type,
		durationMs,
		hasAudio,
	});
	const description = hasAudio
		? `oops 2 issues recording (${duration})`
		: `oops 2 issues recording (${duration}, no audio)`;
	const file = await uploader.upload(blob, {
		filename: `oops-${Date.now()}.webm`,
		description,
	});
	debugStep("save:upload-response", {
		hasUrl: Boolean(file?.url),
		name: file?.name,
		type: file?.type,
		size: file?.size,
	});
	if (!file?.url) {
		throw new Error("Upload succeeded but no file URL was returned.");
	}
	// Embed as a bold link — GitHub strips inline <video> — so the clip is
	// reachable from the issue. Format owned by buildRecordingMarkdown.
	return {
		markdown: buildRecordingMarkdown(file.url, { hasAudio, duration }),
		file,
	};
}
