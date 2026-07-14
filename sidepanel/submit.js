/**
 * oops 2 issues — issue submission + form reset.
 *
 * Uploads screenshots then reference files into the target repo's
 * `.oops-assets/` (GitHub Contents API), composes a markdown body, and
 * creates a GitHub issue. Videos/references that don't render inline are
 * still committed and linked.
 */
import { el, state, api } from "./session.js";
import {
	setStatus,
	setBusy,
	setButtonLoading,
	showFormToast,
	clearDraft,
} from "./ui.js";
import { recordReset, getRecordResult } from "./record-bridge.js";
import { buildIssueBody } from "./issue-body.js";
import { debugStep } from "./debug.js";
import { renderShots } from "./screenshots.js";
import { renderAttachments } from "./references.js";
import { renderChecklist } from "./checklist.js";
import { syncPreview } from "./editor.js";
import { saveRecording } from "./record-save.js";

function dataUrlToBlob(dataUrl) {
	return fetch(dataUrl).then((r) => r.blob());
}

/** Split a "owner/name" repo value into [owner, name]. */
function splitRepo(value) {
	const [owner, name] = String(value || "").split("/");
	return [owner, name];
}

export async function handleSubmit() {
	if (state.busy) return;
	const [owner, repo] = splitRepo(el.repo.value);
	const title = el.title.value.trim();
	if (!owner || !repo) {
		setStatus("err", "Choose a repository first.");
		return;
	}
	if (!title) {
		setStatus("err", "Title is required.");
		el.title.focus();
		return;
	}

	setBusy(true);
	setButtonLoading(el.submitBtn, true);
	// Upload options: the optional public assets repo for Strategy B, and the
	// login (to build the default "<login>/oops-assets" repo when A is down).
	const uploadOpts = {
		assetsRepo: state.assetsRepo || null,
		login: state.user?.login || null,
	};
	// Best-effort uploads: a PAT without Contents:write (or one scoped away from
	// the target repo) must NOT block issue creation. Count skips and continue.
	let uploadFailures = 0;
	const tryUpload = async (label, fn) => {
		try {
			return await fn();
		} catch (e) {
			uploadFailures++;
			debugStep("submit:upload-skipped", {
				label,
				error: e?.message || String(e),
			});
			return null;
		}
	};
	try {
		// Upload every screenshot (full or region) WITH its per-image description,
		// zipping each upload with its capture's source for issue-body composition.
		const screenshots = [];
		for (let i = 0; i < state.screenshots.length; i++) {
			const shot = state.screenshots[i];
			const data = shot.data ?? shot;
			const desc = shot.description ?? "";
			setStatus(
				"busy",
				`Uploading screenshot ${i + 1}/${state.screenshots.length}…`,
			);
			setButtonLoading(el.submitBtn, true, "Uploading…");
			const up = await tryUpload(`screenshot ${i + 1}`, async () => {
				const blob = await dataUrlToBlob(data);
				return api().uploadScreenshot(
					state.token,
					owner,
					repo,
					blob,
					desc,
					uploadOpts.assetsRepo,
					uploadOpts.login,
				);
			});
			if (up) {
				screenshots.push({
					url: up.url,
					description: desc,
					source: shot.source ?? null,
				});
			}
		}

		// If the user stopped recording but didn't click Save (or Save failed),
		// save it now before creating the issue. One video = one upload.
		const pendingRecording = getRecordResult();
		if (pendingRecording?.blob) {
			setStatus("busy", "Uploading recording…");
			setButtonLoading(el.submitBtn, true, "Uploading recording…");
			const rec = await tryUpload("recording", () =>
				saveRecording({
					blob: pendingRecording.blob,
					hasAudio: pendingRecording.hasAudio,
					durationMs: pendingRecording.durationMs,
					getToken: () => state.token,
					getRepo: () => el.repo.value,
					getAssetsRepo: () => uploadOpts.assetsRepo,
					getLogin: () => uploadOpts.login,
					api,
				}),
			);
			if (rec?.file) {
				state.uploaded.push(rec.file);
				const cur = el.description.value.trim();
				el.description.value = cur ? `${cur}\n\n${rec.markdown}` : rec.markdown;
				el.description.dispatchEvent(new Event("input", { bubbles: true }));
			}
		}

		// Reference files (drag & drop / browse) — upload each with its caption.
		const refFiles = [];
		for (let i = 0; i < state.attachments.length; i++) {
			const att = state.attachments[i];
			setStatus(
				"busy",
				`Uploading reference ${i + 1}/${state.attachments.length}…`,
			);
			setButtonLoading(el.submitBtn, true, "Uploading…");
			const rf = await tryUpload(`reference ${att.name || i + 1}`, async () => {
				const blob = await dataUrlToBlob(att.data);
				return api().uploadFile(
					state.token,
					owner,
					repo,
					blob,
					att.name,
					att.description,
					uploadOpts.assetsRepo,
					uploadOpts.login,
				);
			});
			if (rf) refFiles.push(rf);
		}
		// Already-uploaded files (e.g. saved videos) — keep their URL, no re-upload.
		const uploadedFiles = state.uploaded.slice();

		setStatus("busy", "Creating issue…");
		setButtonLoading(el.submitBtn, true, "Creating issue…");
		const description = buildIssueBody({
			userMd: el.description.value,
			screenshots,
			references: refFiles,
			uploaded: uploadedFiles,
			checklist: state.checklist,
		});
		debugStep("submit:create-payload", {
			screenshotUploads: screenshots.length,
			referenceUploads: refFiles.length,
			savedUploads: uploadedFiles.length,
		});
		const issue = await api().createIssue(state.token, owner, repo, {
			title,
			body: description,
		});

		const issueUrl = issue?.html_url || "";
		const num = issue?.number ? ` #${issue.number}` : "";
		setStatus("ok", "Issue created.");
		const note = uploadFailures
			? ` (${uploadFailures} attachment${uploadFailures > 1 ? "s" : ""} skipped — token lacks upload permission)`
			: "";
		showFormToast("ok", `Issue${num} created.${note}`, {
			href: issueUrl,
			label: "Open on GitHub",
			ms: uploadFailures ? 9000 : undefined,
		});
		resetForm();
	} catch (err) {
		const msg = err?.message || "Failed to create issue.";
		setStatus("err", msg);
		// Inline toast beside the submit button: the top status banner scrolls
		// out of view on a long form, so surface the error where the user is.
		showFormToast("err", msg, { ms: 8000 });
	} finally {
		setButtonLoading(el.submitBtn, false, "Create issue");
		setBusy(false);
	}
}

export function resetForm() {
	el.title.value = "";
	el.description.value = "";
	el.repo.value = "";
	state.metadata = null;
	state.fullPng = null;
	state.screenshots = [];
	state.attachments = [];
	state.uploaded = [];
	state.checklist = [];
	renderShots();
	renderAttachments();
	renderChecklist();
	recordReset();
	syncPreview();
	clearDraft();
}
