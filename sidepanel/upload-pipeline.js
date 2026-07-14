/**
 * oops 2 issues — attachment upload pipeline.
 *
 * Owns the best-effort upload of every attachment in a submit: Screenshots,
 * References, and a pending Recording. Pure over its inputs — takes the
 * part-lists + a bound uploader, returns the uploaded artifacts and a failure
 * count, and reports progress through an onProgress callback so the caller
 * owns the DOM/status UX. A PAT without Contents:write (or one scoped away
 * from the target repo) must NOT block issue creation, so a failed upload is
 * counted and skipped, not thrown.
 */
import { saveRecording } from "./record-save.js";
import { debugStep } from "./debug.js";

function dataUrlToBlob(dataUrl) {
	return fetch(dataUrl).then((r) => r.blob());
}

/**
 * Upload every attachment for one submit.
 *
 * @param {object} args
 * @param {Array}  args.screenshots       [{data, description, source}]
 * @param {Array}  args.attachments       [{data, name, description}]
 * @param {{blob?:Blob, hasAudio?:boolean, durationMs?:number}|null} args.pendingRecording
 * @param {{upload: Function}} args.uploader  bound uploader from api().uploader(ctx)
 * @param {(label: string) => void} [args.onProgress]
 * @returns {Promise<{screenshots: Array, references: Array, uploaded: Array, recordingMarkdown: string|null, failures: number}>}
 */
export async function uploadAttachments({
	screenshots = [],
	attachments = [],
	pendingRecording = null,
	uploader,
	onProgress,
}) {
	let failures = 0;
	// Best-effort: a scoped-down PAT must not abort the whole submit.
	const tryUpload = async (label, fn) => {
		try {
			return await fn();
		} catch (e) {
			failures++;
			debugStep("pipeline:upload-skipped", {
				label,
				error: e?.message || String(e),
			});
			return null;
		}
	};

	const out = {
		screenshots: [],
		references: [],
		uploaded: [],
		recordingMarkdown: null,
	};

	// Screenshots — zip each upload with its capture's source for body composition.
	for (let i = 0; i < screenshots.length; i++) {
		const shot = screenshots[i];
		const data = shot.data ?? shot;
		const desc = shot.description ?? "";
		onProgress?.(`Uploading screenshot ${i + 1}/${screenshots.length}…`);
		const up = await tryUpload(`screenshot ${i + 1}`, async () => {
			const blob = await dataUrlToBlob(data);
			return uploader.upload(blob, { description: desc });
		});
		if (up) {
			out.screenshots.push({
				url: up.url,
				description: desc,
				source: shot.source ?? null,
			});
		}
	}

	// Pending recording — flushed here if the user stopped but didn't Save.
	// One video = one upload; its markdown is returned for the caller to splice.
	if (pendingRecording?.blob) {
		onProgress?.("Uploading recording…");
		const rec = await tryUpload("recording", () =>
			saveRecording({
				blob: pendingRecording.blob,
				hasAudio: pendingRecording.hasAudio,
				durationMs: pendingRecording.durationMs,
				uploader,
			}),
		);
		if (rec?.file) {
			out.uploaded.push(rec.file);
			out.recordingMarkdown = rec.markdown;
		}
	}

	// References — upload each with its caption.
	for (let i = 0; i < attachments.length; i++) {
		const att = attachments[i];
		onProgress?.(`Uploading reference ${i + 1}/${attachments.length}…`);
		const rf = await tryUpload(`reference ${att.name || i + 1}`, async () => {
			const blob = await dataUrlToBlob(att.data);
			return uploader.upload(blob, {
				filename: att.name,
				description: att.description,
			});
		});
		if (rf) out.references.push(rf);
	}

	return { ...out, failures };
}
