import { afterEach, describe, expect, it } from "vitest";
import {
	loadUrlMap,
	matchRepoForUrl,
	normalizeUrlMap,
	urlMatchesPattern,
} from "../url-map.js";

describe("normalizeUrlMap", () => {
	it("keeps string->string entries and drops metadata", () => {
		const map = normalizeUrlMap({
			_comment: ["docs"],
			"example.com": "owner/repo",
			bad: 42,
		});
		expect(map).toEqual({ "example.com": "owner/repo" });
	});

	it("returns {} for junk input", () => {
		expect(normalizeUrlMap(null)).toEqual({});
		expect(normalizeUrlMap("nope")).toEqual({});
	});
});

describe("urlMatchesPattern", () => {
	it("matches host patterns case-insensitively", () => {
		expect(urlMatchesPattern("https://EXAMPLE.com/page", "example.com")).toBe(
			true,
		);
		expect(urlMatchesPattern("https://other.com", "example.com")).toBe(false);
	});

	it("supports wildcard subdomains", () => {
		expect(
			urlMatchesPattern("https://app.example.com/x", "*.example.com"),
		).toBe(true);
		expect(urlMatchesPattern("https://example.com", "*.example.com")).toBe(
			true,
		);
		expect(urlMatchesPattern("https://notexample.com", "*.example.com")).toBe(
			false,
		);
	});

	it("supports host + path prefix patterns", () => {
		expect(
			urlMatchesPattern(
				"https://github.com/patoteGo/oops-2-issues-extension",
				"github.com/patoteGo",
			),
		).toBe(true);
		expect(
			urlMatchesPattern("https://github.com/other/repo", "github.com/patoteGo"),
		).toBe(false);
	});

	it("returns false for junk", () => {
		expect(urlMatchesPattern("not a url", "example.com")).toBe(false);
		expect(urlMatchesPattern("https://example.com", "")).toBe(false);
	});
});

describe("matchRepoForUrl", () => {
	const repos = [{ full_name: "owner/app" }, { full_name: "owner/web" }];

	it("returns the matched repo with canonical casing", () => {
		const repo = matchRepoForUrl(
			"https://app.example.com/issue/1",
			{ "*.example.com": "OWNER/APP" },
			repos,
		);
		expect(repo).toBe("owner/app");
	});

	it("returns null when nothing matches", () => {
		expect(
			matchRepoForUrl(
				"https://unrelated.io",
				{ "example.com": "owner/app" },
				repos,
			),
		).toBeNull();
	});

	it("returns null when the mapped repo is not in the dropdown", () => {
		expect(
			matchRepoForUrl(
				"https://example.com",
				{ "example.com": "owner/ghost" },
				repos,
			),
		).toBeNull();
	});

	it("never throws on missing repos", () => {
		expect(
			matchRepoForUrl("https://example.com", { "example.com": "owner/app" }),
		).toBeNull();
	});
});

describe("loadUrlMap", () => {
	const prevChrome = globalThis.chrome;

	afterEach(() => {
		globalThis.chrome = prevChrome;
	});

	it("returns {} when chrome is unavailable", async () => {
		globalThis.chrome = undefined;
		await expect(loadUrlMap()).resolves.toEqual({});
	});
});
