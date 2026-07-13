/**
 * saveRecording — the Save-path glue.
 *
 * Uploads the finalized webm Blob via GitHubApi.uploadFile into the target
 * repo's `.oops-assets/`, then returns the markdown block to embed in the
 * issue body (the caller appends it to the editor buffer). Re-records never
 * reach here — no Blob is created until Save. GitHub strips inline <video>,
 * so the embed is a bold markdown link. GitHubApi + token/repo resolution
 * are mocked; we assert the upload contract + the returned markdown + the
 * never-upload-on-failure rule.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
	uploadFile: vi.fn(),
	getToken: vi.fn(),
	getRepo: vi.fn(),
}));

// Inject `api` directly so the tests don't depend on `new GitHubApi()`.
const fakeApi = () => ({ uploadFile: mocks.uploadFile });

import { saveRecording } from "../record-save.js";

beforeEach(() => {
	vi.clearAllMocks();
	mocks.getToken.mockReturnValue("tok-1");
	mocks.getRepo.mockReturnValue("me/repo");
});

describe("saveRecording · upload contract", () => {
	it("uploads the webm blob to the target repo and returns a markdown link", async () => {
		const blob = new Blob(["x"], { type: "video/webm" });
		mocks.uploadFile.mockResolvedValueOnce({
			url: "https://raw/me/repo/main/.oops-assets/v.webm",
		});

		const res = await saveRecording({
			blob,
			hasAudio: true,
			durationMs: 5000,
			getToken: mocks.getToken,
			getRepo: mocks.getRepo,
			api: fakeApi(),
		});

		expect(mocks.uploadFile).toHaveBeenCalledWith(
			"tok-1",
			"me",
			"repo",
			blob,
			expect.stringMatching(/\.webm$/),
			expect.any(String),
			null, // assetsRepo
			null, // login
		);
		// GitHub strips <video>, so the embed is a bold link, not a video tag.
		expect(res.markdown).toBe(
			"**[Screen recording](https://raw/me/repo/main/.oops-assets/v.webm)** (00:05)",
		);
		expect(res.file).toEqual({
			url: "https://raw/me/repo/main/.oops-assets/v.webm",
		});
	});

	it("accepts the shared api factory used by sidepanel.js", async () => {
		const blob = new Blob(["x"], { type: "video/webm" });
		mocks.uploadFile.mockResolvedValueOnce({ url: "https://blob/v.webm" });

		await saveRecording({
			blob,
			hasAudio: true,
			durationMs: 1000,
			getToken: mocks.getToken,
			getRepo: mocks.getRepo,
			api: fakeApi,
		});

		expect(mocks.uploadFile).toHaveBeenCalledTimes(1);
	});

	it("includes the duration in the upload description + the label when silent", async () => {
		const blob = new Blob(["x"], { type: "video/webm" });
		mocks.uploadFile.mockResolvedValueOnce({ url: "https://blob/v.webm" });

		const res = await saveRecording({
			blob,
			hasAudio: false,
			durationMs: 8000,
			getToken: mocks.getToken,
			getRepo: mocks.getRepo,
			api: fakeApi(),
		});

		const descArg = mocks.uploadFile.mock.calls[0][5];
		expect(descArg).toMatch(/no audio/i);
		expect(descArg).toMatch(/8s|00:08/i);
		expect(res.markdown).toMatch(/no audio/i);
	});
});

describe("saveRecording · failure modes", () => {
	it("throws (and embeds nothing) when the upload fails", async () => {
		mocks.uploadFile.mockRejectedValueOnce(new Error("upload 500"));
		await expect(
			saveRecording({
				blob: new Blob(["x"], { type: "video/webm" }),
				hasAudio: true,
				durationMs: 1000,
				getToken: mocks.getToken,
				getRepo: mocks.getRepo,
				api: fakeApi(),
			}),
		).rejects.toThrow(/upload 500/);
	});

	it("throws when there is no auth token", async () => {
		mocks.getToken.mockReturnValue(null);
		await expect(
			saveRecording({
				blob: new Blob(["x"], { type: "video/webm" }),
				hasAudio: true,
				durationMs: 1000,
				getToken: mocks.getToken,
				getRepo: mocks.getRepo,
				api: fakeApi(),
			}),
		).rejects.toThrow(/token|connect/i);
		expect(mocks.uploadFile).not.toHaveBeenCalled();
	});

	it("throws when no repository is selected", async () => {
		mocks.getRepo.mockReturnValue("");
		await expect(
			saveRecording({
				blob: new Blob(["x"], { type: "video/webm" }),
				hasAudio: true,
				durationMs: 1000,
				getToken: mocks.getToken,
				getRepo: mocks.getRepo,
				api: fakeApi(),
			}),
		).rejects.toThrow(/repository/i);
		expect(mocks.uploadFile).not.toHaveBeenCalled();
	});
});
