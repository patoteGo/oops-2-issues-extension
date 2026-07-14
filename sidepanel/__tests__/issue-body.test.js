import { describe, it, expect } from "vitest";
import {
	buildIssueBody,
	buildDescription,
	buildReferences,
	buildChecklist,
	buildRecordingMarkdown,
} from "../issue-body.js";

// A zipped Screenshot: {url, description?, source?}.
const shot = (url, description, source) => ({ url, description, source });

describe("buildDescription", () => {
	it("returns just the trimmed user markdown when there are no screenshots", () => {
		expect(buildDescription("  hi  ", [])).toBe("hi");
	});

	it("returns empty string when nothing is provided", () => {
		expect(buildDescription("", [])).toBe("");
		expect(buildDescription("   ", [])).toBe("");
	});

	it("renders a single screenshot with no source as a bare image", () => {
		expect(buildDescription("", [shot("http://u/1.png")])).toBe(
			"![Screenshot 1](http://u/1.png)",
		);
	});

	it("uses the description as the alt label and caption", () => {
		expect(
			buildDescription("", [shot("http://u/1.png", "Login button broken")]),
		).toBe("![Login button broken](http://u/1.png)\n*Login button broken*");
	});

	it("attaches the per-screenshot source link to the caption", () => {
		const out = buildDescription("", [
			shot("http://u/1.png", "boom", {
				url: "https://p.test/a",
				title: "Page A",
			}),
		]);
		expect(out).toContain("![boom](http://u/1.png)");
		expect(out).toContain("*boom — [Page A](https://p.test/a)*");
		expect(out).toContain("- **Source:** [Page A](https://p.test/a)");
	});

	it("uses the raw url as link text when there is no title", () => {
		const out = buildDescription("", [
			shot("http://u/1.png", undefined, { url: "https://p.test/a" }),
		]);
		expect(out).toContain("- **Source:** https://p.test/a");
	});

	it("groups multiple screenshots under a heading and joins them", () => {
		const out = buildDescription("", [
			shot("http://u/1.png"),
			shot("http://u/2.png"),
		]);
		expect(out).toContain("#### Screenshots\n\n");
		expect(out).toContain("![Screenshot 1](http://u/1.png)");
		expect(out).toContain("![Screenshot 2](http://u/2.png)");
		expect(out).toMatch(
			/\[Screenshot 1\]\(http:\/\/u\/1\.png\)\n\n!\[Screenshot 2\]/,
		);
	});

	it("dedupes source URLs in the Context section", () => {
		const out = buildDescription("", [
			shot("http://u/1.png", undefined, {
				url: "https://p.test/a",
				title: "A",
			}),
			shot("http://u/2.png", undefined, {
				url: "https://p.test/a",
				title: "A dup",
			}),
		]);
		// Each screenshot's own caption still carries its source link (by design),
		// so 'A dup' appears in screenshot 2's caption. Dedup governs Context only.
		const context = out.slice(out.indexOf("#### Context"));
		expect(context).toContain("- **Source:** [A](https://p.test/a)");
		expect(context).not.toContain("Sources (");
		expect(context).not.toContain("A dup");
	});

	it("lists multiple distinct pages in order, numbered", () => {
		const out = buildDescription("", [
			shot("http://u/1.png", undefined, {
				url: "https://p.test/a",
				title: "Page A",
			}),
			shot("http://u/2.png", undefined, {
				url: "https://p.test/b",
				title: "Page B",
			}),
		]);
		expect(out).toContain("- **Sources (2 pages):**");
		expect(out).toContain("  1. [Page A](https://p.test/a)");
		expect(out).toContain("  2. [Page B](https://p.test/b)");
	});

	it("includes the capturedAt from the last screenshot in Context", () => {
		const out = buildDescription("", [
			shot("http://u/1.png", undefined, {
				url: "https://p.test/a",
				capturedAt: "2026-06-17",
			}),
		]);
		expect(out).toContain("- **Captured:** 2026-06-17");
	});

	it("omits the Context section when a screenshot has no source", () => {
		expect(buildDescription("", [shot("http://u/1.png")])).toBe(
			"![Screenshot 1](http://u/1.png)",
		);
		// no Context section at all
		expect(buildDescription("", [shot("http://u/1.png")])).not.toContain(
			"#### Context",
		);
	});

	it("ignores screenshot entries without a url", () => {
		const out = buildDescription("", [
			{ description: "no url" },
			shot("http://u/1.png"),
		]);
		expect(out).toBe("![Screenshot 1](http://u/1.png)");
	});

	it("tolerates non-array inputs without throwing", () => {
		expect(() => buildDescription("body", null)).not.toThrow();
		expect(() => buildDescription("body", undefined)).not.toThrow();
		expect(buildDescription("body", null)).toBe("body");
		expect(buildDescription("body", undefined)).toBe("body");
	});
});

describe("buildReferences", () => {
	it("returns empty string when there are no files", () => {
		expect(buildReferences([])).toBe("");
		expect(buildReferences(undefined)).toBe("");
	});

	it("ignores entries without a url", () => {
		expect(buildReferences([{ name: "no url" }])).toBe("");
	});

	it("embeds an image inline with the description as caption", () => {
		const out = buildReferences([
			{
				url: "http://u/a.png",
				name: "a.png",
				type: "image/png",
				description: "the bug",
			},
		]);
		expect(out).toBe(
			"#### References\n\n![the bug](http://u/a.png)\n*the bug*",
		);
	});

	it("uses the filename as alt text when there is no description", () => {
		const out = buildReferences([
			{ url: "http://u/a.png", name: "a.png", type: "image/png" },
		]);
		expect(out).toBe("#### References\n\n![a.png](http://u/a.png)");
	});

	it("lists non-image files as bold links", () => {
		const out = buildReferences([
			{ url: "http://u/log.pdf", name: "log.pdf", type: "application/pdf" },
		]);
		expect(out).toBe("#### References\n\n- **[log.pdf](http://u/log.pdf)**");
	});

	it("appends an italic description to a linked file", () => {
		const out = buildReferences([
			{
				url: "http://u/log.pdf",
				name: "log.pdf",
				type: "application/pdf",
				description: "prod error log",
			},
		]);
		expect(out).toBe(
			"#### References\n\n- **[log.pdf](http://u/log.pdf)** — *prod error log*",
		);
	});

	it("separates inline images from the linked file list", () => {
		const out = buildReferences([
			{
				url: "http://u/a.png",
				name: "a.png",
				type: "image/png",
				description: "shot",
			},
			{ url: "http://u/log.pdf", name: "log.pdf", type: "application/pdf" },
		]);
		expect(out).toBe(
			"#### References\n\n![shot](http://u/a.png)\n*shot*\n\n- **[log.pdf](http://u/log.pdf)**",
		);
	});
});

describe("buildChecklist", () => {
	it("returns empty string when there are no items", () => {
		expect(buildChecklist([])).toBe("");
		expect(buildChecklist(undefined)).toBe("");
	});

	it("renders unchecked items as a GitHub task list", () => {
		expect(buildChecklist([{ text: "Repro", completed: false }])).toBe(
			"#### Checklist\n\n- [ ] Repro",
		);
	});

	it("renders completed items with an x", () => {
		expect(buildChecklist([{ text: "Done", completed: true }])).toBe(
			"#### Checklist\n\n- [x] Done",
		);
	});

	it("joins multiple items on separate lines", () => {
		expect(
			buildChecklist([
				{ text: "First", completed: false },
				{ text: "Second", completed: true },
			]),
		).toBe("#### Checklist\n\n- [ ] First\n- [x] Second");
	});

	it("tolerates missing text", () => {
		expect(buildChecklist([{ completed: false }])).toBe(
			"#### Checklist\n\n- [ ] ",
		);
	});
});

describe("buildIssueBody (golden)", () => {
	it("composes every section in order: userMd, Screenshots+Context, References, Checklist", () => {
		const body = buildIssueBody({
			userMd: "The button is broken",
			screenshots: [
				shot("http://u/1.png", "boom", {
					url: "https://p.test/a",
					title: "Page A",
				}),
			],
			references: [
				{ url: "http://u/log.pdf", name: "log.pdf", type: "application/pdf" },
			],
			uploaded: [
				{ url: "http://u/v.webm", name: "rec.webm", type: "video/webm" },
			],
			checklist: [{ text: "Repro", completed: false }],
		});
		expect(body).toBe(
			[
				"The button is broken",
				"![boom](http://u/1.png)\n*boom — [Page A](https://p.test/a)*",
				"#### Context\n\n- **Source:** [Page A](https://p.test/a)",
				"#### References\n\n- **[log.pdf](http://u/log.pdf)**\n- **[rec.webm](http://u/v.webm)**",
				"#### Checklist\n\n- [ ] Repro",
			].join("\n\n"),
		);
	});

	it("drops empty sections", () => {
		// No screenshots, no references, no checklist — only the user markdown.
		expect(buildIssueBody({ userMd: "just text" })).toBe("just text");
		// No user markdown but a checklist.
		expect(
			buildIssueBody({ checklist: [{ text: "Only this", completed: false }] }),
		).toBe("#### Checklist\n\n- [ ] Only this");
	});

	it("returns empty string when every part is empty", () => {
		expect(buildIssueBody({})).toBe("");
		expect(buildIssueBody()).toBe("");
	});

	it("merges references and uploaded under one References heading", () => {
		const body = buildIssueBody({
			references: [
				{ url: "http://u/log.pdf", name: "log.pdf", type: "application/pdf" },
			],
			uploaded: [
				{ url: "http://u/v.webm", name: "rec.webm", type: "video/webm" },
			],
		});
		// Exactly one heading, both links under it (references first, then uploaded).
		expect(body.match(/#### References/g)).toHaveLength(1);
		expect(body).toBe(
			"#### References\n\n- **[log.pdf](http://u/log.pdf)**\n- **[rec.webm](http://u/v.webm)**",
		);
	});

	it("groups inline images first across merged sources (locked behavior)", () => {
		// A Reference that is a link + an uploaded file that is an image. After the
		// merge, buildReferences groups images before links regardless of source,
		// so the image (from `uploaded`) surfaces above the link (from `references`).
		const body = buildIssueBody({
			references: [
				{ url: "http://u/log.pdf", name: "log.pdf", type: "application/pdf" },
			],
			uploaded: [
				{
					url: "http://u/img.png",
					name: "img.png",
					type: "image/png",
					description: "pic",
				},
			],
		});
		expect(body).toBe(
			"#### References\n\n![pic](http://u/img.png)\n*pic*\n\n- **[log.pdf](http://u/log.pdf)**",
		);
	});
});

describe("buildRecordingMarkdown", () => {
	it("returns empty string for a missing URL", () => {
		expect(buildRecordingMarkdown("")).toBe("");
		expect(buildRecordingMarkdown(null)).toBe("");
		expect(buildRecordingMarkdown(undefined)).toBe("");
	});

	it("embeds a bold link for a bare URL", () => {
		expect(buildRecordingMarkdown("https://blob/v.webm")).toBe(
			"**[Screen recording](https://blob/v.webm)**",
		);
	});

	it("marks no-audio recordings", () => {
		expect(
			buildRecordingMarkdown("https://blob/v.webm", { hasAudio: false }),
		).toBe("**[Screen recording (no audio)](https://blob/v.webm)**");
	});

	it("appends the duration when provided", () => {
		expect(
			buildRecordingMarkdown("https://blob/v.webm", { duration: "00:05" }),
		).toBe("**[Screen recording](https://blob/v.webm)** (00:05)");
	});

	it("combines no-audio and duration", () => {
		expect(
			buildRecordingMarkdown("https://blob/v.webm", {
				hasAudio: false,
				duration: "01:23",
			}),
		).toBe("**[Screen recording (no audio)](https://blob/v.webm)** (01:23)");
	});
});
