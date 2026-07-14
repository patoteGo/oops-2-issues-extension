/**
 * record.js controller — lifecycle wiring (task 2/4).
 *
 * Mocks ScreenRecorder + the core DOM/status deps; drives the controller
 * through idle → recording → preview and asserts the view + getResult contract.
 * The state-machine rules are locked in record-session.test.js — this covers
 * the DOM/timer/recorder glue.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// session.js / ui.js touch document at import time; stub their exports.
vi.mock('../session.js', () => ({ el: {} }))
vi.mock('../ui.js', () => ({ setStatus: vi.fn() }))

// Mock the recorder engine: controllable start/stop/cancel + stop-sharing cb.
function makeMockRecorder({ hasAudio = true } = {}) {
  let onStopSharing = null
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue({
      blob: new Blob(['video-bytes'], { type: 'video/webm' }),
      hasAudio,
      durationMs: 5000,
    }),
    cancel: vi.fn(),
    onStopSharing: cb => {
      onStopSharing = cb
    },
    _fireStopSharing: () => onStopSharing && onStopSharing(),
  }
}

import { setStatus } from '../ui.js'
import { createRecordController } from '../record.js'

beforeEach(() => vi.clearAllMocks())

function setup({ hasAudio } = {}) {
  const recorder = makeMockRecorder({ hasAudio })
  // Match production HTML: these nodes carry the `hidden` attribute at rest.
  // The controller must clear `hidden` (not just set style.display='') to
  // reveal them — otherwise [hidden]{display:none} keeps them invisible.
  const videoEl = document.createElement('video')
  videoEl.hidden = true
  const timerEl = document.createElement('span')
  timerEl.hidden = true
  const badgeEl = document.createElement('span')
  const startBtn = document.createElement('button')
  const stopBtn = document.createElement('button')
  stopBtn.hidden = true
  const cancelBtn = document.createElement('button')
  cancelBtn.hidden = true
  const previewActions = document.createElement('div')
  previewActions.hidden = true
  const savedBadgeEl = document.createElement('span')
  savedBadgeEl.hidden = true
  const ctrl = createRecordController({
    Recorder: () => recorder,
    videoEl,
    timerEl,
    badgeEl,
    startBtn,
    stopBtn,
    cancelBtn,
    previewActions,
    savedBadgeEl,
  })
  return {
    ctrl,
    recorder,
    videoEl,
    timerEl,
    badgeEl,
    startBtn,
    stopBtn,
    cancelBtn,
    previewActions,
    savedBadgeEl,
  }
}

describe('record controller · start → stop → preview', () => {
  it('starts recording and ticks the timer', async () => {
    const { ctrl, recorder, timerEl } = setup()
    await ctrl.start()
    expect(recorder.start).toHaveBeenCalled()
    expect(setStatus).toHaveBeenCalledWith(
      'busy',
      expect.stringMatching(/record/i)
    )
    expect(timerEl.textContent).toMatch(/^\d\d:\d\d$/)
    ctrl.cancel() // stop the timer
  })

  it('moves to preview on stop and exposes the result', async () => {
    const { ctrl, videoEl, previewActions, stopBtn, startBtn } = setup()
    await ctrl.start()
    await ctrl.stop()
    // Video preview + Save/Re-record actions must be REVEALED. In production
    // these start with `hidden` — the controller must clear that attribute,
    // not just set style.display='' (which [hidden] overrides).
    expect(videoEl.hidden).toBe(false)
    expect(previewActions.hidden).toBe(false)
    expect(startBtn.hidden).toBe(true)
    expect(stopBtn.hidden).toBe(true)
    const result = ctrl.getResult()
    expect(result.blob.type).toBe('video/webm')
    expect(result.hasAudio).toBe(true)
  })

  it('surfaces a start failure as an error status', async () => {
    const recorder = makeMockRecorder()
    recorder.start.mockRejectedValue(new Error('getDisplayMedia blocked'))
    const ctrl = createRecordController({
      Recorder: () => recorder,
      videoEl: document.createElement('video'),
      timerEl: document.createElement('span'),
      badgeEl: document.createElement('span'),
    })
    await ctrl.start()
    expect(setStatus).toHaveBeenCalledWith('err', expect.any(String))
    expect(ctrl.getResult()).toBeNull()
  })
})

describe('record controller · no-audio badge', () => {
  it('shows the badge when the clip has no audio', async () => {
    const { ctrl, badgeEl } = setup({ hasAudio: false })
    await ctrl.start()
    await ctrl.stop()
    expect(badgeEl.hidden).toBe(false)
  })

  it('hides the badge when the clip has audio', async () => {
    const { ctrl, badgeEl } = setup({ hasAudio: true })
    await ctrl.start()
    await ctrl.stop()
    expect(badgeEl.hidden).toBe(true)
  })
})

describe('record controller · record-another after save', () => {
  it('after markSaved: shows the saved badge + start button (record another)', () => {
    const { ctrl, savedBadgeEl, startBtn, previewActions } = setup()
    // markSaved is what sidepanel.js calls after a successful upload; the
    // user must then be able to record another clip.
    ctrl.markSaved(15000, true)
    expect(savedBadgeEl.hidden).toBe(false)
    expect(savedBadgeEl.textContent).toMatch(/Recorded/)
    expect(savedBadgeEl.textContent).toMatch(/0:15/)
    expect(startBtn.hidden).toBe(false)
    expect(previewActions.hidden).toBe(true)
    expect(ctrl.getResult()).toBeNull()
  })

  it('reset() clears the saved badge and returns to a pristine idle view', () => {
    const { ctrl, savedBadgeEl, startBtn } = setup()
    ctrl.markSaved(5000, true)
    ctrl.reset()
    expect(savedBadgeEl.hidden).toBe(true)
    expect(startBtn.hidden).toBe(false)
  })
})

describe('record controller · cancel + re-record', () => {
  it('cancel drops the blob and returns to idle', async () => {
    const { ctrl, recorder } = setup()
    await ctrl.start()
    ctrl.cancel()
    expect(recorder.cancel).toHaveBeenCalled()
    expect(ctrl.getResult()).toBeNull()
  })

  it('re-record discards the first blob and restarts', async () => {
    const { ctrl, recorder } = setup()
    await ctrl.start()
    await ctrl.stop()
    expect(ctrl.getResult()).not.toBeNull()
    await ctrl.reRecord()
    expect(recorder.start).toHaveBeenCalledTimes(2)
  })
})
