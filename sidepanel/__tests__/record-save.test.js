/**
 * saveRecording — the Save-path glue (task 3/4).
 *
 * Uploads the finalized webm Blob via EpApi.uploadFile, then returns the
 * markdown block to embed in the task description (the caller appends it to the
 * editor buffer). Re-records never reach here — no Blob is created until Save.
 * EpApi + token resolution are mocked; we assert the upload contract + the
 * returned markdown + the never-upload-on-failure rule.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  uploadFile: vi.fn(),
  getToken: vi.fn(),
}))

// Inject `api` directly so the tests don't depend on `new EpApi()` (biome
// arrow-ifies a function mock, which then can't be constructed).
const fakeApi = () => ({ uploadFile: mocks.uploadFile })

import { saveRecording } from '../record-save.js'

beforeEach(() => vi.clearAllMocks())

describe('saveRecording · upload contract', () => {
  it('uploads the webm blob as video/webm and returns the <video> markdown', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' })
    mocks.getToken.mockReturnValue('tok-1')
    mocks.uploadFile.mockResolvedValueOnce({ url: 'https://blob/v.webm' })

    const res = await saveRecording({
      blob,
      hasAudio: true,
      durationMs: 5000,
      getToken: mocks.getToken,
      api: fakeApi(),
    })

    expect(mocks.uploadFile).toHaveBeenCalledWith(
      'tok-1',
      blob,
      expect.stringMatching(/\.webm$/),
      expect.any(String)
    )
    expect(res.markdown).toBe(
      '<video controls src="https://blob/v.webm"></video>'
    )
    // The uploaded file must be surfaced so the caller can attach it to the
    // task (otherwise the video never reaches the Attachments panel).
    expect(res.file).toEqual({ url: 'https://blob/v.webm' })
  })

  it('accepts the shared api factory used by sidepanel.js', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' })
    mocks.getToken.mockReturnValue('tok-1')
    mocks.uploadFile.mockResolvedValueOnce({ url: 'https://blob/v.webm' })

    await saveRecording({
      blob,
      hasAudio: true,
      durationMs: 1000,
      getToken: mocks.getToken,
      api: fakeApi,
    })

    expect(mocks.uploadFile).toHaveBeenCalledTimes(1)
  })

  it('includes the duration in the upload description + the badge when silent', async () => {
    const blob = new Blob(['x'], { type: 'video/webm' })
    mocks.getToken.mockReturnValue('tok-1')
    mocks.uploadFile.mockResolvedValueOnce({ url: 'https://blob/v.webm' })

    await saveRecording({
      blob,
      hasAudio: false,
      durationMs: 8000,
      getToken: mocks.getToken,
      api: fakeApi(),
    })

    const descArg = mocks.uploadFile.mock.calls[0][3]
    expect(descArg).toMatch(/no audio/i)
    expect(descArg).toMatch(/8s|00:08/i)
  })
})

describe('saveRecording · failure modes', () => {
  it('throws (and embeds nothing) when the upload fails', async () => {
    mocks.getToken.mockReturnValue('tok-1')
    mocks.uploadFile.mockRejectedValueOnce(new Error('upload 500'))
    await expect(
      saveRecording({
        blob: new Blob(['x'], { type: 'video/webm' }),
        hasAudio: true,
        durationMs: 1000,
        getToken: mocks.getToken,
        api: fakeApi(),
      })
    ).rejects.toThrow(/upload 500/)
  })

  it('throws when there is no auth token', async () => {
    mocks.getToken.mockReturnValue(null)
    await expect(
      saveRecording({
        blob: new Blob(['x'], { type: 'video/webm' }),
        hasAudio: true,
        durationMs: 1000,
        getToken: mocks.getToken,
      })
    ).rejects.toThrow(/auth|token|sign in/i)
    expect(mocks.uploadFile).not.toHaveBeenCalled()
  })
})
