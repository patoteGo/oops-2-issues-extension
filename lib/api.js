/**
 * GitHub client for oops 2 issues.
 *
 * Two layers:
 *  - GitHubApi: the documented REST API on https://api.github.com (PAT auth)
 *    — verify/getUser/getRepos/createIssue + Contents-API upload + repo create.
 *  - uploadAsset: the image-attachment orchestrator. It FIRST tries GitHub's
 *    web "user-attachments" flow (Strategy A: POST /{owner}/{repo}/upload/
 *    policies/assets using the browser's github.com session cookie + a CSRF
 *    token), which renders inline on BOTH public and private repos and commits
 *    nothing. If A is unavailable (not logged in / GitHub changed the flow /
 *    any error), it falls back to Strategy B: upload to a designated PUBLIC
 *    assets repository via the Contents API, whose raw URL also renders inline
 *    regardless of the target repo's visibility.
 *
 * NOTE on Strategy A: it uses an undocumented github.com web route (not an
 * api.github.com route), so it authenticates with the browser session, not the
 * PAT. Chrome extensions bypass CORS for hosts they have permission for
 * (host_permissions: <all_urls>), and credentials:'include' attaches the
 * github.com session cookie. If GitHub changes the route, B keeps images
 * working — A is a progressive enhancement.
 */

const API_ROOT = "https://api.github.com";
const WEB_ROOT = "https://github.com";
const DEBUG_PREFIX = "[oops2issues video debug]";
const ASSETS_REPO_NAME = "oops-assets";

function debugStep(step, details = {}) {
	try {
		console.debug(DEBUG_PREFIX, step, details);
	} catch {
		/* debug must never break API calls */
	}
}

function authHeaders(token) {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

// Module-level caches (the api() factory returns a fresh instance each call,
// so we cache cross-instance at module scope).
const csrfCache = new Map(); // "owner/repo" -> CSRF token
const repoIdCache = new Map(); // "owner/repo" -> numeric DB id
// Assets repos we already failed to provision (e.g. fine-grained PATs can't
// create repos). Skip re-provisioning so we don't 403 on every screenshot.
const provisionFailed = new Set();

function ts() {
	return new Date()
		.toISOString()
		.replace(/[-:.TZ]/g, "")
		.slice(0, 14);
}

function rand() {
	return Math.random().toString(36).slice(2, 8);
}

// ponytail: chunked btoa to avoid call-stack overflow on large blobs.
function bytesToBase64(bytes) {
	let bin = "";
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
	}
	return btoa(bin);
}

function splitFullName(fullName) {
	const [owner, name] = String(fullName || "").split("/");
	return { owner, name };
}

export class GitHubApi {
	/** @private */
	url(path) {
		return `${API_ROOT}${path}`;
	}

	/** @private */
	static async readError(res) {
		let detail = `${res.status} ${res.statusText}`;
		try {
			const body = await res.json();
			detail = body?.message || detail;
			if (Array.isArray(body?.errors) && body.errors[0]?.message) {
				detail = `${detail}: ${body.errors[0].message}`;
			}
		} catch {
			/* non-JSON error body */
		}
		return GitHubApi.humanizeError(detail);
	}

	/**
	 * @private Map GitHub's cryptic fine-grained-PAT messages to actionable text.
	 * One place so every API call (upload, createIssue, repo list, …) benefits.
	 */
	static humanizeError(detail) {
		if (/resource not accessible by personal access token/i.test(detail)) {
			return (
				"This token can't access that repository. " +
				"If the repo belongs to an organization, the org must authorize " +
				"this token (org Settings → Personal access tokens), or the repo " +
				"must be added to the token's Repository access. " +
				"A classic PAT with the `repo` scope avoids this."
			);
		}
		return detail;
	}

	// ----- Auth ----------------------------------------------------------

	/** Verify a PAT. 'valid' | 'invalid' | 'unknown' (never throws). */
	async verify(token) {
		try {
			const res = await fetch(this.url("/user"), {
				headers: authHeaders(token),
			});
			if (res.status === 401 || res.status === 403) return "invalid";
			if (!res.ok) return "unknown";
			return "valid";
		} catch {
			return "unknown";
		}
	}

	/** Fetch the authenticated user (throws on non-2xx). */
	async getUser(token) {
		const res = await fetch(this.url("/user"), { headers: authHeaders(token) });
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		const u = await res.json();
		return {
			login: u.login,
			name: u.name || null,
			avatar_url: u.avatar_url,
			html_url: u.html_url,
		};
	}

	// ----- Repos ---------------------------------------------------------

	/** List visible repositories, most recently updated first. */
	async getRepos(token) {
		const res = await fetch(
			this.url(
				"/user/repos?per_page=100&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member",
			),
			{ headers: authHeaders(token) },
		);
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		const rows = await res.json();
		return (Array.isArray(rows) ? rows : [])
			.filter((r) => r && r.full_name)
			.map((r) => ({
				id: r.id,
				name: r.name,
				full_name: r.full_name,
				owner: r.owner?.login || r.full_name.split("/")[0],
				default_branch: r.default_branch || "main",
				private: !!r.private,
			}))
			.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
	}

	/** Fetch a single repository (for its numeric id / visibility). */
	async getRepo(token, owner, name) {
		const res = await fetch(this.url(`/repos/${owner}/${name}`), {
			headers: authHeaders(token),
		});
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		const r = await res.json();
		return {
			id: r.id,
			full_name: r.full_name,
			private: !!r.private,
			default_branch: r.default_branch || "main",
		};
	}

	/** Create a public repo owned by the token user (for the assets fallback). */
	async createRepo(token, name, { private: isPrivate = false } = {}) {
		const res = await fetch(this.url("/user/repos"), {
			method: "POST",
			headers: { ...authHeaders(token), "Content-Type": "application/json" },
			body: JSON.stringify({
				name,
				private: isPrivate,
				auto_init: true,
				description: "Screenshot assets for the oops 2 issues extension",
			}),
		});
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		const r = await res.json();
		return { full_name: r.full_name, private: !!r.private };
	}

	/**
	 * Ensure a repository exists; create it (public, owned by the token user)
	 * if it 404s. Used to provision the Strategy-B assets repo on first use.
	 */
	async ensureAssetsRepo(token, fullName) {
		const { owner, name } = splitFullName(fullName);
		const res = await fetch(this.url(`/repos/${owner}/${name}`), {
			headers: authHeaders(token),
		});
		if (res.ok) return { owner, name };
		if (res.status === 404) {
			// Only safe to create when the target owner is the token user; the
			// caller resolves assets repos to "<login>/oops-assets", so this holds.
			const created = await this.createRepo(token, name);
			return splitFullName(created.full_name);
		}
		throw new Error(await GitHubApi.readError(res));
	}

	// ----- Issues --------------------------------------------------------

	async createIssue(token, owner, repo, payload) {
		debugStep("api:create-issue-request", {
			owner,
			repo,
			titleLength: payload?.title?.length,
			labels: payload?.labels,
		});
		const res = await fetch(this.url(`/repos/${owner}/${repo}/issues`), {
			method: "POST",
			headers: { ...authHeaders(token), "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
		debugStep("api:create-issue-response-status", {
			ok: res.ok,
			status: res.status,
		});
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		return res.json();
	}

	// ----- Upload: Strategy B (Contents API) -----------------------------

	/**
	 * Upload a file into `<owner>/<repo>/.oops-assets/<unique path>` via the
	 * Contents API. Used as the fallback when the session-based Strategy A is
	 * unavailable. Returns a file object whose `url` is the raw download URL
	 * (renders inline on public repos).
	 */
	async uploadViaContents(token, owner, repo, blob, filename, description) {
		const buf = await blob.arrayBuffer();
		const content = bytesToBase64(new Uint8Array(buf));
		const safeName = (filename || "file").replace(/[^a-z0-9._-]+/gi, "-");
		const path = `.oops-assets/${ts()}-${rand()}-${safeName}`;
		const res = await fetch(
			this.url(`/repos/${owner}/${repo}/contents/${path}`),
			{
				method: "PUT",
				headers: {
					...authHeaders(token),
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: `chore: add ${safeName} (oops 2 issues)`,
					content,
				}),
			},
		);
		if (!res.ok) throw new Error(await GitHubApi.readError(res));
		const data = await res.json();
		const file = data?.content || {};
		const url = file.download_url;
		if (!url) {
			throw new Error(
				"Upload succeeded but no file URL was returned. " +
					"(Private repositories may block inline image previews.)",
			);
		}
		return {
			url,
			name: filename || "file",
			type: blob?.type || "application/octet-stream",
			size: blob?.size || 0,
			description: description || "",
			html_url: file.html_url || "",
		};
	}

	// ----- Upload: Strategy A (user-attachments session upload) ----------

	/** @private fetch + cache the github.com CSRF token for a repo. */
	async _getCsrfToken(owner, repo) {
		const key = `${owner}/${repo}`;
		if (csrfCache.has(key)) return csrfCache.get(key);
		const res = await fetch(`${WEB_ROOT}/${owner}/${repo}/issues/new`, {
			credentials: "include",
			headers: { Accept: "text/html,application/xhtml+xml" },
		});
		if (!res.ok)
			throw new Error(`github.com session unavailable (${res.status})`);
		const html = await res.text();
		const m = html.match(/<meta name="csrf-token" content="([^"]+)"/);
		if (!m) throw new Error("CSRF token not found on github.com");
		csrfCache.set(key, m[1]);
		return m[1];
	}

	/** @private fetch + cache the repo numeric DB id (needed by the policy). */
	async _getRepoId(token, owner, repo) {
		const key = `${owner}/${repo}`;
		if (repoIdCache.has(key)) return repoIdCache.get(key);
		const r = await this.getRepo(token, owner, repo);
		repoIdCache.set(key, r.id);
		return r.id;
	}

	/**
	 * @private Strategy A. Upload via github.com's user-attachments flow.
	 * Throws on any failure; the orchestrator falls back to Strategy B.
	 */
	async _uploadViaUserAttachment(token, owner, repo, blob, filename) {
		const csrf = await this._getCsrfToken(owner, repo);
		const repoId = await this._getRepoId(token, owner, repo);
		const policyRes = await fetch(
			`${WEB_ROOT}/${owner}/${repo}/upload/policies/assets`,
			{
				method: "POST",
				credentials: "include",
				headers: {
					Accept: "application/json",
					"Content-Type": "application/json",
					"X-CSRF-Token": csrf,
					"X-Requested-With": "XMLHttpRequest",
				},
				body: JSON.stringify({
					name: filename,
					size: blob.size,
					content_type: blob.type || "application/octet-stream",
					repository_id: repoId,
					authenticity_token: csrf,
				}),
			},
		);
		if (!policyRes.ok) throw new Error(`attachment policy ${policyRes.status}`);
		const data = await policyRes.json().catch(() => null);
		const href = data?.asset?.href || data?.asset?.url || data?.href;
		const uploadUrl = data?.upload_url;
		if (!href) throw new Error("attachment policy returned no asset href");
		if (uploadUrl) {
			// Upload the raw bytes to the presigned/upload URL.
			const upRes = await fetch(uploadUrl, {
				method: "PUT",
				credentials: "include",
				headers: {
					"Content-Type": blob.type || "application/octet-stream",
					"X-CSRF-Token": csrf,
				},
				body: blob,
			});
			// 200/201/204 are all acceptable; anything else is a real failure.
			if (
				!(upRes.status >= 200 && upRes.status < 300) &&
				upRes.status !== 204
			) {
				throw new Error(`attachment upload ${upRes.status}`);
			}
		}
		return {
			url: href,
			name: filename,
			type: blob?.type || "application/octet-stream",
			size: blob?.size || 0,
			description: "",
			html_url: href,
		};
	}

	// ----- Upload: orchestrator -----------------------------------------

	/**
	 * Upload an image/file and return an inline-renderable URL.
	 * Tries Strategy A (session user-attachments) first; on ANY failure falls
	 * back to Strategy B (Contents API into a public assets repo).
	 *
	 * @param {string} token
	 * @param {string} owner target repo owner (used for Strategy A's policy)
	 * @param {string} repo target repo name
	 * @param {Blob} blob
	 * @param {string} filename
	 * @param {string} [description]
	 * @param {string} [assetsRepo] "owner/name" for Strategy B (default "<login>/oops-assets")
	 * @param {string} [login] token user's login (to build the default assets repo)
	 */
	async uploadAsset(
		token,
		owner,
		repo,
		blob,
		filename,
		description,
		assetsRepo,
		login,
	) {
		debugStep("api:upload-request", {
			owner,
			repo,
			filename: filename || "file",
			blobSize: blob?.size,
			blobType: blob?.type,
			hasDescription: Boolean(description),
		});
		// Strategy A — session user-attachments (inline on public + private).
		try {
			const file = await this._uploadViaUserAttachment(
				token,
				owner,
				repo,
				blob,
				filename,
			);
			file.description = description || "";
			debugStep("api:upload-response", { strategy: "A", ok: true });
			return file;
		} catch (aErr) {
			debugStep("api:upload-strategy-a-failed", {
				error: aErr?.message || String(aErr),
			});
		}
		// Strategy B — Contents API into a public assets repo. If it can't be
		// provisioned (fine-grained PATs can't create repos, so POST /user/repos
		// 403s), fall back to the target repo itself — Contents:write is already
		// granted there, and raw URLs render inline on public repos.
		const fallback = assetsRepo || `${login || owner}/${ASSETS_REPO_NAME}`;
		let aOwner = owner;
		let aName = repo;
		if (!provisionFailed.has(fallback)) {
			try {
				({ owner: aOwner, name: aName } = await this.ensureAssetsRepo(
					token,
					fallback,
				));
			} catch (provisionErr) {
				provisionFailed.add(fallback);
				debugStep("api:assets-repo-provision-failed", {
					fallback,
					error: provisionErr?.message || String(provisionErr),
					usingTarget: `${owner}/${repo}`,
				});
			}
		}
		const file = await this.uploadViaContents(
			token,
			aOwner,
			aName,
			blob,
			filename,
			description,
		);
		debugStep("api:upload-response", { strategy: "B", ok: true });
		return file;
	}

	/** Thin wrapper: upload an image screenshot (tries A, falls back to B). */
	async uploadScreenshot(
		token,
		owner,
		repo,
		blob,
		description,
		assetsRepo,
		login,
	) {
		return this.uploadAsset(
			token,
			owner,
			repo,
			blob,
			"oops.webp",
			description,
			assetsRepo,
			login,
		);
	}

	/** Thin wrapper: upload a named reference file (tries A, falls back to B). */
	async uploadFile(
		token,
		owner,
		repo,
		blob,
		filename,
		description,
		assetsRepo,
		login,
	) {
		return this.uploadAsset(
			token,
			owner,
			repo,
			blob,
			filename,
			description,
			assetsRepo,
			login,
		);
	}
}

// Expose the constants/helpers for tests.
export const _internals = {
	ASSETS_REPO_NAME,
	splitFullName,
	bytesToBase64,
	clearCaches: () => {
		csrfCache.clear();
		repoIdCache.clear();
		provisionFailed.clear();
	},
};
