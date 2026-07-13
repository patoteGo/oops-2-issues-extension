/**
 * buildVideoMarkdown — the embed helper for the Save path (task 3/4).
 *
 * Pure: turns an uploaded webm URL into the markdown block embedded in the task
 * description. Mirrors the screenshot `![label](url)` convention but emits an
 * inline `<video controls>` (Tiptap renders it inline; no dedicated field, per
 * PRD). Tested in isolation — the upload glue is covered separately.
 */
import { describe, it, expect } from 'vitest'
import { buildVideoMarkdown } from '../logic.js'

describe('buildVideoMarkdown · the video embed block', () => {
  it('emits a <video controls src> block for a bare URL', () => {
    expect(buildVideoMarkdown('https://blob.test/v.webm')).toBe(
      '<video controls src="https://blob.test/v.webm"></video>'
    )
  })

  it('wraps in a numbered item when an index is provided', () => {
    expect(
      buildVideoMarkdown('https://blob.test/v.webm', { index: 1 })
    ).toBe('1. <video controls src="https://blob.test/v.webm"></video>')
  })

  it('prepends a caption line when one is provided', () => {
    const out = buildVideoMarkdown('https://blob.test/v.webm', {
      caption: 'repro of the flicker',
    })
    expect(out).toContain('repro of the flicker')
    expect(out).toContain('<video controls')
  })

  it('returns empty string for a missing URL', () => {
    expect(buildVideoMarkdown('')).toBe('')
    expect(buildVideoMarkdown(null)).toBe('')
    expect(buildVideoMarkdown(undefined)).toBe('')
  })
})
