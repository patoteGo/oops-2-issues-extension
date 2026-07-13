/**
 * oops 2 issues — draft restore orchestration.
 *
 * save/load/clear primitives live in core.js; this module restores a saved
 * draft by re-rendering every feature panel (shots, references, checklist…).
 * Split out of the controller so it can call render fns across modules without
 * forcing the main controller to import them all.
 */
import { el, state, setStatus, setPriority, loadDraft } from "./core.js";
import { normalizeShots } from "./logic.js";
import { normalizeAttachments } from "./attachments.js";
import { renderShots } from "./screenshots.js";
import { renderAttachments } from "./references.js";
import { renderChecklist } from "./checklist.js";

export async function restoreDraft() {
	const d = await loadDraft();
	if (!d) return;
	if (d.repo) el.repo.value = d.repo;
	if (d.title) el.title.value = d.title;
	if (d.priority) setPriority(d.priority);
	if (d.description) el.description.value = d.description;
	state.metadata = d.metadata || null;
	// Normalize legacy drafts: old single string, old array of strings, or
	// new array of {data, description} objects -> always {data, description}.
	const raw = Array.isArray(d.screenshots)
		? d.screenshots
		: d.screenshot
			? [d.screenshot]
			: [];
	const restored = normalizeShots(raw);
	if (restored.length) {
		state.screenshots = restored;
		renderShots();
		setStatus("idle", `Restored ${restored.length} capture(s).`);
	}
	if (Array.isArray(d.attachments)) {
		const restoredAtt = normalizeAttachments(d.attachments);
		if (restoredAtt.length) {
			state.attachments = restoredAtt;
			renderAttachments();
		}
	}
	if (Array.isArray(d.uploaded)) {
		state.uploaded = d.uploaded;
	}
	if (Array.isArray(d.checklist)) {
		state.checklist = d.checklist;
		renderChecklist();
	}
}
