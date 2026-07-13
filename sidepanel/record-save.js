/**
 * record-save — the oops 2 issues Save path.
 *
 * Uploads the finalized webm Blob via GitHubApi.uploadFile into the target
 * repo's `.oops-assets/` and returns the markdown block to embed in the issue
 * body (the caller appends it to the editor buffer) AND the uploaded file
 * object. Re-records never reach here — no Blob is created until Save is
 * pressed.
 *
 * GitHub's issue-body sanitizer strips inline `<video>` tags, so the recording
 * is embedded as a bold markdown link (the file is still committed to the
 * repo and downloadable from the issue).
 */
import { GitHubApi } from "../lib/api.js";
import { debugStep } from "./debug.js";

function fmtDuration(ms) {
	const total = Math.floor((ms ?? 0) / 1000);
	const m = String(Math.floor(total / 60)).padStart(2, "0");
	const s = String(total % 60).padStart(2, "0");
	return `${m}:${s}`;
}

/** Split a "owner/name" repo value into [owner, name]. */
function splitRepo(value) {
	const [owner, name] = String(value || "").split("/");
	return [owner, name];
}

/**
 * Upload the recording and return the markdown embed block.
 *
 * @param {{blob: Blob, hasAudio: boolean, durationMs: number, getToken: () => string|null, getRepo?: () => string, api?: object|(() => object)}} args
 * @returns {Promise<{markdown: string, file: object}>}
 * @throws when there is no token/repo or the upload fails (nothing is embedded)
 */
export async function saveRecording({
	blob,
	hasAudio,
	durationMs,
	getToken,
	getRepo,
	getAssetsRepo,
	getLogin,
	api,
}) {
	const token = getToken();
	if (!token) {
		throw new Error("Not connected — GitHub token missing.");
	}
	const [owner, repo] = splitRepo(getRepo ? getRepo() : "");
	if (!owner || !repo) {
		throw new Error("No target repository selected.");
	}
	const assetsRepo = getAssetsRepo ? getAssetsRepo() : null;
	const login = getLogin ? getLogin() : null;
	const client = typeof api === "function" ? api() : (api ?? new GitHubApi());
	const duration = fmtDuration(durationMs);
	debugStep("save:start", {
		blobSize: blob?.size,
		blobType: blob?.type,
		durationMs,
		hasAudio,
		hasToken: Boolean(token),
	});
	const description = hasAudio
		? `oops 2 issues recording (${duration})`
		: `oops 2 issues recording (${duration}, no audio)`;
	const file = await client.uploadFile(
		token,
		owner,
		repo,
		blob,
		`oops-${Date.now()}.webm`,
		description,
		assetsRepo,
		login,
	);
	debugStep("save:upload-response", {
		hasUrl: Boolean(file?.url),
		name: file?.name,
		type: file?.type,
		size: file?.size,
	});
	if (!file?.url) {
		throw new Error("Upload succeeded but no file URL was returned.");
	}
	// GitHub strips inline <video>; embed as a bold link so the clip is
	// reachable from the issue.
	const label = hasAudio ? "Screen recording" : "Screen recording (no audio)";
	return { markdown: `**[${label}](${file.url})** (${duration})`, file };
}
