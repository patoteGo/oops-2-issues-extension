import { describe, it, expect } from "vitest";
import { matchRepo, loadUrlMap } from "../lib/repo-match.js";
import map from "../repo-url-map.json" with { type: "json" };

describe("matchRepo", () => {
	it("maps the Expenses page to finance-conductor in the bundled map", () => {
		expect(matchRepo(loadUrlMap(map), "https://expenses.epsoftware.com.br/expenses"))
			.toBe("patoteGo/finance-conductor");
	});
	it("matches an exact URL pattern", () => {
		expect(
			matchRepo(
				{ "patoteGo/oops-2-issues": ["https://github.com/patoteGo/oops-2-issues*"] },
				"https://github.com/patoteGo/oops-2-issues/issues/3",
			),
		).toBe("patoteGo/oops-2-issues");
	});

	it("matches wildcard host patterns", () => {
		expect(
			matchRepo({ "acme/app": ["https://app.acme.dev/*"] }, "https://app.acme.dev/dashboard"),
		).toBe("acme/app");
	});

	it("returns null when nothing matches", () => {
		expect(matchRepo({ "a/b": ["https://acme.dev/*"] }, "https://example.com/x")).toBeNull();
	});

	it("returns null for empty or invalid maps", () => {
		expect(matchRepo(null, "https://example.com")).toBeNull();
		expect(matchRepo({}, "https://example.com")).toBeNull();
	});
});

describe("loadUrlMap", () => {
	it("ships a valid schema with entries", () => {
		const m = loadUrlMap(map);
		expect(Object.keys(m).length).toBeGreaterThan(0);
		for (const patterns of Object.values(m)) expect(Array.isArray(patterns)).toBe(true);
	});
});
