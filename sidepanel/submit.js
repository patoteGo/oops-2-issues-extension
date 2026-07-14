/**
 * oops 2 issues — issue submission + form reset.
 *
 * The orchestrator: validates the form, binds the Account's upload context,
 * runs the attachment upload pipeline, splices a just-saved recording into the
 * description, composes the Issue Body, and creates the GitHub issue. The
 * upload mechanics + failure accounting live in upload-pipeline.js (testable
 * on their own); this module stays UI/Chrome-coupled.
 */
import { el, state, api, uploadContext } from "./session.js";
import {
	setStatus,
	setBusy,
	setButtonLoading,
	showFormToast,
	clearDraft,
} from "./ui.js";
import { recordReset } from "./record-bridge.js";
import { buildIssueBody } from "./issue-body.js";
import { debugStep } from "./debug.js";
import { renderShots } from "./screenshots.js";
import { renderAttachments } from "./references.js";
import { renderChecklist } from "./checklist.js";
import { syncPreview } from "./editor.js";
import { uploadAttachments } from "./upload-pipeline.js";

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
	try {
		// One bound uploader for every attachment in this submit — the Account's
		// upload context (token + target repo + assets fallback) lives behind one seam.
		const u = api().uploader(uploadContext(state, el.repo.value));
		const result = await uploadAttachments({
			screenshots: state.screenshots,
			attachments: state.attachments,
			pendingRecording: state.pendingRecording,
			uploader: u,
			onProgress: (label) => {
				setStatus("busy", label);
				setButtonLoading(el.submitBtn, true, label);
			},
		});

		// Sync any just-uploaded file (the recording) into state and splice its
		// markdown into the description (the one DOM write) before composing the
		// Issue Body, so it ships inside it.
		state.uploaded.push(...result.uploaded);
		if (result.recordingMarkdown) {
			const cur = el.description.value.trim();
			el.description.value = cur
				? `${cur}\n\n${result.recordingMarkdown}`
				: result.recordingMarkdown;
			el.description.dispatchEvent(new Event("input", { bubbles: true }));
		}

		setStatus("busy", "Creating issue…");
		setButtonLoading(el.submitBtn, true, "Creating issue…");
		const description = buildIssueBody({
			userMd: el.description.value,
			screenshots: result.screenshots,
			references: result.references,
			uploaded: state.uploaded.slice(),
			checklist: state.checklist,
		});
		debugStep("submit:create-payload", {
			screenshotUploads: result.screenshots.length,
			referenceUploads: result.references.length,
			savedUploads: state.uploaded.length,
			failures: result.failures,
		});
		const issue = await api().createIssue(state.token, owner, repo, {
			title,
			body: description,
		});

		const issueUrl = issue?.html_url || "";
		const num = issue?.number ? ` #${issue.number}` : "";
		setStatus("ok", "Issue created.");
		const note = result.failures
			? ` (${result.failures} attachment${result.failures > 1 ? "s" : ""} skipped — token lacks upload permission)`
			: "";
		showFormToast("ok", `Issue${num} created.${note}`, {
			href: issueUrl,
			label: "Open on GitHub",
			ms: result.failures ? 9000 : undefined,
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
