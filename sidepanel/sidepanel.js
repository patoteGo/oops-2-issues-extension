/**
 * oops 2 issues side panel controller — entry point + cross-cutting wiring.
 *
 * Owns static icon/button wiring, event binding, settings, and init. Feature
 * logic is split into focused modules (auth, capture, editor, …) that share
 * `state`/`el`/helpers from core.js. The dependency graph is acyclic:
 * feature modules import core (+ pure logic); nothing imports this module.
 */
import { api, el, state, fill, svgNode } from "./session.js";
import {
	setStatus,
	setBusy,
	setPriority,
	saveDraft,
	resetCaptureButtons,
	showView,
} from "./ui.js";
import { setRecordReset, setRecordResultGetter } from "./record-bridge.js";
import {
	bootstrapSession,
	handleConnect,
	removeAccount,
	loadRepos,
	switchAccount,
	upsertAccount,
	renderAuthMode,
} from "./auth.js";
import { capture, onRegionSelected } from "./capture.js";
import { createRecordController } from "./record.js";
import { saveRecording } from "./record-save.js";
import { debugStep } from "./debug.js";
import { MD_TOOLS, applyFormat, setEditorTab, syncPreview } from "./editor.js";
import { REFERENCE_ACCEPT, handleFilesAdded } from "./references.js";
import { addChecklistItem } from "./checklist.js";
import { handleSubmit } from "./submit.js";

const PRIORITIES = [
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "critical", label: "Critical" },
	{ value: "high", label: "High" },
];
const CAPTURE_MODES = [
	{ mode: "full", label: "Full Screen", ico: "camera" },
	{ mode: "region", label: "Partial", ico: "crop" },
];

// ----- Static icon + button wiring -------------------------------------
function wireStaticIcons() {
	fill(el.authBadge, "bug");
	fill(el.logoutBtn, "logout");
	fill(el.addAccountBtn, "plus");
	fill(el.settingsToggle, "settings");
	fill(el.refreshRepos, "refresh");
	fill(el.clAddBtn, "plus");
	fill(document.querySelector(".dropzone-ico"), "upload");
	document
		.querySelectorAll(".btn-ico[data-ico]")
		.forEach((n) => fill(n, n.dataset.ico));

	// Markdown toolbar
	for (const t of MD_TOOLS) {
		const b = document.createElement("button");
		b.type = "button";
		b.title = t.title;
		b.setAttribute("aria-label", t.title);
		b.dataset.md = t.id;
		b.replaceChildren(svgNode(t.ico));
		el.mdToolbar.appendChild(b);
	}

	// Priority segmented
	for (const p of PRIORITIES) {
		const b = document.createElement("button");
		b.type = "button";
		b.textContent = p.label;
		b.dataset.value = p.value;
		b.setAttribute("aria-pressed", String(p.value === state.priority));
		b.addEventListener("click", () => setPriority(p.value));
		el.priority.appendChild(b);
	}

	// Capture action buttons — clicking one captures immediately in that
	// mode (Full Screen = grab the visible tab; Partial = inject the drag
	// overlay). No separate "Capture" step.
	for (const m of CAPTURE_MODES) {
		const b = document.createElement("button");
		b.type = "button";
		b.className = "btn btn--ghost capture-btn";
		b.dataset.mode = m.mode;
		b.setAttribute(
			"title",
			m.mode === "region"
				? "Drag to select a region of the page"
				: "Capture the full visible page",
		);
		b.setAttribute("aria-label", m.label);
		const ico = document.createElement("span");
		ico.className = "btn-ico";
		ico.dataset.ico = m.ico;
		ico.replaceChildren(svgNode(m.ico));
		const lbl = document.createElement("span");
		lbl.className = "btn-label";
		lbl.textContent = m.label;
		b.append(ico, lbl);
		b.addEventListener("click", () => capture(m.mode));
		el.captureMode.appendChild(b);
	}

	// Record video — session UI driven by record.js (task 2/4). The controller
	// owns the recorder engine + view; buttons delegate to it. Save (task 3)
	// will wire the upload path; for now it surfaces the finalized blob.
	const record = createRecordController();
	setRecordReset(() => record.reset());
	setRecordResultGetter(() => record.getResult());
	el.recordStartBtn?.addEventListener("click", () => record.start());
	el.recordStopBtn?.addEventListener("click", () => record.stop());
	el.recordCancelBtn?.addEventListener("click", () => record.cancel());
	el.recordReRecordBtn?.addEventListener("click", () => record.reRecord());
	el.recordSaveBtn?.addEventListener("click", async () => {
		const result = record.getResult();
		if (!result) return;
		setBusy(true);
		setStatus("busy", "Uploading recording…");
		try {
			const { markdown: md, file } = await saveRecording({
				blob: result.blob,
				hasAudio: result.hasAudio,
				durationMs: result.durationMs,
				getToken: () => state.token,
				getRepo: () => el.repo.value,
				getAssetsRepo: () => state.assetsRepo || null,
				getLogin: () => state.user?.login || null,
				api,
			});
			state.uploaded.push(file);
			debugStep("ui:recording-saved", {
				uploadedCount: state.uploaded.length,
				savedFileType: file?.type,
				savedFileUrl: Boolean(file?.url),
			});
			saveDraft();
			const cur = el.description.value.trim();
			el.description.value = cur ? `${cur}\n\n${md}` : md;
			el.description.dispatchEvent(new Event("input", { bubbles: true }));
			record.markSaved(result.durationMs, result.hasAudio);
			setStatus("ok", "Recording embedded in the description.");
		} catch (err) {
			setStatus("err", err?.message || "Upload failed.");
		} finally {
			setBusy(false);
		}
	});

	// Reference attachment picker — accept hint mirrors /api/upload; the real
	// validation lives in validateReference() (references.js).
	el.attInput.accept = REFERENCE_ACCEPT;
}

// ----- Settings --------------------------------------------------------
function openSettings() {
	el.settingsToken.value = state.token || "";
	el.settingsAssetsRepo.value = state.assetsRepo || "";
	showView("settings");
}

async function handleSaveSettings(e) {
	e.preventDefault();
	const token = el.settingsToken.value.trim();
	if (!token) {
		setStatus("err", "Paste a GitHub token to connect.");
		return;
	}
	setBusy(true);
	setStatus("busy", "Verifying token…");
	try {
		const user = await api().getUser(token);
		const assetsRepo = (el.settingsAssetsRepo.value || "").trim() || null;
		await upsertAccount(token, user, assetsRepo);
		setStatus("ok", `Connected as @${user.login}.`);
		showView("compose");
		await loadRepos();
	} catch (err) {
		setStatus("err", err?.message || "Invalid token.");
	} finally {
		setBusy(false);
	}
}

// ----- Events ----------------------------------------------------------
function bindEvents() {
	el.authForm.addEventListener("submit", handleConnect);
	el.accountSwitch.addEventListener("change", (e) =>
		switchAccount(e.target.value),
	);
	el.addAccountBtn.addEventListener("click", () => {
		el.tokenInput.value = "";
		showView("auth");
		renderAuthMode();
		setStatus("idle", "Paste another GitHub token to add.");
	});
	el.authCancel.addEventListener("click", () =>
		showView(state.token ? "compose" : "auth"),
	);
	el.logoutBtn.addEventListener("click", removeAccount);
	el.refreshRepos.addEventListener("click", loadRepos);

	el.submitBtn.addEventListener("click", handleSubmit);

	el.clAddBtn.addEventListener("click", addChecklistItem);
	el.clInput.addEventListener("keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			addChecklistItem();
		}
	});

	// Reference attachments: browse + drag & drop.
	el.attInput.addEventListener("change", (e) => {
		if (e.target.files && e.target.files.length)
			handleFilesAdded(e.target.files);
		e.target.value = ""; // allow re-picking the same file
	});
	const dragOn = (e) => {
		e.preventDefault();
		el.dropzone.classList.add("is-drag");
	};
	el.dropzone.addEventListener("dragenter", dragOn);
	el.dropzone.addEventListener("dragover", dragOn);
	el.dropzone.addEventListener("dragleave", (e) => {
		e.preventDefault();
		// Only clear the highlight when the pointer truly leaves the dropzone;
		// crossing into a child (icon/text) also fires dragleave and would flicker.
		if (!el.dropzone.contains(e.relatedTarget))
			el.dropzone.classList.remove("is-drag");
	});
	el.dropzone.addEventListener("drop", (e) => {
		e.preventDefault();
		el.dropzone.classList.remove("is-drag");
		if (e.dataTransfer?.files?.length) handleFilesAdded(e.dataTransfer.files);
	});

	el.mdToolbar.addEventListener("click", (e) => {
		const btn = e.target.closest("button[data-md]");
		if (btn) applyFormat(btn.dataset.md);
	});
	el.tabWrite.addEventListener("click", () => setEditorTab("write"));
	el.tabPreview.addEventListener("click", () => setEditorTab("preview"));
	el.description.addEventListener("input", () => {
		if (state.previewOn) syncPreview();
		saveDraft();
	});

	el.settingsToggle.addEventListener("click", openSettings);
	el.settingsForm.addEventListener("submit", handleSaveSettings);
	el.closeSettings.addEventListener("click", () =>
		showView(state.token ? "compose" : "auth"),
	);

	el.repo.addEventListener("change", saveDraft);
	el.title.addEventListener("input", saveDraft);

	// Messages from background (tab changes) and the region selector.
	chrome.runtime.onMessage.addListener((msg) => {
		if (!msg || typeof msg !== "object") return;
		if (msg.action === "REGION_SELECTED") {
			onRegionSelected(msg.rect, msg.dpr);
		} else if (msg.action === "REGION_CANCELLED") {
			resetCaptureButtons();
			setBusy(false);
			setStatus("idle", "Region capture cancelled.");
		} else if (msg.action === "TAB_CHANGED" || msg.action === "TAB_UPDATED") {
			if (state.screenshots.length && !state.busy) {
				setStatus("idle", "Active tab changed — snap again if needed.");
			}
		}
	});
}

// ----- Init ------------------------------------------------------------
async function init() {
	wireStaticIcons();
	bindEvents();
	await bootstrapSession();
}

init();
