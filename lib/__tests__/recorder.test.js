/**
 * ScreenRecorder — the oops 2 issues video capture engine.
 *
 * Pure media-capture module: getDisplayMedia + getUserMedia → MediaRecorder →
 * one in-memory webm Blob. Zero runtime deps (vanilla JS, matches lib/*.js).
 *
 * These tests mock the browser capture APIs (getDisplayMedia / getUserMedia /
 * MediaRecorder) at the boundary — never the class's own methods. Vertical TDD:
 * one behavior → one impl → repeat.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ScreenRecorder } from "../recorder.js";

beforeEach(() => {
	vi.useFakeTimers();
	delete globalThis.chrome;
	delete globalThis.AudioContext;
});

/** A minimal MediaStream stub exposing the methods ScreenRecorder calls. */
function fakeStream(tracks) {
	return {
		getTracks: () => tracks,
		getVideoTracks: () => tracks.filter((t) => t.kind === "video"),
		getAudioTracks: () => tracks.filter((t) => t.kind === "audio"),
	};
}

/**
 * Stand up a fake navigator.mediaDevices on the global so each test controls
 * exactly which APIs exist and how they resolve. Default: getDisplayMedia +
 * getUserMedia both present and resolve screen-only (no mic).
 */
function installMediaDevices({
	display = true,
	displayAudio = false,
	mic = true,
} = {}) {
	const videoTrack = stoppableTrack("video");
	const tabAudioTrack = stoppableTrack("audio");
	const audioTrack = stoppableTrack("audio");
	Object.defineProperty(navigator, "mediaDevices", {
		value: {
			getDisplayMedia: display
				? vi
						.fn()
						.mockResolvedValue(
							fakeStream(
								displayAudio ? [videoTrack, tabAudioTrack] : [videoTrack],
							),
						)
				: undefined,
			getUserMedia: mic
				? vi.fn().mockResolvedValue(fakeStream([audioTrack]))
				: vi.fn().mockRejectedValue(new Error("Permission denied")),
		},
		configurable: true,
		writable: true,
	});
	return { videoTrack, tabAudioTrack, audioTrack };
}

/** A MediaStreamTrack stub whose .stop() we can spy on. */
function stoppableTrack(kind) {
	return {
		kind,
		stop: vi.fn(),
		addEventListener: vi.fn(),
		getSettings: () => ({ frameRate: 30 }),
	};
}

describe("ScreenRecorder · start() guard rail", () => {
	it("throws when getDisplayMedia is unsupported (button-disable path)", async () => {
		installMediaDevices({ display: false });
		const recorder = new ScreenRecorder();
		await expect(recorder.start()).rejects.toThrow(/getDisplayMedia/i);
		expect(recorder.isRecording).toBe(false);
	});
});

/** A MediaRecorder stub that fires ondataavailable with a webm chunk on stop. */
function installMediaRecorder() {
	const chunks = [new Blob(["video-bytes"], { type: "video/webm" })];
	const instances = [];
	class FakeMediaRecorder {
		constructor(stream, opts) {
			this.stream = stream;
			this.opts = opts;
			this.state = "inactive";
			this.chunks = [];
			instances.push(this);
		}
		start() {
			this.state = "recording";
		}
		stop() {
			this.state = "inactive";
			this.ondataavailable?.({ data: chunks[0] });
			this.onstop?.();
		}
		addEventListener(ev, cb) {
			if (ev === "stop") this.onstop = cb;
		}
	}
	globalThis.MediaRecorder = FakeMediaRecorder;
	globalThis.MediaRecorder.isTypeSupported = () => true;
	// ponytail: mock MediaStream too — production uses `new MediaStream(tracks)`
	// (the stdlib muxer); jsdom has no real one, so the duck-typed fakeStream
	// from getDisplayMedia/getUserMedia must round-trip through a stub here.
	class FakeMediaStream {
		constructor(input) {
			const arr = Array.isArray(input) ? input : input ? [input] : [];
			this._tracks = arr;
		}
		getTracks() {
			return this._tracks;
		}
		getVideoTracks() {
			return this._tracks.filter((t) => t.kind === "video");
		}
		getAudioTracks() {
			return this._tracks.filter((t) => t.kind === "audio");
		}
	}
	globalThis.MediaStream = FakeMediaStream;
	return { instances };
}

describe("ScreenRecorder · start() + stop() happy path", () => {
	it("requests display media at 30fps", async () => {
		const { videoTrack } = installMediaDevices();
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalledWith(
			expect.objectContaining({
				video: expect.objectContaining({ frameRate: 30 }),
				audio: true,
			}),
		);
		expect(recorder.isRecording).toBe(true);
		videoTrack.stop.mockClear();
		await recorder.cancel();
	});

	it("stop() returns a single webm Blob", async () => {
		installMediaDevices();
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		const result = await recorder.stop();
		expect(result.blob).toBeInstanceOf(Blob);
		expect(result.blob.type).toMatch(/^video\/webm/);
		expect(recorder.isRecording).toBe(false);
	});
});

function installTabCapture(stream) {
	globalThis.chrome = {
		runtime: {},
		tabCapture: {
			capture: vi.fn((_opts, cb) => cb(stream)),
		},
	};
}

function installAudioContext() {
	globalThis.AudioContext = class {
		constructor() {
			this.dest = fakeStream([stoppableTrack("audio")]);
		}
		createMediaStreamDestination() {
			return { stream: this.dest };
		}
		createMediaStreamSource() {
			return { connect: vi.fn((node) => node), disconnect: vi.fn() };
		}
		createGain() {
			return {
				gain: { value: 1 },
				connect: vi.fn((node) => node),
				disconnect: vi.fn(),
			};
		}
		close() {}
	};
}

describe("ScreenRecorder · microphone handling", () => {
	it("records screen-only when all audio is denied/missing (hasAudio=false)", async () => {
		installMediaDevices({ displayAudio: false, mic: false });
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		const result = await recorder.stop();
		expect(result.hasAudio).toBe(false);
	});

	it("muxes the mic track when granted (hasAudio=true)", async () => {
		installMediaDevices({ mic: true });
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: expect.objectContaining({ echoCancellation: false }),
		});
		const result = await recorder.stop();
		expect(result.hasAudio).toBe(true);
	});

	it("mixes picker tab audio plus mic into one recorder audio track", async () => {
		installMediaDevices({ displayAudio: true, mic: true });
		installAudioContext();
		const { instances } = installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		expect(instances[0].stream.getAudioTracks()).toHaveLength(1);
		const result = await recorder.stop();
		expect(result.hasAudio).toBe(true);
	});

	it("captures picker tab audio even when mic is denied", async () => {
		installMediaDevices({ displayAudio: true, mic: false });
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		const result = await recorder.stop();
		expect(result.hasAudio).toBe(true);
	});

	it("falls back to chrome tabCapture audio when picker audio and mic are missing", async () => {
		const tabAudio = fakeStream([stoppableTrack("audio")]);
		installMediaDevices({ displayAudio: false, mic: false });
		installTabCapture(tabAudio);
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		const result = await recorder.stop();
		expect(globalThis.chrome.tabCapture.capture).toHaveBeenCalledWith(
			{ audio: true, video: false },
			expect.any(Function),
		);
		expect(result.hasAudio).toBe(true);
	});
});

describe("ScreenRecorder · cancel()", () => {
	it("stops every track and produces no recording", async () => {
		const { videoTrack } = installMediaDevices();
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		recorder.cancel();
		expect(videoTrack.stop).toHaveBeenCalled();
		expect(recorder.isRecording).toBe(false);
		// a subsequent stop() resolves with an empty webm
		const result = await recorder.stop();
		expect(result.blob.size).toBe(0);
	});
});

describe("ScreenRecorder · 60s hard cap", () => {
	it("auto-stops at 60s", async () => {
		installMediaDevices();
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();
		expect(recorder.isRecording).toBe(true);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(recorder.isRecording).toBe(false);
	});
});

describe('ScreenRecorder · browser "Stop sharing"', () => {
	it("ends the session cleanly when the video track ends", async () => {
		const { videoTrack } = installMediaDevices();
		installMediaRecorder();
		const recorder = new ScreenRecorder();
		await recorder.start();

		// The recorder subscribes to the video track's 'ended' event.
		const endedCall = videoTrack.addEventListener.mock.calls.find(
			([ev]) => ev === "ended",
		);
		expect(endedCall).toBeTruthy();

		// Fire it (the user clicked the browser "Stop sharing" bar).
		const listener = endedCall[1];
		const stopPromise = listener();
		const result = await stopPromise;
		expect(result.blob).toBeInstanceOf(Blob);
		expect(recorder.isRecording).toBe(false);
	});
});
