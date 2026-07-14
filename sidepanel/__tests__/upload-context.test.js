/**
 * uploadContext — derives the bound uploader ctx from the active Account + the
 * selected repo, and owns the "not connected" / "no repository" guards shared
 * by every upload path (submit, Save-button). Relocated out of saveRecording,
 * where they were ambient rather than recording-specific.
 */
import { describe, it, expect } from "vitest";
import { uploadContext } from "../session.js";

const baseState = { token: "tok", user: { login: "me" }, assetsRepo: null };

describe("uploadContext", () => {
	it("splits owner/name and maps the Account fields onto the ctx", () => {
		expect(uploadContext(baseState, "me/repo")).toEqual({
			token: "tok",
			owner: "me",
			repo: "repo",
			assetsRepo: null,
			login: "me",
		});
	});

	it("carries the configured Assets Repository + login when present", () => {
		const ctx = uploadContext(
			{ token: "tok", user: { login: "you" }, assetsRepo: "you/assets" },
			"org/proj",
		);
		expect(ctx).toMatchObject({
			owner: "org",
			repo: "proj",
			assetsRepo: "you/assets",
			login: "you",
		});
	});

	it("throws when there is no auth token", () => {
		expect(() =>
			uploadContext({ ...baseState, token: null }, "me/repo"),
		).toThrow(/token|connect/i);
	});

	it("throws when no repository is selected", () => {
		expect(() => uploadContext(baseState, "")).toThrow(/repository/i);
		expect(() => uploadContext(baseState, "no-slash")).toThrow(/repository/i);
	});
});
