/**
 * ScreenRecorder — BugSnap video capture engine (PRD: screen video recording).
 *
 * Pure media-capture module: getDisplayMedia + getUserMedia → MediaRecorder →
 * one in-memory webm Blob. Zero runtime deps (vanilla JS, matches lib/*.js).
 *
 * Public contract:
 *   get isRecording                // boolean
 *   async start()                  // throws if getDisplayMedia missing/denied
 *   async stop()                   // → { blob, hasAudio, durationMs }
 *   cancel()                       // stops every track, no blob
 *   onStopSharing(cb)              // fires when the user hits browser "Stop sharing"
 */

/** 60s hard cap (PRD). Auto-stops to protect Blob quota. */
const MAX_DURATION_MS = 60_000

/** Codec chain: vp9+opus first, fall back to plain webm. */
function pickMimeType() {
  const candidates = ['video/webm;codecs=vp9,opus', 'video/webm']
  for (const type of candidates) {
    if (globalThis.MediaRecorder?.isTypeSupported?.(type)) return type
  }
  return 'video/webm'
}

async function captureTabAudio() {
  const capture = globalThis.chrome?.tabCapture?.capture
  if (typeof capture !== 'function') return null
  return new Promise(resolve => {
    try {
      capture({ audio: true, video: false }, stream => {
        const err = globalThis.chrome?.runtime?.lastError
        if (err) {
          console.debug('[BugSnap video debug]', 'recorder:tab-audio-error', {
            message: err.message,
          })
        }
        resolve(stream || null)
      })
    } catch (err) {
      console.debug('[BugSnap video debug]', 'recorder:tab-audio-error', {
        message: err?.message,
      })
      resolve(null)
    }
  })
}

export class ScreenRecorder {
  #recording = false
  #hasAudio = false
  #mediaRecorder = null
  #stream = null
  #chunks = []
  #startedAt = 0
  #durationMs = 0
  #capTimer = null
  #stopSharingListener = null
  #audioContext = null
  #audioNodes = []

  get isRecording() {
    return this.#recording
  }

  /**
   * Start capturing. Requests the desktop share (cursor included automatically
   * by getDisplayMedia). Mic is optional: on denial/absence records screen-only
   * with hasAudio=false. Throws when getDisplayMedia is unsupported — the UI
   * uses this to disable the Record button.
   */
  async start() {
    const md = navigator.mediaDevices
    if (!md || typeof md.getDisplayMedia !== 'function') {
      throw new Error('getDisplayMedia is not supported in this context')
    }

    const displayStream = await md.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    })

    let audioStream = null
    try {
      audioStream = await md.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true,
        },
      })
    } catch (err) {
      console.debug('[BugSnap video debug]', 'recorder:mic-unavailable', {
        message: err?.message,
      })
    }
    const tabAudioStream = audioStream ? null : await captureTabAudio()

    const rawTracks = [
      ...displayStream.getTracks(),
      ...(audioStream?.getTracks() ?? []),
      ...(tabAudioStream?.getTracks() ?? []),
    ]
    const { tracks, audioContext } = this.#mixAudio(rawTracks)
    this.#audioContext = audioContext
    this.#hasAudio = tracks.some(t => t.kind === 'audio')
    console.debug('[BugSnap video debug]', 'recorder:start-streams', {
      displayAudioTracks: displayStream.getAudioTracks?.().length ?? 0,
      micAudioTracks: audioStream?.getAudioTracks?.().length ?? 0,
      tabAudioTracks: tabAudioStream?.getAudioTracks?.().length ?? 0,
      audioTrackLabels: rawTracks
        .filter(t => t.kind === 'audio')
        .map(t => t.label || 'unlabeled'),
      totalTracks: tracks.length,
      hasAudio: this.#hasAudio,
    })

    // ponytail: new MediaStream(tracks) is the stdlib way; the prior
    // duck-typed {getTracks} stub throws "not of type MediaStream".
    const muxed = new MediaStream(tracks)
    this.#stream = muxed

    this.#chunks = []
    this.#mediaRecorder = new MediaRecorder(muxed, {
      mimeType: pickMimeType(),
    })
    this.#mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) this.#chunks.push(e.data)
    }

    // Browser "Stop sharing" → delegate to the controller's stop (registered
    // via onStopSharing) so the session + UI update. If no listener was wired,
    // fall back to our own stop. Routing the controller here (not an internal
    // stop) is what keeps the blob and updates the timer/status.
    displayStream.getVideoTracks()[0]?.addEventListener?.('ended', () => {
      if (typeof this.#stopSharingListener === 'function')
        return this.#stopSharingListener()
      return this.stop()
    })

    this.#startedAt = Date.now()
    this.#recording = true
    this.#mediaRecorder.start()
    this.#capTimer = setTimeout(() => this.stop(), MAX_DURATION_MS)
  }

  /** Stop and resolve { blob, hasAudio, durationMs }. */
  async stop() {
    if (!this.#recording)
      return {
        blob: new Blob([], { type: 'video/webm' }),
        hasAudio: false,
        durationMs: 0,
      }
    return new Promise(resolve => {
      const finalize = () => {
        this.#teardown()
        const blob = new Blob(this.#chunks, { type: 'video/webm' })
        resolve({
          blob,
          hasAudio: this.#hasAudio,
          durationMs: this.#durationMs,
        })
      }
      this.#mediaRecorder.addEventListener('stop', finalize)
      this.#durationMs = Date.now() - this.#startedAt
      if (this.#mediaRecorder.state !== 'inactive') this.#mediaRecorder.stop()
      else finalize()
    })
  }

  /** Stop every track, no blob. */
  cancel() {
    if (!this.#recording) return
    this.#teardown()
    this.#chunks = []
  }

  /** Register a callback for the browser "Stop sharing" gesture. */
  onStopSharing(cb) {
    this.#stopSharingListener = cb
  }

  #mixAudio(tracks) {
    const audio = tracks.filter(t => t.kind === 'audio')
    if (audio.length < 2 || typeof AudioContext !== 'function') {
      return { tracks, audioContext: null }
    }
    const audioContext = new AudioContext()
    const destination = audioContext.createMediaStreamDestination()
    const nodes = []
    audio.forEach(track => {
      const source = audioContext.createMediaStreamSource(
        new MediaStream([track])
      )
      const gain = audioContext.createGain()
      gain.gain.value = 1
      source.connect(gain).connect(destination)
      nodes.push(source, gain)
    })
    this.#audioNodes = nodes
    return {
      tracks: [
        ...tracks.filter(t => t.kind !== 'audio'),
        ...destination.stream.getAudioTracks(),
      ],
      audioContext,
    }
  }

  #teardown() {
    clearTimeout(this.#capTimer)
    this.#capTimer = null
    this.#recording = false
    this.#stream?.getTracks().forEach(t => t.stop())
    this.#stream = null
    this.#audioNodes.forEach(n => n.disconnect?.())
    this.#audioNodes = []
    this.#audioContext?.close?.()
    this.#audioContext = null
    this.#mediaRecorder = null
  }
}
