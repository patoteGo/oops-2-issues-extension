/**
 * uploadAttachments — the attachment upload pipeline.
 *
 * Pure over its inputs: takes the part-lists + a bound uploader, returns the
 * uploaded artifacts + a failure count, reports progress via callback. We feed
 * a fake uploader (and stub fetch for dataUrl→blob) and assert the contract —
 * what succeeds, what's skipped, that a pending recording is flushed, and that
 * progress fires per item.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadAttachments } from "../upload-pipeline.js";

const makeUploader = (uploadImpl) => ({ upload: vi.fn(uploadImpl) });

beforeEach(() => {
	vi.restoreAllMocks();
	// dataUrlToBlob does fetch(dataUrl).then(r => r.blob()); stub it so the
	// pipeline never touches the network regardless of jsdom/undici data: support.
	vi.spyOn(globalThis, "fetch").mockResolvedValue({
		blob: () => Promise.resolve(new Blob(["x"])),
	});
});

describe("uploadAttachments · screenshots", () => {
	it("uploads each screenshot and zips it with its source", async () => {
		const uploader = makeUploader(async (_blob, { description }) => ({
			url: `https://x/${description}`,
		}));
		const res = await uploadAttachments({
			screenshots: [
				{ data: "d1", description: "shot one", source: "https://page/1" },
				{ data: "d2", description: "shot two", source: null },
			],
			uploader,
		});
		expect(uploader.upload).toHaveBeenCalledTimes(2);
		expect(res.screenshots).toEqual([
			{
				url: "https://x/shot one",
				description: "shot one",
				source: "https://page/1",
			},
			{ url: "https://x/shot two", description: "shot two", source: null },
		]);
		expect(res.failures).toBe(0);
	});

	it("treats a bare dataURL string as the screenshot payload", async () => {
		const uploader = makeUploader(async () => ({ url: "https://x/a" }));
		const res = await uploadAttachments({
			screenshots: ["data:image/webp;base64,AAAA"],
			uploader,
		});
		expect(res.screenshots).toEqual([
			{ url: "https://x/a", description: "", source: null },
		]);
	});
});

describe("uploadAttachments · best-effort skips", () => {
	it("counts a failed upload and continues (does not throw)", async () => {
		const uploader = makeUploader(async (_blob, { filename }) => {
			if (filename === "bad.pdf") throw new Error("403 forbidden");
			return { url: `https://x/${filename}` };
		});
		const res = await uploadAttachments({
			attachments: [
				{ data: "a", name: "good.txt", description: "" },
				{ data: "b", name: "bad.pdf", description: "" },
			],
			uploader,
		});
		expect(res.references).toEqual([{ url: "https://x/good.txt" }]);
		expect(res.failures).toBe(1);
	});
});

describe("uploadAttachments · pending recording", () => {
	it("flushes a pending recording and returns its markdown + file", async () => {
		const uploader = makeUploader(async () => ({ url: "https://x/v.webm" }));
		const res = await uploadAttachments({
			pendingRecording: {
				blob: new Blob(["x"]),
				hasAudio: true,
				durationMs: 3000,
			},
			uploader,
		});
		expect(uploader.upload).toHaveBeenCalledTimes(1);
		expect(res.recordingMarkdown).toMatch(/Screen recording/);
		expect(res.uploaded).toHaveLength(1);
		expect(res.uploaded[0].url).toBe("https://x/v.webm");
	});

	it("skips the recording when there is none", async () => {
		const uploader = makeUploader(async () => ({ url: "https://x" }));
		const res = await uploadAttachments({ uploader });
		expect(res.recordingMarkdown).toBeNull();
		expect(res.uploaded).toEqual([]);
		expect(uploader.upload).not.toHaveBeenCalled();
	});
});

describe("uploadAttachments · progress", () => {
	it("reports progress per item via the callback, in order", async () => {
		const uploader = makeUploader(async () => ({ url: "https://x" }));
		const onProgress = vi.fn();
		await uploadAttachments({
			screenshots: [{ data: "d1", description: "a" }],
			attachments: [{ data: "d2", name: "f.txt", description: "" }],
			uploader,
			onProgress,
		});
		expect(onProgress.mock.calls.map((c) => c[0])).toEqual([
			"Uploading screenshot 1/1…",
			"Uploading reference 1/1…",
		]);
	});
});
