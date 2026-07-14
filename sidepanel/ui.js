/**
 * oops 2 issues side panel — UI behavior over the shared session.
 *
 * Status/toast feedback, busy + button-loading toggles, view switching,
 * priority control, and draft-storage primitives. Each mutates the shared
 * `state`/`el` from session.js. Feature modules import these as needed.
 */
import {
	state,
	el,
	svgNode,
	SESSION_KEY,
	PERSIST_MAX_ATTACHMENT,
} from "./session.js";

// ----- Status ----------------------------------------------------------
export function setStatus(kind, text, ico) {
	// Always reveal on call: the auth view hides #status by default, so
	// without this every auth error/busy/ok message is written to an
	// invisible element (the cause of "fails silently" during connect).
	el.status.hidden = false;
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
	// With accounts saved, the switcher / add / remove controls appear on
	// compose & settings; the auth (connect) screen stays focused.
	el.status.hidden = isAuth;
	el.settingsToggle.hidden = isAuth;
	el.accountSwitch.hidden = isAuth || state.accounts.length <= 1;
	el.addAccountBtn.hidden = isAuth || state.accounts.length === 0;
	el.logoutBtn.hidden = isAuth || state.accounts.length === 0;
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
