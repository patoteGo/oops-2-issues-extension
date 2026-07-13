/**
 * oops 2 issues - Background service worker (module).
 *
 * Responsibilities:
 *  1. Open the side panel on toolbar click.
 *  2. CAPTURE_FULL  — captureVisibleTab + extractMetadata, return PNG + meta.
 *  3. CAPTURE_REGION — capture full PNG, inject the region selector overlay
 *     (CSS + JS) into the active tab, return PNG + meta. The selector sends
 *     REGION_SELECTED/REGION_CANCELLED back to the side panel directly.
 *  4. Notify the side panel on tab switch/navigation.
 */

import { extractMetadata } from "./content.js";

function safeSendMessage(message) {
	try {
		chrome.runtime.sendMessage(message).catch(() => {
			/* panel closed — ignore */
		});
	} catch {
		/* ignore */
	}
}

async function getActiveTab() {
	const [tab] = await chrome.tabs.query({
		active: true,
		lastFocusedWindow: true,
	});
	return tab;
}

function isRestrictedUrl(url) {
	if (!url) return true;
	return (
		url.startsWith("chrome://") ||
		url.startsWith("chrome-extension://") ||
		url.startsWith("edge://") ||
		url.startsWith("about:") ||
		url.startsWith("https://chrome.google.com/webstore") ||
		url.startsWith("https://chromewebstore.google.com")
	);
}

/** Capture PNG + scrape metadata for the active tab. */
async function captureVisible() {
	const tab = await getActiveTab();
	if (!tab || typeof tab.id !== "number")
		throw new Error("No active tab found.");
	if (isRestrictedUrl(tab.url)) {
		throw new Error(
			"Cannot capture this page (browser-internal or restricted URL). Open a normal web page.",
		);
	}

	const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
		format: "png",
	});

	const results = await chrome.scripting.executeScript({
		target: { tabId: tab.id },
		func: extractMetadata,
	});
	const metadata = results && results[0] ? results[0].result : null;

	return { dataUrl, metadata, tabId: tab.id };
}

/** Inject the region selector overlay (styles + behavior) into a tab. */
async function injectSelector(tabId) {
	await chrome.scripting.insertCSS({
		target: { tabId },
		files: ["selector.css"],
	});
	await chrome.scripting.executeScript({
		target: { tabId },
		files: ["selector.js"],
	});
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (!message || typeof message !== "object") return false;

	if (message.action === "CAPTURE_FULL") {
		captureVisible()
			.then(({ dataUrl, metadata }) =>
				sendResponse({ ok: true, dataUrl, metadata }),
			)
			.catch((error) =>
				sendResponse({ ok: false, error: error?.message || String(error) }),
			);
		return true;
	}

	if (message.action === "CAPTURE_REGION") {
		captureVisible()
			.then(async ({ dataUrl, metadata, tabId }) => {
				await injectSelector(tabId);
				sendResponse({ ok: true, dataUrl, metadata, tabId });
			})
			.catch((error) =>
				sendResponse({ ok: false, error: error?.message || String(error) }),
			);
		return true;
	}

	return false;
});

chrome.runtime.onInstalled.addListener(() => {
	chrome.sidePanel
		.setPanelBehavior({ openPanelOnActionClick: true })
		.catch((error) =>
			console.error("[oops 2 issues] setPanelBehavior failed:", error),
		);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
	safeSendMessage({ action: "TAB_CHANGED", tabId: activeInfo.tabId });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
	if (!tab || !tab.active) return;
	if (changeInfo.url || changeInfo.status === "complete") {
		safeSendMessage({
			action: "TAB_UPDATED",
			tabId,
			url: tab.url,
			title: tab.title,
		});
	}
});
