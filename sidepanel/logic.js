/**
 * oops 2 issues — pure helpers (capture source + draft normalization).
 *
 * buildSource: the per-screenshot "source" record from page metadata.
 * normalizeShots: normalize a restored screenshot list into a uniform shape.
 *
 * Issue-body composition (incl. the recording embed) lives in issue-body.js;
 * Reference validation rules live in references.js. No DOM/Chrome deps — safe
 * to unit-test directly.
 */

/**
 * Build the per-screenshot "source" record from page metadata.
 * Returns null when there is nothing usable (no url/title/capturedAt).
 * @param {object|null|undefined} meta page metadata from extractMetadata()
 * @returns {{url?:string, title?:string, capturedAt?:string}|null}
 */
export function buildSource(meta) {
	if (!meta) return null;
	const source = {};
	if (meta.url) source.url = meta.url;
	if (meta.title) source.title = meta.title;
	if (meta.capturedAt) source.capturedAt = meta.capturedAt;
	return Object.keys(source).length ? source : null;
}

/**
 * Normalize a restored screenshot list into a uniform shape.
 *
 * Handles three legacy draft shapes:
 *   - string                       -> { data, description:"", source:null }
 *   - {data, description, source}  -> passthrough with defaults
 *   - {data, ...}                  -> missing fields defaulted
 *
 * @param {Array} raw
 * @returns {Array<{data:string, description:string, source:object|null}>}
 */
export function normalizeShots(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((s) =>
		typeof s === "string"
			? { data: s, description: "", source: null }
			: {
					data: s.data,
					description: s.description ?? "",
					source: s.source ?? null,
				},
	);
}

/**
 * Fuzzy (subsequence) match score of `query` against `text`.
 *
 * Case-insensitive. Every query character must appear in order in the text
 * (fzf-style subsequence). Scoring rewards:
 *   - consecutive runs ("fr" in "frontend" beats "fdr-tools")
 *   - matches at the start of the string or right after a separator
 * Returns -1 when the query is not a subsequence of the text.
 *
 * @param {string} query
 * @param {string} text
 * @returns {number} score (higher is better) or -1 for no match
 */
export function fuzzyScore(query, text) {
	const q = String(query || "").toLowerCase();
	const t = String(text || "").toLowerCase();
	if (!q) return 0;
	let score = 0;
	let ti = 0;
	let prevMatch = -2;
	for (let qi = 0; qi < q.length; qi++) {
		const idx = t.indexOf(q[qi], ti);
		if (idx === -1) return -1;
		// Consecutive characters compound; scattered ones cost a bit.
		score += idx === prevMatch + 1 ? 5 : -1;
		// Boundary bonus: string start or right after a separator.
		if (idx === 0 || "/-_. ".includes(t[idx - 1])) score += 4;
		prevMatch = idx;
		ti = idx + 1;
	}
	// Prefer matches earlier in the haystack.
	score -= Math.min(prevMatch, 10) * 0.1;
	return score;
}

/**
 * Filter + rank repositories for the picker.
 *
 * @param {Array<{full_name:string, owner:string, name:string}>} repos
 * @param {string} query fuzzy query matched against full_name / name / owner
 * @param {string} owner exact owner filter ("" = all owners)
 * @returns {Array} matching repos, best fuzzy match first
 */
export function filterRepos(repos, query, owner) {
	if (!Array.isArray(repos)) return [];
	let out = repos;
	if (owner) out = out.filter((r) => r?.owner === owner);
	const q = String(query || "").trim();
	if (q) {
		const scored = [];
		for (const r of out) {
			if (!r) continue;
			const s = Math.max(
				fuzzyScore(q, r.full_name || ""),
				fuzzyScore(q, r.name || ""),
				fuzzyScore(q, r.owner || ""),
			);
			if (s >= 0) scored.push([s, r]);
		}
		// Higher score first; ties keep the original order.
		scored.sort((a, b) => b[0] - a[0]);
		out = scored.map(([, r]) => r);
	}
	return out;
}
