import { describe, expect, it } from "vitest";
import { fuzzyScore, filterRepos } from "../logic.js";

const repos = [
	{ full_name: "alice/frontend", owner: "alice", name: "frontend" },
	{ full_name: "alice/fdr-tools", owner: "alice", name: "fdr-tools" },
	{ full_name: "bob/backend-api", owner: "bob", name: "backend-api" },
	{ full_name: "corp/website", owner: "corp", name: "website" },
];

describe("fuzzyScore", () => {
	it("returns -1 when the query is not a subsequence", () => {
		expect(fuzzyScore("fzz", "frontend")).toBe(-1);
	});

	it("matches case-insensitively", () => {
		expect(fuzzyScore("FE", "frontend")).toBeGreaterThan(0);
	});

	it("scores consecutive matches higher than spread-out ones", () => {
		expect(fuzzyScore("fr", "frontend")).toBeGreaterThan(
			fuzzyScore("fr", "fdr-tools"),
		);
	});

	it("rewards a match at the start of the string", () => {
		expect(fuzzyScore("front", "frontend")).toBeGreaterThan(
			fuzzyScore("front", "xfrontend"),
		);
	});
});

describe("filterRepos", () => {
	it("returns all repos for an empty query and all-owners filter", () => {
		expect(filterRepos(repos, "", "")).toHaveLength(4);
	});

	it("filters by owner", () => {
		const out = filterRepos(repos, "", "alice");
		expect(out).toHaveLength(2);
		expect(out.every((r) => r.owner === "alice")).toBe(true);
	});

	it("fuzzy-filters by name, case-insensitively", () => {
		const out = filterRepos(repos, "bak", "");
		expect(out.map((r) => r.full_name)).toContain("bob/backend-api");
	});

	it("combines search and owner filters", () => {
		const out = filterRepos(repos, "f", "alice");
		expect(out.map((r) => r.full_name).sort()).toEqual([
			"alice/fdr-tools",
			"alice/frontend",
		]);
		expect(filterRepos(repos, "f", "bob")).toEqual([]);
	});

	it("matches on the owner part too", () => {
		const out = filterRepos(repos, "corp", "");
		expect(out.map((r) => r.full_name)).toEqual(["corp/website"]);
	});

	it("ranks the best match first", () => {
		const out = filterRepos(repos, "front", "");
		expect(out[0].full_name).toBe("alice/frontend");
	});
});
