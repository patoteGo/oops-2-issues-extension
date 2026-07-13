/**
 * oops 2 issues — auth (connect/disconnect, session bootstrap) + repo picker.
 *
 * Auth is a GitHub Personal Access Token stored by the caller
 * (chrome.storage.local). On load we verify it via GET /user; a
 * server-confirmed 'invalid' clears the session, a transient 'unknown'
 * (network blip) keeps it.
 */
import {
	el,
	state,
	api,
	setStatus,
	setBusy,
	setButtonLoading,
	showView,
} from "./core.js";
import { restoreDraft } from "./draft.js";

export async function bootstrapSession() {
	const stored = await chrome.storage.local.get([
		"token",
		"user",
		"assetsRepo",
	]);
	state.token = stored.token || null;
	state.user = stored.user || null;
	state.assetsRepo = stored.assetsRepo || null;

	if (state.token) {
		const result = await api().verify(state.token);
		if (result === "invalid") {
			// GitHub rejected the token — clear and ask to connect again.
			await clearSession();
			showView("auth");
			setStatus("idle", "Token rejected. Please reconnect.");
			return;
		}
		// 'valid' OR 'unknown' (transient network error): keep the session.
		await enterCompose();
	} else {
		showView("auth");
	}
}

async function clearSession() {
	state.token = null;
	state.user = null;
	state.repos = [];
	state.assetsRepo = null;
	await chrome.storage.local.remove(["token", "user", "assetsRepo"]);
}

export function renderUserChip() {
	const u = state.user;
	if (!u) {
		el.userChip.hidden = true;
		el.logoutBtn.hidden = true;
		return;
	}
	el.userChip.hidden = false;
	el.logoutBtn.hidden = false;
	const name = u.name || u.login || "user";
	el.chipName.textContent = name.split(" ")[0]; // first name only = compact
	el.chipAvatar.textContent = (name[0] || "?").toUpperCase();
}

export async function handleConnect(e) {
	e.preventDefault();
	setBusy(true);
	setButtonLoading(el.connectBtn, true, "Connecting…");
	setStatus("busy", "Verifying token…");
	try {
		const token = el.tokenInput.value.trim();
		if (!token) {
			setStatus("err", "Paste a GitHub token first.");
			return;
		}
		const user = await api().getUser(token);
		state.token = token;
		state.user = user;
		await chrome.storage.local.set({
			token,
			user,
			assetsRepo: state.assetsRepo,
		});
		el.tokenInput.value = "";
		renderUserChip();
		setStatus("ok", `Connected as @${user.login}.`);
		await enterCompose();
	} catch (err) {
		setStatus("err", err?.message || "Could not connect. Check the token.");
	} finally {
		setButtonLoading(el.connectBtn, false, "Connect");
		setBusy(false);
	}
}

export async function handleDisconnect() {
	await clearSession();
	renderUserChip();
	showView("auth");
	setStatus("idle", "Disconnected.");
}

async function enterCompose() {
	renderUserChip();
	showView("compose");
	await loadRepos();
	await restoreDraft();
}

// ----- Repos -----------------------------------------------------------
export async function loadRepos() {
	setButtonLoading(el.refreshRepos, true);
	el.repo.replaceChildren(
		Object.assign(document.createElement("option"), {
			textContent: "Loading…",
			value: "",
		}),
	);
	try {
		state.repos = await api().getRepos(state.token);
		renderRepoSelect();
	} catch (err) {
		el.repo.replaceChildren(
			Object.assign(document.createElement("option"), {
				textContent: "Failed to load",
				value: "",
			}),
		);
		setStatus("err", err?.message || "Could not load repositories.");
	} finally {
		setButtonLoading(el.refreshRepos, false);
	}
}

function renderRepoSelect() {
	el.repo.replaceChildren();
	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = state.repos.length
		? "Select a repository…"
		: "No repositories found";
	el.repo.appendChild(placeholder);
	for (const r of state.repos) {
		const o = document.createElement("option");
		o.value = r.full_name; // "owner/name"
		o.textContent = `${r.full_name}${r.private ? " 🔒" : ""}`;
		el.repo.appendChild(o);
	}
}
