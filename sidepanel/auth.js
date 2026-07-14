/**
 * oops 2 issues — multi-account auth (connect/switch/remove) + repo picker.
 *
 * Supports several GitHub PATs at once (typically one per organization).
 * Accounts are stored in chrome.storage.local as
 *   accounts: [{id, token, user, assetsRepo}]  +  activeAccountId
 * The active account's token/user/assetsRepo are mirrored onto `state`, so
 * every API call site just reads `state.token`. Switching accounts swaps those
 * three and reloads the repo list.
 *
 * Auth is a GitHub Personal Access Token. On load we verify the active token
 * via GET /user; a server-confirmed 'invalid' drops JUST that account (not the
 * others), a transient 'unknown' (network blip) keeps it.
 */
import { el, state, api } from "./session.js";
import { setStatus, setBusy, setButtonLoading, showView } from "./ui.js";
import { restoreDraft } from "./draft.js";

function makeId() {
	return (
		Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
	);
}

/** Mirror the active account's credentials onto state (what API calls read). */
function applyActiveAccount(acct) {
	const a =
		acct || state.accounts.find((x) => x.id === state.activeAccountId) || null;
	state.token = a?.token || null;
	state.user = a?.user || null;
	state.assetsRepo = a?.assetsRepo || null;
}

/** Persist the account list + active id, and clear legacy single-token keys. */
async function persistAccounts() {
	await chrome.storage.local.set({
		accounts: state.accounts,
		activeAccountId: state.activeAccountId,
	});
	await chrome.storage.local.remove(["token", "user", "assetsRepo"]);
}

/**
 * Verify a token, then add it (or update the existing account with the same
 * login), make it active, persist, and re-render. `assetsRepo` is only applied
 * when explicitly passed (so Connect doesn't wipe an existing account's repo).
 */
export async function upsertAccount(token, user, assetsRepo) {
	let acct = state.accounts.find((a) => a.user?.login === user.login);
	if (acct) {
		acct.token = token;
		acct.user = user;
		if (assetsRepo !== undefined) acct.assetsRepo = assetsRepo;
	} else {
		acct = {
			id: makeId(),
			token,
			user,
			assetsRepo: assetsRepo ?? null,
		};
		state.accounts.push(acct);
	}
	state.activeAccountId = acct.id;
	applyActiveAccount(acct);
	await persistAccounts();
	renderAccounts();
	return acct;
}

export async function bootstrapSession() {
	const stored = await chrome.storage.local.get([
		"accounts",
		"activeAccountId",
		"token", // legacy single-token keys (migrated once, below)
		"user",
		"assetsRepo",
	]);
	let accounts = Array.isArray(stored.accounts) ? stored.accounts : [];
	if (!accounts.length && stored.token) {
		accounts = [
			{
				id: makeId(),
				token: stored.token,
				user: stored.user || null,
				assetsRepo: stored.assetsRepo || null,
			},
		];
	}
	state.accounts = accounts;
	let active =
		accounts.find((a) => a.id === stored.activeAccountId) ||
		accounts[0] ||
		null;
	if (active && (await api().verify(active.token)) === "invalid") {
		// Drop just the rejected account; keep the rest.
		state.accounts = accounts.filter((a) => a.id !== active.id);
		active = state.accounts[0] || null;
	}
	state.activeAccountId = active?.id || null;
	applyActiveAccount(active);
	await persistAccounts();
	renderAccounts();
	if (active) {
		await enterCompose();
	} else {
		showView("auth");
		renderAuthMode();
		setStatus("idle", "Token rejected. Please reconnect.");
	}
}

export function renderAccounts() {
	const active =
		state.accounts.find((a) => a.id === state.activeAccountId) ||
		state.accounts[0] ||
		null;
	const u = active?.user;
	if (u) {
		el.userChip.hidden = false;
		const name = u.name || u.login || "user";
		el.chipName.textContent = name.split(" ")[0]; // first name only = compact
		el.chipAvatar.textContent = (name[0] || "?").toUpperCase();
	} else {
		el.userChip.hidden = true;
	}
	// Switcher options (its visibility is owned by showView).
	el.accountSwitch.replaceChildren();
	for (const a of state.accounts) {
		const o = document.createElement("option");
		o.value = a.id;
		o.textContent = `@${a.user?.login || "account"}`;
		el.accountSwitch.appendChild(o);
	}
	el.accountSwitch.value = active?.id || "";
}

/** Show the auth-view Cancel button only when an account already exists. */
export function renderAuthMode() {
	if (el.authCancel) el.authCancel.hidden = state.accounts.length === 0;
}

export async function handleConnect(e) {
	if (e && e.preventDefault) e.preventDefault();
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
		el.tokenInput.value = "";
		await upsertAccount(token, user);
		setStatus("ok", `Connected as @${user.login}.`);
		await enterCompose();
	} catch (err) {
		setStatus("err", err?.message || "Could not connect. Check the token.");
	} finally {
		setButtonLoading(el.connectBtn, false, "Connect");
		setBusy(false);
		renderAuthMode();
	}
}

/** Switch the active account and reload its repositories. */
export async function switchAccount(id) {
	const acct = state.accounts.find((a) => a.id === id);
	if (!acct || id === state.activeAccountId) return;
	state.activeAccountId = id;
	applyActiveAccount(acct);
	await persistAccounts();
	renderAccounts();
	setStatus("busy", `Switched to @${acct.user?.login}. Loading repositories…`);
	await loadRepos();
	setStatus("ok", `Using @${acct.user?.login}.`);
}

/** Remove the active account; switch to another or fall back to connect. */
export async function removeAccount() {
	state.accounts = state.accounts.filter((a) => a.id !== state.activeAccountId);
	if (state.accounts.length) {
		state.activeAccountId = state.accounts[0].id;
		applyActiveAccount();
		await persistAccounts();
		renderAccounts();
		showView("compose");
		setStatus("idle", "Account removed. Switched to another.");
		await loadRepos();
	} else {
		state.activeAccountId = null;
		applyActiveAccount(null);
		await persistAccounts();
		renderAccounts();
		showView("auth");
		renderAuthMode();
		setStatus("idle", "Disconnected.");
	}
}

async function enterCompose() {
	renderAccounts();
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
