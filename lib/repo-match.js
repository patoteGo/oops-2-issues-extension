/**
 * oops 2 issues — repository auto-selection by page URL.
 *
 * repo-url-map.json (repo root) maps a full repository name ("owner/repo")
 * to an array of URL glob patterns. The side panel loads the map, matches the
 * active tab's URL against the patterns, and pre-selects the matching repo
 * in the dropdown.
 *
 * Pattern syntax: shell-style globs matched against the whole URL string.
 *   "https://github.com/patoteGo/oops-2-issues*"   any page of that repo
 *   "https://app.acme.dev/*"                        any page of the app
 *   "*"                                             fallback / always match
 *
 * Pure helpers only — no DOM/chrome deps — so this is safe to unit-test.
 */

/** Convert a glob pattern (only `*` is special) into a RegExp. */
function globToRegExp(pattern) {
	const escaped = pattern
		.replace(/[.+?^${}()|[\]\\]/g, "\\$&")
		.replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`, "i");
}

/**
 * Return the first repository name whose pattern matches `url`, or null.
 * Entries are evaluated in file order; first match wins.
 * @param {Record<string, string[]>|null|undefined} map
 * @param {string} url
 * @returns {string|null}
 */
export function matchRepo(map, url) {
	if (!map || typeof map !== "object" || !url) return null;
	for (const [repo, patterns] of Object.entries(map)) {
		if (!Array.isArray(patterns)) continue;
		for (const pattern of patterns) {
			if (typeof pattern !== "string") continue;
			try {
				if (globToRegExp(pattern).test(url)) return repo;
			} catch {
				/* malformed pattern — skip */
			}
		}
	}
	return null;
}

/**
 * Validate/normalize a loaded URL map. Returns an object keyed by
 * "owner/repo" with arrays of pattern strings; invalid entries are dropped.
 * @param {unknown} raw parsed JSON of repo-url-map.json
 * @returns {Record<string, string[]>}
 */
export function loadUrlMap(raw) {
	if (!raw || typeof raw !== "object") return {};
	const out = {};
	for (const [repo, patterns] of Object.entries(raw)) {
		if (Array.isArray(patterns)) {
			const ok = patterns.filter((p) => typeof p === "string");
			if (ok.length) out[repo] = ok;
		}
	}
	return out;
}
