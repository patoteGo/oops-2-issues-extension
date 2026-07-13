import { describe, it, expect, beforeEach, vi } from "vitest";
import { GitHubApi, _internals } from "../api.js";

/** Minimal Response-like factory for the tests. */
function res(body, { status = 200, statusText = "OK" } = {}) {
	return {
		ok: status >= 200 && status < 300,
		status,
		statusText,
		async json() {
			return body;
		},
		async text() {
			return typeof body === "string" ? body : JSON.stringify(body);
		},
	};
}

/** Parse a fetch body string without throwing on malformed input. */
function safeJson(body) {
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

const api = new GitHubApi();

describe("GitHubApi — verify", () => {
	beforeEach(() => vi.restoreAllMocks());

	it('returns "valid" on 200', async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(res({ login: "me" }));
		expect(await api.verify("tok")).toBe("valid");
	});

	it('returns "invalid" on 401/403', async () => {
		const f = vi.spyOn(globalThis, "fetch");
		f.mockResolvedValueOnce(res({}, { status: 401 }));
		f.mockResolvedValueOnce(res({}, { status: 403 }));
		expect(await api.verify("tok")).toBe("invalid");
		expect(await api.verify("tok")).toBe("invalid");
	});

	it('returns "unknown" on a transport error (does not throw)', async () => {
		vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
		await expect(api.verify("tok")).resolves.toBe("unknown");
	});

	it("sends the bearer token + api-version header", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(res({ login: "me" }));
		await api.verify("tok");
		const [, init] = fetchMock.mock.calls[0];
		expect(init.headers.Authorization).toBe("Bearer tok");
		expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
	});
});

describe("GitHubApi — getUser", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("maps the /user response to {login,name,avatar_url,html_url}", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res({
				login: "me",
				name: "My Name",
				avatar_url: "https://x/a.png",
				html_url: "https://github.com/me",
			}),
		);
		const u = await api.getUser("tok");
		expect(u).toEqual({
			login: "me",
			name: "My Name",
			avatar_url: "https://x/a.png",
			html_url: "https://github.com/me",
		});
	});

	it("throws the server message on non-2xx", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res({ message: "Bad credentials" }, { status: 401 }),
		);
		await expect(api.getUser("tok")).rejects.toThrow("Bad credentials");
	});
});

describe("GitHubApi — getRepos", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("maps rows to {full_name, owner, ...} and sorts by full_name", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res([
				{
					id: 2,
					name: "zeta",
					full_name: "me/zeta",
					owner: { login: "me" },
					default_branch: "main",
					private: false,
				},
				{
					id: 1,
					name: "alpha",
					full_name: "you/alpha",
					owner: { login: "you" },
					default_branch: "master",
					private: true,
				},
			]),
		);
		const repos = await api.getRepos("tok");
		expect(repos.map((r) => r.full_name)).toEqual(["me/zeta", "you/alpha"]);
		expect(repos[1]).toMatchObject({
			owner: "you",
			default_branch: "master",
			private: true,
		});
	});

	it("filters out rows without a full_name", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res([{ id: 9 }, { id: 1, full_name: "me/x", owner: { login: "me" } }]),
		);
		const repos = await api.getRepos("tok");
		expect(repos.map((r) => r.full_name)).toEqual(["me/x"]);
	});

	it("requests the most-recently-updated affiliation mix", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(res([]));
		await api.getRepos("tok");
		const [url] = fetchMock.mock.calls[0];
		expect(url).toContain("/user/repos");
		expect(url).toContain("sort=updated");
		expect(url).toContain("affiliation=owner,collaborator,organization_member");
	});
});

describe("GitHubApi — getRepo / createRepo / ensureAssetsRepo", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("getRepo maps the single-repo response", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res({
				id: 99,
				full_name: "me/repo",
				private: true,
				default_branch: "main",
			}),
		);
		const r = await api.getRepo("tok", "me", "repo");
		expect(r).toEqual({
			id: 99,
			full_name: "me/repo",
			private: true,
			default_branch: "main",
		});
	});

	it("createRepo POSTs to /user/repos and returns full_name", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(res({ full_name: "me/oops-assets", private: false }));
		const r = await api.createRepo("tok", "oops-assets");
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.github.com/user/repos");
		expect(init.method).toBe("POST");
		expect(safeJson(init.body).name).toBe("oops-assets");
		expect(r).toEqual({ full_name: "me/oops-assets", private: false });
	});

	it("ensureAssetsRepo passes through when the repo exists", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(res({ id: 1, full_name: "me/oops-assets" }));
		const out = await api.ensureAssetsRepo("tok", "me/oops-assets");
		expect(fetchMock).toHaveBeenCalledTimes(1); // GET only, no POST
		expect(out).toEqual({ owner: "me", name: "oops-assets" });
	});

	it("ensureAssetsRepo creates the repo on 404", async () => {
		const f = vi.spyOn(globalThis, "fetch");
		f.mockResolvedValueOnce(res({ message: "Not Found" }, { status: 404 }));
		f.mockResolvedValueOnce(res({ full_name: "me/oops-assets" }));
		const out = await api.ensureAssetsRepo("tok", "me/oops-assets");
		expect(f.mock.calls[1][0]).toBe("https://api.github.com/user/repos");
		expect(out).toEqual({ owner: "me", name: "oops-assets" });
	});
});

describe("GitHubApi — uploadViaContents (Strategy B)", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("PUTs base64 content under .oops-assets/ and returns the raw url", async () => {
		const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res({
				content: {
					download_url:
						"https://raw.githubusercontent.com/me/repo/main/.oops-assets/x.webp",
					html_url: "https://github.com/me/repo/blob/main/.oops-assets/x.webp",
					path: ".oops-assets/x.webp",
				},
			}),
		);
		const blob = new Blob(["hello"], { type: "image/webp" });
		const file = await api.uploadViaContents(
			"tok",
			"me",
			"repo",
			blob,
			"shot.webp",
			"cap",
		);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toMatch(
			/^https:\/\/api\.github\.com\/repos\/me\/repo\/contents\/\.oops-assets\//,
		);
		expect(init.method).toBe("PUT");
		expect(init.headers.Authorization).toBe("Bearer tok");
		const body = safeJson(init.body);
		expect(body.message).toMatch(/shot\.webp/);
		expect(body.content).toBe(btoa("hello")); // base64 of "hello"
		expect(file.url).toBe(
			"https://raw.githubusercontent.com/me/repo/main/.oops-assets/x.webp",
		);
		expect(file.type).toBe("image/webp");
		expect(file.description).toBe("cap");
	});

	it("throws when the server returns no download url", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(res({ content: {} }));
		const blob = new Blob(["x"]);
		await expect(
			api.uploadViaContents("tok", "me", "repo", blob, "a.txt", ""),
		).rejects.toThrow(/no file URL/i);
	});
});

describe("GitHubApi — uploadAsset orchestrator (A → B fallback)", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
		_internals.clearCaches();
	});

	it("uses the user-attachment URL when Strategy A succeeds", async () => {
		// 1) CSRF page (github.com), 2) getRepo for repo id, 3) policy, 4) PUT bytes
		const f = vi.spyOn(globalThis, "fetch");
		f.mockResolvedValueOnce(
			res('<html><meta name="csrf-token" content="csrf-1"></html>', {
				status: 200,
			}),
		); // issues/new
		f.mockResolvedValueOnce(res({ id: 4242, full_name: "me/repo" })); // getRepo
		f.mockResolvedValueOnce(
			res({
				upload_url: "https://github.com/me/repo/upload/assets/abc",
				asset: { href: "https://github.com/user-attachments/assets/xyz" },
			}),
		); // policy
		f.mockResolvedValueOnce(res({}, { status: 201 })); // PUT bytes

		const blob = new Blob(["hi"], { type: "image/webp" });
		const file = await api.uploadAsset(
			"tok",
			"me",
			"repo",
			blob,
			"shot.webp",
			"cap",
			"me/oops-assets",
			"me",
		);

		expect(file.url).toBe("https://github.com/user-attachments/assets/xyz");
		expect(file.description).toBe("cap");
		// policy request carried the CSRF + repo id
		const policyCall = f.mock.calls[2];
		expect(policyCall[0]).toBe(
			"https://github.com/me/repo/upload/policies/assets",
		);
		expect(policyCall[1].headers["X-CSRF-Token"]).toBe("csrf-1");
		expect(safeJson(policyCall[1].body).repository_id).toBe(4242);
	});

	it("falls back to Strategy B (Contents API) when the session is unavailable", async () => {
		// A fails at the CSRF fetch (not logged in → 401)...
		const f = vi.spyOn(globalThis, "fetch");
		f.mockResolvedValueOnce(res("", { status: 401 })); // issues/new → A throws
		// ...then B: ensureAssetsRepo GET exists, then Contents PUT
		f.mockResolvedValueOnce(res({ id: 7, full_name: "me/oops-assets" })); // ensure GET
		f.mockResolvedValueOnce(
			res({
				content: {
					download_url: "https://raw/me/oops-assets/main/.oops-assets/x.webp",
				},
			}),
		); // Contents PUT

		const blob = new Blob(["hi"], { type: "image/webp" });
		const file = await api.uploadAsset(
			"tok",
			"me",
			"privaterepo",
			blob,
			"shot.webp",
			"",
			"me/oops-assets",
			"me",
		);

		expect(file.url).toBe(
			"https://raw/me/oops-assets/main/.oops-assets/x.webp",
		);
		// the Contents PUT targeted the ASSETS repo, not the private target
		expect(f.mock.calls[2][0]).toMatch(
			/repos\/me\/oops-assets\/contents\/\.oops-assets\//,
		);
	});

	it("uploadScreenshot delegates to uploadAsset with the oops.webp name", async () => {
		// A succeeds end-to-end
		const f = vi.spyOn(globalThis, "fetch");
		f.mockResolvedValueOnce(res('<meta name="csrf-token" content="c">'));
		f.mockResolvedValueOnce(res({ id: 1, full_name: "me/repo" }));
		f.mockResolvedValueOnce(
			res({ asset: { href: "https://github.com/user-attachments/assets/z" } }),
		);
		const blob = new Blob(["x"], { type: "image/webp" });
		const file = await api.uploadScreenshot(
			"tok",
			"me",
			"repo",
			blob,
			"cap",
			"me/oops-assets",
			"me",
		);
		expect(file.url).toBe("https://github.com/user-attachments/assets/z");
		// policy carried the fixed oops.webp filename
		expect(safeJson(f.mock.calls[2][1].body).name).toBe("oops.webp");
	});
});

describe("GitHubApi — createIssue", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("POSTs {title,body} as JSON with the bearer token", async () => {
		const fetchMock = vi
			.spyOn(globalThis, "fetch")
			.mockResolvedValue(
				res({ number: 42, html_url: "https://github.com/me/repo/issues/42" }),
			);
		const result = await api.createIssue("tok", "me", "repo", {
			title: "Bug",
			body: "d",
		});

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.github.com/repos/me/repo/issues");
		expect(init.method).toBe("POST");
		expect(init.headers["Content-Type"]).toBe("application/json");
		expect(init.headers.Authorization).toBe("Bearer tok");
		expect(safeJson(init.body)).toEqual({ title: "Bug", body: "d" });
		expect(result).toEqual({
			number: 42,
			html_url: "https://github.com/me/repo/issues/42",
		});
	});

	it("throws the server message on failure", async () => {
		vi.spyOn(globalThis, "fetch").mockResolvedValue(
			res({ message: "Not Found" }, { status: 404 }),
		);
		await expect(
			api.createIssue("tok", "me", "repo", { title: "x" }),
		).rejects.toThrow("Not Found");
	});
});
