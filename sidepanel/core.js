/**
 * oops 2 issues side panel — shared controller infrastructure.
 *
 * Owns the mutable `state`, the cached DOM (`el`), the GitHub API factory,
 * and the cross-cutting helpers every feature module needs (icons, status,
 * busy toggles, view switching, priority control, draft-storage primitives).
 *
 * This module imports NO feature module — feature modules import it — so the
 * dependency graph stays acyclic.
 */
import { GitHubApi } from "../lib/api.js";
import { icons } from "../lib/icons.js";

export const SESSION_KEY = "oops:draft";
// Reference files larger than this are kept in-memory only (not persisted to
// session storage) to stay within chrome.storage.session's quota.
export const PERSIST_MAX_ATTACHMENT = 4 * 1024 * 1024;

// ----- DOM cache -------------------------------------------------------
export const $ = (id) => document.getElementById(id);
export const el = {
	status: $("status"),
	statusIco: $("statusIco"),
	statusText: $("statusText"),
	userChip: $("userChip"),
	chipAvatar: $("chipAvatar"),
	chipName: $("chipName"),
	logoutBtn: $("logoutBtn"),
	settingsToggle: $("settingsToggle"),
	authView: $("authView"),
	authBadge: $("authBadge"),
	authForm: $("authForm"),
	tokenInput: $("tokenInput"),
	connectBtn: $("connectBtn"),
	composeView: $("composeView"),
	repo: $("repo"),
	refreshRepos: $("refreshRepos"),
	title: $("title"),
	priority: $("priority"),
	mdToolbar: $("mdToolbar"),
	toolbarWrap: $("toolbarWrap"),
	tabWrite: $("tabWrite"),
	tabPreview: $("tabPreview"),
	description: $("description"),
	preview: $("preview"),
	clList: $("clList"),
	clCount: $("clCount"),
	clProgress: $("clProgress"),
	clInput: $("clInput"),
	clAddBtn: $("clAddBtn"),
	captureMode: $("captureMode"),
	// Record video view (task 2/4)
	recordView: $("recordView"),
	recordStartBtn: $("recordStartBtn"),
	recordSavedBadge: $("recordSavedBadge"),
	recordTimer: $("recordTimer"),
	recordStopBtn: $("recordStopBtn"),
	recordCancelBtn: $("recordCancelBtn"),
	recordVideo: $("recordVideo"),
	recordNoAudio: $("recordNoAudio"),
	recordPreviewActions: $("recordPreviewActions"),
	recordReRecordBtn: $("recordReRecordBtn"),
	recordSaveBtn: $("recordSaveBtn"),
	shotList: $("shotList"),
	shotCount: $("shotCount"),
	attList: $("attList"),
	attCount: $("attCount"),
	attInput: $("attInput"),
	dropzone: $("dropzone"),
	submitBtn: $("submitBtn"),
	formToast: $("formToast"),
	settingsView: $("settingsView"),
	settingsForm: $("settingsForm"),
	settingsToken: $("settingsToken"),
	settingsAssetsRepo: $("settingsAssetsRepo"),
	closeSettings: $("closeSettings"),
};

// ----- Shared state ----------------------------------------------------
export const state = {
	token: null, // GitHub PAT
	user: null, // {login, name, avatar_url, html_url}
	repos: [], // GitHub repositories (target picker)
	assetsRepo: null, // optional "owner/name" public repo for the image fallback (B)
	metadata: null, // page metadata from last capture
	fullPng: null, // full PNG dataURL (for region crop)
	screenshots: [], // WebP dataURLs (multiple full/region captures)
	attachments: [], // reference files {data,name,type,size,description}
	uploaded: [], // already-uploaded files (e.g. saved videos) — embedded as-is
	captureMode: "full",
	priority: "medium",
	checklist: [],
	previewOn: false,
	busy: false,
};

export const api = () => new GitHubApi();

// ----- Icon helpers ----------------------------------------------------
// Parse icon SVG strings via Range.createContextualFragment rather than
// DOMParser + importNode: imported SVG nodes can lose their namespace in
// Chrome extension pages and render as empty boxes. `icons` is trusted.
export function svgNode(name) {
	const html = (icons[name] || "").trim();
	if (!html) return null;
	return document.createRange().createContextualFragment(html)
		.firstElementChild;
}
export function fill(elTarget, name) {
	if (elTarget) elTarget.replaceChildren(svgNode(name));
}

// ponytail: tiny record-controller hooks. submit.js needs to save an unsaved
// preview before creating the task without importing the controller.
let recordResetFn = () => {};
let recordResultFn = () => null;
export function setRecordReset(fn) {
	recordResetFn = typeof fn === "function" ? fn : () => {};
}
export function setRecordResultGetter(fn) {
	recordResultFn = typeof fn === "function" ? fn : () => null;
}
export function getRecordResult() {
	return recordResultFn();
}
export function recordReset() {
	recordResetFn();
}

// ----- Status ----------------------------------------------------------
export function setStatus(kind, text, ico) {
	el.status.className = `status status--${kind || "idle"}`;
	el.statusText.textContent = text;
	const ic =
		ico ||
		(kind === "busy"
			? "spinner"
			: kind === "ok"
				? "check"
				: kind === "err"
					? "alert"
					: null);
	el.statusIco.className = "status-ico" + (kind === "busy" ? " spin" : "");
	el.statusIco.replaceChildren(ic ? svgNode(ic) : "");
}

export function setBusy(busy) {
	state.busy = busy;
	el.captureMode.querySelectorAll("button").forEach((b) => {
		b.disabled = busy;
	});
	el.submitBtn.disabled = busy;
	el.loginBtn.disabled = busy;
	el.attInput.disabled = busy;
	el.dropzone.classList.toggle("is-busy", busy);
}

/**
 * Toggle a button's loading state: spinner icon + disabled + optional label.
 * Resting icon read from `.btn-ico[data-ico]` (text buttons) or the button's
 * own `data-ico` (icon-only buttons like refresh).
 */
export function setButtonLoading(btn, loading, label) {
	if (!btn) return;
	btn.classList.toggle("is-loading", !!loading);
	btn.disabled = !!loading;
	const icoHolder = btn.querySelector(".btn-ico") || btn;
	const resting = icoHolder.dataset.ico || btn.dataset.ico;
	const name = loading ? "spinner" : resting;
	if (name) icoHolder.replaceChildren(svgNode(name));
	if (label !== undefined) {
		const lbl = btn.querySelector(".btn-label");
		if (lbl) lbl.textContent = label;
	}
}

/** Clear loading state on every capture button (Full Screen + Partial). */
export function resetCaptureButtons() {
	el.captureMode
		.querySelectorAll("button")
		.forEach((b) => setButtonLoading(b, false));
}

let formToastTimer = null;
/** Inline toast next to the submit button (visible when scrolled down). */
export function showFormToast(kind, text, opts = {}) {
	const t = el.formToast;
	if (!t) return;
	t.className = `form-toast form-toast--${kind || "idle"}`;
	const ico = kind === "ok" ? "check" : kind === "err" ? "alert" : null;
	t.replaceChildren(svgNode(ico) || "", text);
	// Optional clickable link — constrained to https://github.com (the value
	// comes from the API response, so validate before embedding as href).
	const href = opts && typeof opts === "object" ? opts.href : "";
	if (href && /^https:\/\/github\.com\//i.test(href)) {
		const a = document.createElement("a");
		a.className = "form-toast-link";
		a.href = href;
		a.target = "_blank";
		a.rel = "noopener noreferrer";
		a.textContent = opts.label || "Open";
		t.appendChild(a);
	}
	t.hidden = false;
	clearTimeout(formToastTimer);
	if (opts && opts.ms && opts.ms > 0) {
		formToastTimer = setTimeout(() => (t.hidden = true), opts.ms);
	} else if (opts?.href) {
		// Keep the toast up when it carries a link (default 8s).
		formToastTimer = setTimeout(() => (t.hidden = true), 8000);
	} else {
		formToastTimer = setTimeout(() => (t.hidden = true), 3500);
	}
}

// ----- View switching --------------------------------------------------
export function showView(name) {
	const isAuth = name === "auth";
	el.authView.hidden = !isAuth;
	el.composeView.hidden = name !== "compose";
	el.settingsView.hidden = name !== "settings";
	// Before sign-in: show ONLY the login card (no status, no toolbar controls).
	el.status.hidden = isAuth;
	el.settingsToggle.hidden = isAuth;
}

// ----- Priority control ------------------------------------------------
export function setPriority(value) {
	state.priority = value;
	el.priority.querySelectorAll("button").forEach((b) => {
		b.setAttribute("aria-pressed", String(b.dataset.value === value));
	});
	saveDraft();
}

// ----- Draft storage (chrome.storage.session) --------------------------
// Low-level primitives only. Orchestration (restoreDraft) lives in draft.js
// because it must call render fns across feature modules.
export async function saveDraft() {
	const draft = {
		repo: el.repo.value,
		title: el.title.value,
		priority: state.priority,
		description: el.description.value,
		metadata: state.metadata,
		screenshots: state.screenshots,
		// Cap persisted reference size to protect chrome.storage.session quota;
		// larger refs stay in-memory for the current session only.
		attachments: state.attachments.filter(
			(a) => (a.size || 0) <= PERSIST_MAX_ATTACHMENT,
		),
		uploaded: state.uploaded, // tiny metadata; survives reload so uploads aren't orphaned
		checklist: state.checklist,
	};
	try {
		await chrome.storage.session.set({ [SESSION_KEY]: draft });
	} catch {
		/* storage may be transient; ignore */
	}
}

export async function loadDraft() {
	const { [SESSION_KEY]: d } = await chrome.storage.session.get(SESSION_KEY);
	return d;
}

export async function clearDraft() {
	try {
		await chrome.storage.session.remove(SESSION_KEY);
	} catch {
		/* ignore */
	}
}
