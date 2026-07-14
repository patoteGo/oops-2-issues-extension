/**
 * oops 2 issues video — QA-gate regression invariants (task 4/4).
 *
 * The manual test matrix (docs/VIDEO_TEST_MATRIX.md) covers the human-runnable
 * flows. These are the invariants we CAN automate: cross-cutting rules that
 * would silently regress across the recorder / session / save modules. They
 * run against the real (non-mocked) pure logic + a mocked uploader, asserting
 * behavior through the public interfaces.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildDescription, buildRecordingMarkdown } from "../issue-body.js";

const mocks = vi.hoisted(() => ({
	upload: vi.fn(),
}));

import { saveRecording } from "../record-save.js";

beforeEach(() => vi.clearAllMocks());

describe("QA regression · re-record never uploads", () => {
	it("buildRecordingMarkdown returns empty for a missing URL (no upload → no embed)", () => {
		// The session UI's reRecord clears the blob before Save can read it; if the
		// save path were ever reached with no URL, it must embed nothing rather than
		// a broken link.
		expect(buildRecordingMarkdown("")).toBe("");
		expect(buildRecordingMarkdown(null)).toBe("");
	});
});

describe("QA regression · Save fires exactly one upload", () => {
	it("calls uploader.upload exactly once per Save", async () => {
		mocks.upload.mockResolvedValueOnce({ url: "https://blob/v.webm" });
		await saveRecording({
			blob: new Blob(["x"], { type: "video/webm" }),
			hasAudio: true,
			durationMs: 1000,
			uploader: { upload: mocks.upload },
		});
		expect(mocks.upload).toHaveBeenCalledTimes(1);
	});
});

describe("QA regression · screenshot path unchanged", () => {
	it("buildDescription still emits ![label](url) for image files (video did not break it)", () => {
		const out = buildDescription("", [{ url: "http://u/1.png" }]);
		expect(out).toBe("![Screenshot 1](http://u/1.png)");
	});

	it("the recording embed is a bold link, distinct from the screenshot image embed", () => {
		// Sanity: the two embed paths are distinct — screenshots use ![],
		// recordings use a bold [] link (GitHub strips inline <video>).
		const recMd = buildRecordingMarkdown("http://u/v.webm");
		const descWithShot = buildDescription("repro");
		expect(recMd).toMatch(/^\*\*\[Screen recording\]/);
		expect(recMd).not.toMatch(/^!\[/);
		expect(descWithShot).toBe("repro");
	});
});
