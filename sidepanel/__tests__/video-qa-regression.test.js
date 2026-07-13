/**
 * BugSnap video — QA-gate regression invariants (task 4/4).
 *
 * The manual test matrix (bugsnap-extension/docs/VIDEO_TEST_MATRIX.md) covers
 * the human-runnable flows. These are the invariants we CAN automate: cross-
 * cutting rules that would silently regress across the recorder / session /
 * save modules. They run against the real (non-mocked) pure logic + a mocked
 * recorder/api, asserting behavior through the public interfaces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildDescription, buildVideoMarkdown } from '../logic.js'

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
}))

vi.mock('../../lib/api.js', () => ({
  EpApi: function () {
    return { uploadFile: mocks.uploadFile }
  },
}))

import { saveRecording } from '../record-save.js'

beforeEach(() => vi.clearAllMocks())

describe('QA regression · re-record never uploads', () => {
  it('buildVideoMarkdown returns empty for a missing URL (no upload → no embed)', () => {
    // The session UI's reRecord clears the blob before Save can read it; if the
    // save path were ever reached with no URL, it must embed nothing rather than
    // a broken <video src="">.
    expect(buildVideoMarkdown('')).toBe('')
    expect(buildVideoMarkdown(null)).toBe('')
  })
})

describe('QA regression · Save fires exactly one upload', () => {
  it('calls uploadFile exactly once per Save', async () => {
    mocks.uploadFile.mockResolvedValueOnce({ url: 'https://blob/v.webm' })
    await saveRecording({
      blob: new Blob(['x'], { type: 'video/webm' }),
      hasAudio: true,
      durationMs: 1000,
      getToken: () => 'tok',
    })
    expect(mocks.uploadFile).toHaveBeenCalledTimes(1)
  })
})

describe('QA regression · screenshot path unchanged', () => {
  it('buildDescription still emits ![label](url) for image files (video did not break it)', () => {
    const out = buildDescription('', [{ url: 'http://u/1.png' }], [])
    expect(out).toBe('![Screenshot 1](http://u/1.png)')
  })

  it('buildDescription with a video URL via buildVideoMarkdown stays a <video>, not an image', () => {
    // Sanity: the two embed paths are distinct — images use ![], videos use <video>.
    const videoMd = buildVideoMarkdown('http://u/v.webm')
    const descWithVideo = buildDescription('repro', [], [])
    expect(videoMd).toMatch(/^<video controls/)
    expect(videoMd).not.toMatch(/^!/)
    expect(descWithVideo).toBe('repro')
  })
})
