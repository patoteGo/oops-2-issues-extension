/**
 * oops 2 issues — recording session controller (task 2/4).
 *
 * Wires the pure record-session state machine to the ScreenRecorder engine and
 * the side-panel DOM. Renders the per-phase view:
 *   idle      → shows the Record button
 *   recording → live elapsed timer, Stop + Cancel; auto-stops at 60s or on
 *               browser "Stop sharing"
 *   preview   → inline <video controls> + Re-record + Save, with a visible
 *               no-audio badge when the mic was absent/denied
 *
 * Thin I/O over record-session.js + recorder.js — the transition rules and view
 * derivation are locked in record-session.test.js.
 */
import { ScreenRecorder } from "../lib/recorder.js";
import {
	createSession,
	startRecording,
	tick,
	stopRecording,
	cancel,
	reRecord,
} from "./record-session.js";
import { el, state } from "./session.js";
import { setStatus } from "./ui.js";

const TICK_MS = 200;
const MIC_PERMISSION_KEY = "micPermissionReady";

function fmt(ms) {
	const total = Math.floor(ms / 1000);
	const m = String(Math.floor(total / 60)).padStart(2, "0");
	const s = String(total % 60).padStart(2, "0");
	return `${m}:${s}`;
}

async function hasMicPermission() {
	if (!globalThis.chrome?.storage?.local) return true;
	const stored = await chrome.storage.local.get(MIC_PERMISSION_KEY);
	if (stored[MIC_PERMISSION_KEY]) return true;
	try {
		const perm = await navigator.permissions?.query?.({ name: "microphone" });
		if (perm?.state === "granted") {
			await chrome.storage.local.set({ [MIC_PERMISSION_KEY]: true });
			return true;
		}
	} catch {
		/* permissions api may not expose microphone in extension pages */
	}
	return false;
}

function openMicPermissionWindow() {
	const url = chrome.runtime.getURL("sidepanel/mic-permission.html");
	// Use the extension popup API (not window.open): it produces a proper
	// popup window and isn't an open-redirect surface — the URL is built from
	// chrome.runtime.getURL, not user input.
	if (chrome.windows?.create) {
		chrome.windows.create({
			url,
			type: "popup",
			width: 460,
			height: 360,
		});
	}
}

/** Create a controller bound to the sidepanel record-view DOM. */
export function createRecordController(opts = {}) {
	const makeRecorder = opts.Recorder ?? (() => new ScreenRecorder());
	const videoEl = opts.videoEl ?? el.recordVideo;
	const timerEl = opts.timerEl ?? el.recordTimer;
	const badgeEl = opts.badgeEl ?? el.recordNoAudio;
	const savedBadgeEl = opts.savedBadgeEl ?? el.recordSavedBadge;
	const startBtn = opts.startBtn ?? el.recordStartBtn;
	const stopBtn = opts.stopBtn ?? el.recordStopBtn;
	const cancelBtn = opts.cancelBtn ?? el.recordCancelBtn;
	const previewActions = opts.previewActions ?? el.recordPreviewActions;
	const status = opts.setStatus ?? setStatus;

	let session = createSession();
	const recorder = makeRecorder();
	let timerHandle = null;
	let savedInfo = null;

	/** Render the current session into the view. */
	function render() {
		if (timerEl) timerEl.textContent = fmt(session.elapsedMs);
		if (savedBadgeEl) {
			const showSaved = session.phase === "idle" && savedInfo;
			savedBadgeEl.hidden = !showSaved;
			if (showSaved) {
				savedBadgeEl.textContent = `✓ Recorded ${fmt(savedInfo.durationMs)}${
					savedInfo.hasAudio ? "" : " (no audio)"
				}`;
			}
		}
		// ponytail: toggle the `hidden` property, not style.display. In production
		// these nodes start with the `hidden` attribute; setting style.display=''
		// does NOT override [hidden]{display:none}, so the preview would never
		// appear. The property clears the attribute and respects CSS.
		if (videoEl) {
			const showVid = session.phase === "preview" && session.blob;
			videoEl.hidden = !showVid;
			if (showVid) videoEl.src = URL.createObjectURL(session.blob);
		}
		toggleButtons();
	}

	/** Show/hide the controls per phase (idle/recording/preview). */
	function toggleButtons() {
		const show = (node, on) => {
			if (node) node.hidden = !on;
		};
		const recording = session.phase === "recording";
		const preview = session.phase === "preview";
		show(startBtn, !recording && !preview);
		show(stopBtn, recording);
		show(cancelBtn, recording || preview);
		show(timerEl, recording);
		show(previewActions, preview);
		show(badgeEl, preview && !session.hasAudio);
	}

	function clearTimer() {
		if (timerHandle) {
			clearInterval(timerHandle);
			timerHandle = null;
		}
	}

	function startTimer() {
		clearTimer();
		timerHandle = setInterval(() => {
			session = tick(session, TICK_MS);
			if (session.capReached) {
				stop();
			} else {
				render();
			}
		}, TICK_MS);
	}

	/** Begin a recording session. */
	async function start() {
		if (!(await hasMicPermission())) {
			openMicPermissionWindow();
			status("idle", "Allow microphone in the popup, then click Record again.");
			return;
		}
		savedInfo = null;
		session = startRecording(createSession());
		render();
		try {
			await recorder.start();
			recorder.onStopSharing(stop);
			status("busy", "Recording…");
			startTimer();
		} catch (err) {
			session = cancel(session);
			status("err", err?.message || "Could not start recording.");
		}
	}

	/** Stop and move to preview. */
	async function stop() {
		if (session.phase !== "recording") return;
		clearTimer();
		try {
			const result = await recorder.stop();
			session = stopRecording(session, result);
			// Publish the pending Recording to state — every feature reads it there,
			// like Screenshots/References. Cleared on Save/Cancel/re-record/reset.
			state.pendingRecording = {
				blob: session.blob,
				hasAudio: session.hasAudio,
				durationMs: session.durationMs,
			};
			render();
			status(
				"ok",
				session.hasAudio
					? `Recorded ${fmt(session.durationMs)}.`
					: `Recorded ${fmt(session.durationMs)} (no audio).`,
			);
		} catch (err) {
			session = cancel(session);
			state.pendingRecording = null;
			render();
			status("err", err?.message || "Stop failed.");
		}
	}

	/** Discard the blob and start over. */
	async function rererecord() {
		session = reRecord(session);
		state.pendingRecording = null;
		render();
		await start();
	}

	/** Cancel and return to idle. */
	function doCancel() {
		clearTimer();
		try {
			recorder.cancel();
		} catch {
			/* already torn down */
		}
		session = cancel(session);
		state.pendingRecording = null;
		render();
		status("idle", "Recording cancelled.");
	}

	/** Mark the just-saved recording so the card shows it + allows another. */
	function markSaved(durationMs, hasAudio) {
		savedInfo = { durationMs, hasAudio };
		session = cancel(session);
		state.pendingRecording = null;
		render();
	}

	/** Reset to pristine idle (called by resetForm after a task is created). */
	function reset() {
		clearTimer();
		savedInfo = null;
		session = createSession();
		state.pendingRecording = null;
		render();
	}

	return {
		start,
		stop,
		reRecord: rererecord,
		cancel: doCancel,
		markSaved,
		reset,
		/** Test seam: the live session snapshot. */
		_session: () => session,
	};
}
