/**
 * oops 2 issues — the Issue Body composer.
 *
 * One deep module behind a narrow interface. buildIssueBody(parts) takes the
 * user's markdown plus the structured parts (Screenshots, References,
 * already-uploaded files such as saved Recordings, and the Checklist) and
 * returns the composed markdown body of the GitHub Issue.
 *
 * The body-markdown builders (buildDescription, buildReferences,
 * buildChecklist, buildRecordingMarkdown) are internal seams: exported so this
 * module's own tests can pin each precisely, but not the face callers cross.
 * submit.js — the sole buildIssueBody caller — only sees buildIssueBody;
 * record-save.js calls buildRecordingMarkdown to produce the embed block it
 * splices into the editor buffer.
 *
 * Pure: no DOM, no Chrome, no network. The Issue Body IS the test surface.
 */

/**
 * Compose the Issue Body markdown from its parts. Empty sections are dropped;
 * the rest join with a blank line. References and already-uploaded files
 * (e.g. saved Recordings) merge under a single References heading.
 *
 * @param {object} parts
 * @param {string} [parts.userMd] user-authored markdown (may hold recording links)
 * @param {Array<{url:string, description?:string, source?:object}>} [parts.screenshots]
 *   each Screenshot zipped with its upload URL + page source
 * @param {Array<{url:string, name?:string, type?:string, description?:string}>} [parts.references]
 *   uploaded Reference files
 * @param {Array} [parts.uploaded] previously-uploaded files, kept by URL (e.g. saved videos)
 * @param {Array<{text?:string, completed?:boolean}>} [parts.checklist]
 * @returns {string}
 */
export function buildIssueBody({
	userMd = "",
	screenshots,
	references,
	uploaded,
	checklist,
} = {}) {
	return [
		buildDescription(userMd, screenshots),
		buildReferences([...(references || []), ...(uploaded || [])]),
		buildChecklist(checklist),
	]
		.filter(Boolean)
		.join("\n\n");
}

/**
 * Compose the user-markdown + Screenshots + Context portion of the body.
 *
 * Each Screenshot is a zipped {url, description, source} (source = the page it
 * came from). A side-panel session can span many pages, so the source link is
 * attached per-shot and the Context section dedupes source URLs.
 *
 * @param {string} userMd
 * @param {Array<{url:string, description?:string, source?:object}>} screenshots
 * @returns {string}
 */
export function buildDescription(userMd, screenshots) {
	const imgs = (Array.isArray(screenshots) ? screenshots : []).filter(
		(s) => s?.url,
	);
	const parts = [];
	if (userMd && userMd.trim()) parts.push(userMd.trim());
	if (imgs.length) {
		const blocks = imgs.map((s, i) => {
			const source = s.source || null;
			const caption = (s.description || "").trim();
			const label = caption || `Screenshot ${i + 1}`;
			const imgMd = `![${label}](${s.url})`;

			// Caption line carries the source link so every Screenshot is
			// self-describing, even when a task mixes pages.
			const captionBits = [];
			if (caption) captionBits.push(caption);
			if (source?.url) {
				const linkText = source.title || source.url;
				captionBits.push(`[${linkText}](${source.url})`);
			}
			const captionLine = captionBits.length
				? `*${captionBits.join(" — ")}*`
				: "";
			return captionLine ? `${imgMd}\n${captionLine}` : imgMd;
		});
		const heading = imgs.length > 1 ? "#### Screenshots\n\n" : "";
		parts.push(`${heading}${blocks.join("\n\n")}`);
	}
	// Context — dedupe source URLs (a side-panel session can span many pages).
	const sources = [];
	const seen = new Set();
	for (const s of imgs) {
		const u = s?.source?.url;
		if (u && !seen.has(u)) {
			seen.add(u);
			sources.push({ url: u, title: s.source.title || "" });
		}
	}
	const ctx = [];
	if (sources.length === 1) {
		const s = sources[0];
		ctx.push(`- **Source:** ${s.title ? `[${s.title}](${s.url})` : s.url}`);
	} else if (sources.length > 1) {
		ctx.push(`- **Sources (${sources.length} pages):**`);
		sources.forEach((s, i) => {
			ctx.push(`  ${i + 1}. ${s.title ? `[${s.title}](${s.url})` : s.url}`);
		});
	}
	const last = imgs[imgs.length - 1];
	if (last?.source?.capturedAt) {
		ctx.push(`- **Captured:** ${last.source.capturedAt}`);
	}
	if (ctx.length) parts.push(`#### Context\n\n${ctx.join("\n")}`);
	return parts.join("\n\n");
}

/**
 * Compose the "#### References" markdown section for uploaded files.
 *
 * Images embed inline (`![alt](url)` + optional caption); every other file is
 * a bold link. Inline images group first, then the linked files. Returns ''
 * when there are no files.
 *
 * (Moved here from attachments.js: the Issue Body owns body composition.
 * attachments.js keeps only the Reference validation rules.)
 *
 * @param {Array<{url:string, name?:string, type?:string, description?:string}>} files
 * @returns {string}
 */
export function buildReferences(files) {
	const refs = Array.isArray(files) ? files.filter((f) => f?.url) : [];
	if (!refs.length) return "";
	const images = [];
	const links = [];
	for (const f of refs) {
		const name = f.name || "file";
		const desc = (f.description || "").trim();
		const type = (f.type || "").toLowerCase();
		if (type.startsWith("image/")) {
			const alt = desc || name;
			images.push(
				desc ? `![${alt}](${f.url})\n*${desc}*` : `![${alt}](${f.url})`,
			);
		} else {
			links.push(
				desc
					? `- **[${name}](${f.url})** — *${desc}*`
					: `- **[${name}](${f.url})**`,
			);
		}
	}
	const blocks = [];
	if (images.length) blocks.push(images.join("\n\n"));
	if (links.length) blocks.push(links.join("\n"));
	return blocks.length ? `#### References\n\n${blocks.join("\n\n")}` : "";
}

/**
 * Render the Checklist as a GitHub-native task list (`- [ ]` / `- [x]`), which
 * renders as real checkboxes on GitHub. Returns '' when the list is empty.
 *
 * (Moved here from submit.js so it is tested like the other sections.)
 *
 * @param {Array<{text?:string, completed?:boolean}>} items
 * @returns {string}
 */
export function buildChecklist(items) {
	const list = Array.isArray(items) ? items : [];
	if (!list.length) return "";
	const lines = list.map(
		(it) => `- [${it.completed ? "x" : " "}] ${it.text || ""}`,
	);
	return `#### Checklist\n\n${lines.join("\n")}`;
}

/**
 * Build the markdown embed block for a saved Recording.
 *
 * GitHub's issue-body sanitizer strips inline <video>, so a Recording is
 * embedded as a bold markdown link carrying the clip's duration (and a
 * "(no audio)" marker when the mic was absent). Returns '' when the URL is
 * missing (no upload → no embed).
 *
 * `duration` is a pre-formatted "MM:SS" string — time formatting lives with
 * the caller, so this helper stays focused on the embed format.
 *
 * @param {string} url the uploaded recording's URL
 * @param {{hasAudio?: boolean, duration?: string}} [opts]
 * @returns {string}
 */
export function buildRecordingMarkdown(
	url,
	{ hasAudio = true, duration = "" } = {},
) {
	if (!url) return "";
	const label = hasAudio ? "Screen recording" : "Screen recording (no audio)";
	const tail = duration ? ` (${duration})` : "";
	return `**[${label}](${url})**${tail}`;
}
