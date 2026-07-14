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
