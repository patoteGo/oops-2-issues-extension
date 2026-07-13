/**
 * oops 2 issues — issue submission + form reset.
 *
 * Uploads screenshots then reference files into the target repo's
 * `.oops-assets/` (GitHub Contents API), composes a markdown body, and
 * creates a GitHub issue. Videos/references that don't render inline are
 * still committed and linked.
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
} from "./core.js";
import { buildDescription } from "./logic.js";
import { buildReferences } from "./attachments.js";
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
	try {
		// Upload every screenshot (full or region) WITH its per-image description.
		const files = [];
		for (let i = 0; i < state.screenshots.length; i++) {
			const shot = state.screenshots[i];
			const data = shot.data ?? shot;
			const desc = shot.description ?? "";
			setStatus(
				"busy",
				`Uploading screenshot ${i + 1}/${state.screenshots.length}…`,
			);
			setButtonLoading(el.submitBtn, true, "Uploading…");
			const blob = await dataUrlToBlob(data);
			files.push(
				await api().uploadScreenshot(
					state.token,
					owner,
					repo,
					blob,
					desc,
					uploadOpts.assetsRepo,
					uploadOpts.login,
				),
			);
		}

		// If the user stopped recording but didn't click Save (or Save failed),
		// save it now before creating the issue. One video = one upload.
		const pendingRecording = getRecordResult();
		if (pendingRecording?.blob) {
			setStatus("busy", "Uploading recording…");
			setButtonLoading(el.submitBtn, true, "Uploading recording…");
			const { markdown, file } = await saveRecording({
				blob: pendingRecording.blob,
				hasAudio: pendingRecording.hasAudio,
				durationMs: pendingRecording.durationMs,
				getToken: () => state.token,
				getRepo: () => el.repo.value,
				getAssetsRepo: () => uploadOpts.assetsRepo,
				getLogin: () => uploadOpts.login,
				api,
			});
			state.uploaded.push(file);
			const cur = el.description.value.trim();
			el.description.value = cur ? `${cur}\n\n${markdown}` : markdown;
			el.description.dispatchEvent(new Event("input", { bubbles: true }));
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
			const blob = await dataUrlToBlob(att.data);
			refFiles.push(
				await api().uploadFile(
					state.token,
					owner,
					repo,
					blob,
					att.name,
					att.description,
					uploadOpts.assetsRepo,
					uploadOpts.login,
				),
			);
		}
		// Already-uploaded files (e.g. saved videos) — keep their URL, no re-upload.
		const uploadedFiles = state.uploaded.slice();

		setStatus("busy", "Creating issue…");
		setButtonLoading(el.submitBtn, true, "Creating issue…");
		const description = [
			buildDescription(el.description.value, files, state.screenshots),
			buildReferences(refFiles),
			buildReferences(uploadedFiles)
				? `#### References\n\n${buildReferences(uploadedFiles).replace("#### References\n\n", "")}`
				: "",
			buildChecklist(state.checklist),
		]
			.filter(Boolean)
			.join("\n\n");
		debugStep("submit:create-payload", {
			screenshotUploads: files.length,
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
		showFormToast("ok", `Issue${num} created.`, {
			href: issueUrl,
			label: "Open on GitHub",
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

/**
 * Render the checklist as a GitHub-native markdown task list
 * (`- [ ]` / `- [x]`), which renders as real checkboxes on GitHub. Returns
 * '' when the list is empty.
 */
function buildChecklist(items) {
	const list = Array.isArray(items) ? items : [];
	if (!list.length) return "";
	const lines = list.map(
		(it) => `- [${it.completed ? "x" : " "}] ${it.text || ""}`,
	);
	return `#### Checklist\n\n${lines.join("\n")}`;
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
