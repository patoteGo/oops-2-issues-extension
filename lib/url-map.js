/**
 * URL -> repository auto-selection for oops 2 issues.
 *
 * The mapping lives in `url-map.json` at the extension root. Each key is a
 * URL pattern (host, wildcard subdomain, or host + path prefix) and each
 * value is the repository full name ("owner/repo") to auto-select in the
 * dropdown when the active tab URL matches.
 *
 * See url-map.json for documented examples on how to add new mappings.
 */

let cachedMap = null;

/**
 * Load the URL -> repo mapping shipped with the extension.
 * Returns a plain object; on any failure returns {} so callers never break.
 */
export async function loadUrlMap() {
	if (cachedMap) return cachedMap;
	try {
		const url = chrome.runtime.getURL("url-map.json");
		const res = await fetch(url);
		if (!res.ok) return {};
		const data = await res.json();
		cachedMap = normalizeUrlMap(data);
		return cachedMap;
	} catch {
		return {};
	}
}

/** Keep only string -> string entries; ignore comments/metadata. */
export function normalizeUrlMap(data) {
	const out = {};
	if (!data || typeof data !== "object") return out;
	for (const [pattern, repo] of Object.entries(data)) {
		if (typeof pattern === "string" && typeof repo === "string") {
			if (pattern.startsWith("_")) continue; // _comment and friends
			out[pattern] = repo;
		}
	}
	return out;
}

/**
 * Does one URL match one pattern? Case-insensitive.
 * Patterns:
 *   "example.com"          -> host equals example.com (any path)
 *   "*.example.com"        -> any subdomain of example.com (any path)
 *   "example.com/path"     -> host example.com AND path starts with /path
 */
export function urlMatchesPattern(rawUrl, rawPattern) {
	const url = String(rawUrl || "").toLowerCase();
	const pattern = String(rawPattern || "").toLowerCase().trim();
	if (!url || !pattern) return false;

	let host;
	let path = "/";
	try {
		const parsed = new URL(url);
		host = parsed.hostname;
		path = parsed.pathname || "/";
	} catch {
		return false;
	}

	let patternHost = pattern;
	let patternPath = null;
	const slash = pattern.indexOf("/");
	if (slash !== -1) {
		patternHost = pattern.slice(0, slash);
		patternPath = pattern.slice(slash); // includes leading "/"
	}

	if (patternHost.startsWith("*.")) {
		const base = patternHost.slice(2);
		if (host !== base && !host.endsWith(`.${base}`)) return false;
	} else if (host !== patternHost) {
		return false;
	}

	if (patternPath) {
		if (!path.startsWith(patternPath)) {
			// allow the pattern path with or without trailing slash semantics
			if (!(patternPath.endsWith("/") && path === patternPath.slice(0, -1))) {
				return false;
			}
		}
	}
	return true;
}

/**
 * Given the active tab URL, the loaded map, and the available repositories
 * (array with at least `full_name`), return the full name of the repo that
 * should be auto-selected — or null when nothing matches.
 */
export function matchRepoForUrl(url, urlMap, repos) {
	const list = Array.isArray(repos) ? repos : [];
	const fullNames = new Set(
		list
			.map((r) => r?.full_name)
			.filter(Boolean)
			.map((n) => String(n).toLowerCase()),
	);
	for (const [pattern, repo] of Object.entries(urlMap || {})) {
		if (urlMatchesPattern(url, pattern)) {
			if (fullNames.has(String(repo).toLowerCase())) {
				// return the canonical casing from the repo list
				return list.find(
					(r) =>
						String(r.full_name).toLowerCase() ===
						String(repo).toLowerCase(),
				).full_name;
			}
			// pattern matched but repo not in the dropdown — keep looking
		}
	}
	return null;
}
