import { describe, it, expect } from "vitest";
import {
	formatFileSize,
	isAllowedReferenceType,
	validateReference,
	categorizeFile,
	normalizeReferences,
} from "../references.js";

describe("formatFileSize", () => {
	it("formats bytes, KB, MB, GB with sensible precision", () => {
		expect(formatFileSize(0)).toBe("0 B");
		expect(formatFileSize(512)).toBe("512 B");
		expect(formatFileSize(1024)).toBe("1 KB");
		expect(formatFileSize(1536)).toBe("1.5 KB");
		expect(formatFileSize(10240)).toBe("10 KB");
		expect(formatFileSize(5 * 1024 * 1024)).toBe("5 MB");
		expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe("2 GB");
	});

	it("is resilient to non-finite / negative input", () => {
		expect(formatFileSize(NaN)).toBe("0 B");
		expect(formatFileSize(-5)).toBe("0 B");
		expect(formatFileSize(undefined)).toBe("0 B");
	});
});

describe("isAllowedReferenceType", () => {
	it("accepts the allow-listed types", () => {
		expect(isAllowedReferenceType("image/png")).toBe(true);
		expect(isAllowedReferenceType("application/pdf")).toBe(true);
		expect(isAllowedReferenceType("application/zip")).toBe(true);
		expect(isAllowedReferenceType("text/markdown")).toBe(true);
	});

	it("accepts any text/* type and an empty type", () => {
		expect(isAllowedReferenceType("text/x-custom")).toBe(true);
		expect(isAllowedReferenceType("")).toBe(true);
	});

	it("rejects unsupported types", () => {
		expect(isAllowedReferenceType("application/x-msdownload")).toBe(false);
		expect(isAllowedReferenceType("video/mp4")).toBe(false);
	});
});

describe("validateReference", () => {
	const ok = (over = {}) => ({
		name: "f",
		type: "image/png",
		size: 1024,
		...over,
	});

	it("returns null for a valid file", () => {
		expect(validateReference(ok())).toBeNull();
	});

	it("rejects oversized files with a friendly message", () => {
		const big = ok({ size: 26 * 1024 * 1024 });
		const msg = validateReference(big);
		expect(msg).toMatch(/too large/i);
		expect(msg).toContain("25 MB");
	});

	it("rejects unsupported types", () => {
		expect(validateReference(ok({ type: "application/x-msdownload" }))).toMatch(
			/not supported/i,
		);
	});

	it("rejects null/undefined input", () => {
		expect(validateReference(null)).toMatch(/no file/i);
		expect(validateReference(undefined)).toMatch(/no file/i);
	});
});

describe("categorizeFile", () => {
	it("buckets by mime prefix", () => {
		expect(categorizeFile("image/png")).toBe("image");
		expect(categorizeFile("video/mp4")).toBe("video");
		expect(categorizeFile("audio/mpeg")).toBe("audio");
	});

	it("recognizes documents, spreadsheets, presentations", () => {
		expect(categorizeFile("application/pdf")).toBe("document");
		expect(
			categorizeFile(
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			),
		).toBe("document");
		expect(
			categorizeFile(
				"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			),
		).toBe("spreadsheet");
		expect(
			categorizeFile(
				"application/vnd.openxmlformats-officedocument.presentationml.presentation",
			),
		).toBe("presentation");
	});

	it("recognizes archives and code/text", () => {
		expect(categorizeFile("application/zip")).toBe("archive");
		expect(categorizeFile("application/x-7z-compressed")).toBe("archive");
		expect(categorizeFile("text/plain")).toBe("code");
		expect(categorizeFile("application/json", "a.json")).toBe("code");
		expect(categorizeFile("", "script.py")).toBe("code");
	});

	it("falls back to other for unknown types", () => {
		expect(categorizeFile("application/x-msdownload")).toBe("other");
		expect(categorizeFile("")).toBe("other");
	});
});

describe("normalizeReferences", () => {
	it("returns [] for non-array input", () => {
		expect(normalizeReferences(undefined)).toEqual([]);
		expect(normalizeReferences(null)).toEqual([]);
	});

	it("drops entries without data and defaults missing fields", () => {
		const out = normalizeReferences([
			{
				data: "d1",
				name: "a.png",
				type: "image/png",
				size: 10,
				description: "cap",
			},
			{ name: "no-data" },
			{ data: "d2" },
		]);
		expect(out).toEqual([
			{
				data: "d1",
				name: "a.png",
				type: "image/png",
				size: 10,
				description: "cap",
			},
			{
				data: "d2",
				name: "file",
				type: "application/octet-stream",
				size: 0,
				description: "",
			},
		]);
	});
});
