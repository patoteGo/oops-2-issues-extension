/**
 * record-session — the BugSnap recording session state machine (task 2/4).
 *
 * Pure reducer over the recording session: idle → recording (with an elapsed
 * timer) → preview (blob + hasAudio + durationMs). Re-record discards the blob
 * and restarts; cancel returns to idle. The DOM controller (sidepanel.js) wires
 * this to the ScreenRecorder engine + the view elements. Kept pure so the
 * transition rules + derived view-state are fully testable without a DOM.
 */
import { describe, it, expect } from 'vitest'
import {
  createSession,
  startRecording,
  tick,
  stopRecording,
  cancel,
  reRecord,
} from '../record-session.js'

describe('createSession · initial state', () => {
  it('starts idle with zero elapsed and no blob', () => {
    const s = createSession()
    expect(s.phase).toBe('idle')
    expect(s.elapsedMs).toBe(0)
    expect(s.blob).toBeNull()
    expect(s.hasAudio).toBe(false)
    expect(s.error).toBeNull()
  })
})

describe('startRecording', () => {
  it('moves idle → recording and resets the timer', () => {
    const s = startRecording(createSession())
    expect(s.phase).toBe('recording')
    expect(s.elapsedMs).toBe(0)
  })

  it('refuses to start when already recording', () => {
    const recording = startRecording(createSession())
    const s = startRecording(recording)
    expect(s.phase).toBe('recording')
    expect(s.error).toMatch(/already recording/i)
  })
})

describe('tick (the live timer)', () => {
  it('advances elapsedMs only while recording', () => {
    let s = startRecording(createSession())
    s = tick(s, 1000)
    s = tick(s, 1000)
    expect(s.elapsedMs).toBe(2000)
  })

  it('is a no-op when not recording', () => {
    const idle = createSession()
    expect(tick(idle, 5000).elapsedMs).toBe(0)
  })

  it('auto-stops at the 60s cap', () => {
    let s = startRecording(createSession())
    s = tick(s, 60_000)
    expect(s.phase).toBe('recording') // tick marks due; stopRecording finalizes
    expect(s.capReached).toBe(true)
  })
})

describe('stopRecording → preview', () => {
  it('moves recording → preview with the blob + audio flag + duration', () => {
    const blob = { size: 1234, type: 'video/webm' }
    let s = startRecording(createSession())
    s = tick(s, 4000)
    s = stopRecording(s, { blob, hasAudio: true, durationMs: 4000 })
    expect(s.phase).toBe('preview')
    expect(s.blob).toBe(blob)
    expect(s.hasAudio).toBe(true)
    expect(s.durationMs).toBe(4000)
  })
})

describe('reRecord', () => {
  it('discards the blob and restarts recording from preview', () => {
    const blob = { size: 1, type: 'video/webm' }
    let s = startRecording(createSession())
    s = stopRecording(s, { blob, hasAudio: false, durationMs: 1000 })
    expect(s.blob).toBe(blob)
    s = reRecord(s)
    expect(s.phase).toBe('recording')
    expect(s.blob).toBeNull()
    expect(s.elapsedMs).toBe(0)
  })

  it('refuses to re-record outside preview', () => {
    const s = reRecord(createSession())
    expect(s.phase).toBe('idle')
    expect(s.error).toMatch(/preview/i)
  })
})

describe('cancel', () => {
  it('returns to idle from any phase, dropping the blob', () => {
    const blob = { size: 1, type: 'video/webm' }
    let s = startRecording(createSession())
    s = stopRecording(s, { blob, hasAudio: true, durationMs: 500 })
    s = cancel(s)
    expect(s.phase).toBe('idle')
    expect(s.blob).toBeNull()
    expect(s.elapsedMs).toBe(0)
  })

  it('clears any error', () => {
    const s = cancel({ ...createSession(), error: 'boom' })
    expect(s.error).toBeNull()
  })
})
