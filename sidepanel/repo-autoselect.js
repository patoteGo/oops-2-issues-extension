/**
 * oops 2 issues — auto-select the repository based on the active tab URL.
 *
 * Loads repo-url-map.json (shipped in the extension package) and, when the
 * active tab's URL matches one of its glob patterns, selects the mapped repo
 * in the dropdown. When nothing matches (or the repo isn't in the list), the
 * dropdown keeps whatever default/previous selection it had — no-op.
 */
import { matchRepo, loadUrlMap } from "../lib/repo-match.js";
import { el, state } from "./session.js";
import { saveDraft } from "./ui.js";

let cachedMap = null;

async function getUrlMap() {
	if (cachedMap) return cachedMap;
	try {
		const url = chrome.runtime.getURL("repo-url-map.json");
		const res = await fetch(url);
		if (!res.ok) return {};
		cachedMap = loadUrlMap(await res.json());
	} catch {
		cachedMap = {};
	}
	return cachedMap;
}

/**
 * Match the given URL against the map and pre-select the repo if present.
 * @param {string} url active tab URL
 * @returns {string|null} repo selected, or null
 */
export async function autoSelectRepo(url) {
	if (!url) return null;
	const map = await getUrlMap();
	const repo = matchRepo(map, url);
	if (!repo) return null;
	// Only pre-select when the option actually exists in the dropdown.
	const has = Array.from(el.repo.options || []).some((o) => o.value === repo);
	if (!has) return null;
	el.repo.value = repo;
	state.repo = repo;
	saveDraft();
	return repo;
}

/** Auto-select for the currently active tab. */
export async function autoSelectForActiveTab() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		return await autoSelectRepo(tab?.url);
	} catch {
		return null;
	}
}
