/**
 * saveRecording — the Save-path glue.
 *
 * Uploads the finalized webm Blob through a bound uploader (Strategy A → B
 * fallback), then returns the markdown block to embed in the issue body (the
 * caller appends it to the editor buffer). Re-records never reach here — no
 * Blob is created until Save. GitHub strips inline <video>, so the embed is a
 * bold markdown link. The uploader is mocked; we assert the upload contract +
 * the returned markdown. Token/repo guards live in uploadContext (tested in
 * upload-context.test.js), not here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
}));

// Inject the bound uploader directly — saveRecording no longer resolves token/repo.
const fakeUploader = () => ({ upload: mocks.upload });

import { saveRecording } from "../record-save.js";

beforeEach(() => {
	vi.clearAllMocks();
});

describe("saveRecording · upload contract", () => {
	it("uploads the webm blob via the bound uploader and returns a markdown link", async () => {
		const blob = new Blob(["x"], { type: "video/webm" });
		mocks.upload.mockResolvedValueOnce({
			url: "https://raw/me/repo/main/.oops-assets/v.webm",
		});

		const res = await saveRecording({
			blob,
			hasAudio: true,
			durationMs: 5000,
			uploader: fakeUploader(),
		});

		expect(mocks.upload).toHaveBeenCalledWith(blob, {
			filename: expect.stringMatching(/\.webm$/),
			description: expect.any(String),
		});
		// GitHub strips <video>, so the embed is a bold link, not a video tag.
		expect(res.markdown).toBe(
			"**[Screen recording](https://raw/me/repo/main/.oops-assets/v.webm)** (00:05)",
		);
		expect(res.file).toEqual({
			url: "https://raw/me/repo/main/.oops-assets/v.webm",
		});
	});

	it("includes the duration in the upload description + the label when silent", async () => {
		const blob = new Blob(["x"], { type: "video/webm" });
		mocks.upload.mockResolvedValueOnce({ url: "https://blob/v.webm" });

		const res = await saveRecording({
			blob,
			hasAudio: false,
			durationMs: 8000,
			uploader: fakeUploader(),
		});

		const descArg = mocks.upload.mock.calls[0][1].description;
		expect(descArg).toMatch(/no audio/i);
		expect(descArg).toMatch(/8s|00:08/i);
		expect(res.markdown).toMatch(/no audio/i);
	});
});

describe("saveRecording · failure modes", () => {
	it("throws (and embeds nothing) when the upload fails", async () => {
		mocks.upload.mockRejectedValueOnce(new Error("upload 500"));
		await expect(
			saveRecording({
				blob: new Blob(["x"], { type: "video/webm" }),
				hasAudio: true,
				durationMs: 1000,
				uploader: fakeUploader(),
			}),
		).rejects.toThrow(/upload 500/);
	});

	it("throws when the uploader returns no URL", async () => {
		mocks.upload.mockResolvedValueOnce({ url: "" });
		await expect(
			saveRecording({
				blob: new Blob(["x"], { type: "video/webm" }),
				hasAudio: true,
				durationMs: 1000,
				uploader: fakeUploader(),
			}),
		).rejects.toThrow(/no file URL/i);
		expect(mocks.upload).toHaveBeenCalledTimes(1);
	});
});
