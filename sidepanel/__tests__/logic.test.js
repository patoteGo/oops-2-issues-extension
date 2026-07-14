import { describe, it, expect } from "vitest";
import { buildSource, normalizeShots } from "../logic.js";

describe("buildSource", () => {
	it("returns null for null/undefined/empty meta", () => {
		expect(buildSource(null)).toBeNull();
		expect(buildSource(undefined)).toBeNull();
		expect(buildSource({})).toBeNull();
	});

	it("builds a source from full metadata", () => {
		const meta = {
			url: "https://app.example.com/x",
			title: "Page X",
			capturedAt: "2026-06-17T00:00:00.000Z",
			viewport: { width: 1440 }, // must be ignored
		};
		expect(buildSource(meta)).toEqual({
			url: "https://app.example.com/x",
			title: "Page X",
			capturedAt: "2026-06-17T00:00:00.000Z",
		});
	});

	it("keeps only the fields that are present", () => {
		expect(buildSource({ url: "https://a.test" })).toEqual({
			url: "https://a.test",
		});
		expect(buildSource({ title: "Only title" })).toEqual({
			title: "Only title",
		});
	});

	it("treats a url that is an empty string as absent", () => {
		// empty string is falsy -> not copied -> object stays empty -> null
		expect(buildSource({ url: "", title: "" })).toBeNull();
	});
});

describe("normalizeShots", () => {
	it("returns [] for non-array input", () => {
		expect(normalizeShots(undefined)).toEqual([]);
		expect(normalizeShots(null)).toEqual([]);
		expect(normalizeShots("nope")).toEqual([]);
	});

	it("upgrades a legacy single-string entry", () => {
		expect(normalizeShots(["dataUrl1"])).toEqual([
			{ data: "dataUrl1", description: "", source: null },
		]);
	});

	it("passes through full objects and defaults missing optional fields", () => {
		expect(
			normalizeShots([{ data: "d", description: "x", source: { url: "u" } }]),
		).toEqual([{ data: "d", description: "x", source: { url: "u" } }]);

		// object with only `data` -> description '' and source null
		expect(normalizeShots([{ data: "d" }])).toEqual([
			{ data: "d", description: "", source: null },
		]);
	});

	it("preserves explicit null source and empty description", () => {
		expect(
			normalizeShots([{ data: "d", description: "", source: null }]),
		).toEqual([{ data: "d", description: "", source: null }]);
	});

	it("keeps a mixed legacy + modern list in order", () => {
		const out = normalizeShots([
			"legacyString",
			{ data: "modern", description: "cap", source: { url: "u" } },
		]);
		expect(out).toEqual([
			{ data: "legacyString", description: "", source: null },
			{ data: "modern", description: "cap", source: { url: "u" } },
		]);
	});
});
