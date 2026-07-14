/**
 * oops 2 issues side panel — shared session data + DOM cache.
 *
 * The data backbone every feature module reads: the mutable `state`, the
 * cached DOM (`el`), the GitHub API factory, and the inline-SVG icon helpers.
 * Pure data/infra — no behavior (that lives in ui.js). Nothing here imports a
 * feature module, so the dependency graph stays acyclic.
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
	accountSwitch: $("accountSwitch"),
	addAccountBtn: $("addAccountBtn"),
	logoutBtn: $("logoutBtn"),
	settingsToggle: $("settingsToggle"),
	authView: $("authView"),
	authBadge: $("authBadge"),
	authForm: $("authForm"),
	tokenInput: $("tokenInput"),
	authCancel: $("authCancel"),
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
	// Record video view
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
	token: null, // GitHub PAT (active account)
	user: null, // {login, name, avatar_url, html_url} (active account)
	repos: [], // GitHub repositories (target picker)
	assetsRepo: null, // optional "owner/name" public repo for the image fallback (B)
	accounts: [], // [{id, token, user, assetsRepo}] — every saved PAT
	activeAccountId: null, // which account is currently in use
	metadata: null, // page metadata from last capture
	fullPng: null, // full PNG dataURL (for region crop)
	screenshots: [], // WebP dataURLs (multiple full/region captures)
	attachments: [], // reference files {data,name,type,size,description}
	uploaded: [], // already-uploaded files (e.g. saved videos) — embedded as-is
	pendingRecording: null, // a Recording stopped but not yet Saved — {blob, hasAudio, durationMs}
	captureMode: "full",
	priority: "medium",
	checklist: [],
	previewOn: false,
	busy: false,
};

export const api = () => new GitHubApi();

/**
 * Derive the bound upload context for api().uploader(ctx) from the active
 * Account + the selected repo. Owns the ambient "not connected" /
 * "no repository" guards so every upload path (submit, Save-button) validates
 * in one place. Pure — takes the state + the "owner/name" string, returns a
 * ctx object or throws.
 */
export function uploadContext(state, repoValue) {
	const [owner, repo] = String(repoValue || "").split("/");
	if (!state.token) {
		throw new Error("Not connected — GitHub token missing.");
	}
	if (!owner || !repo) {
		throw new Error("No target repository selected.");
	}
	return {
		token: state.token,
		owner,
		repo,
		assetsRepo: state.assetsRepo || null,
		login: state.user?.login || null,
	};
}

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
