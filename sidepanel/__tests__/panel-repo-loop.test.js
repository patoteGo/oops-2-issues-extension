import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.resetModules();
});

it("keeps the panel responsive after loading repositories and filtering", async () => {
	document.body.innerHTML = readFileSync(
		resolve(process.cwd(), "sidepanel/sidepanel.html"), "utf8",
	);
	const NativeObserver = globalThis.MutationObserver;
	const observers = [];
	let deliveries = 0;
	vi.stubGlobal("MutationObserver", class extends NativeObserver {
		constructor(callback) {
			super((records, observer) => {
				deliveries++;
				// Bound a broken implementation so the regression fails instead of
				// hanging the test runner's event loop forever.
				if (deliveries > 20) return observer.disconnect();
				callback(records, observer);
			});
			observers.push(this);
		}
	});
	vi.stubGlobal("chrome", {
		runtime: {
			onMessage: { addListener: vi.fn() },
			getURL: path => `chrome-extension://test/${path}`,
		},
		storage: {
			local: { get: vi.fn().mockResolvedValue({}), set: vi.fn(), remove: vi.fn() },
			session: { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
		},
		tabs: { query: vi.fn().mockResolvedValue([]) },
	});
	vi.spyOn(globalThis, "fetch").mockResolvedValue({
		ok: true,
		json: async () => [
			{ full_name: "alice/web", name: "web", owner: { login: "alice" } },
			{ full_name: "bob/api", name: "api", owner: { login: "bob" } },
		],
	});

	try {
		await import("../sidepanel.js");
		const { loadRepos } = await import("../auth.js");
		await loadRepos();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(deliveries).toBe(2);
		const repo = document.getElementById("repo");
		expect(repo.options).toHaveLength(3);
		repo.value = "alice/web";
		const search = document.getElementById("repoSearch");
		search.value = "wb";
		search.dispatchEvent(new Event("input"));
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(repo.options).toHaveLength(2);
		expect(repo.value).toBe("alice/web");
		expect(repo.size).toBeGreaterThan(1);
		repo.dispatchEvent(new Event("change"));
		expect(repo.size).toBe(1);
		search.dispatchEvent(new Event("focus"));
		expect(repo.size).toBeGreaterThan(1);
		expect(deliveries).toBe(2);
		// A later refresh must still be observed, while retaining the filter.
		await loadRepos();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(deliveries).toBe(4);
		expect(repo.options).toHaveLength(2);

		// A newly connected account / refresh must select the active page's
		// mapped repository after its options become available.
		search.value = "";
		search.dispatchEvent(new Event("input"));
		expect(repo.size).toBe(1);
		chrome.tabs.query.mockResolvedValue([
			{ url: "https://expenses.epsoftware.com.br/expenses" },
		]);
		fetch.mockImplementation(async url => ({
			ok: true,
			json: async () => String(url).endsWith("repo-url-map.json")
				? JSON.parse(readFileSync(resolve(process.cwd(), "repo-url-map.json"), "utf8"))
				: [{ full_name: "patoteGo/finance-conductor", name: "finance-conductor", owner: { login: "patoteGo" } }],
		}));
		await loadRepos();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(repo.value).toBe("patoteGo/finance-conductor");
	} finally {
		observers.forEach(observer => observer.disconnect());
	}
});
