import { describe, it, expect, beforeEach } from 'vitest'
import { extractMetadata } from '../content.js'

/**
 * extractMetadata runs in the PAGE context and reads several host objects
 * (window.location, document.title, navigator, screen, window.getSelection).
 * Here we exercise it under jsdom and stub the bits jsdom can't set natively.
 */

// jsdom makes window.location non-configurable; replace it wholesale.
function setLocation(href) {
  Object.defineProperty(window, 'location', {
    value: { href },
    configurable: true,
    writable: true,
  })
}

describe('extractMetadata', () => {
  beforeEach(() => {
    setLocation('https://app.example.com/page?x=1')
    document.title = 'Example Page'
  })

  it('returns an object with the documented keys', () => {
    const m = extractMetadata()
    expect(m).toStrictEqual(
      expect.objectContaining({
        url: expect.any(String),
        title: expect.any(String),
        referrer: expect.any(String),
        userAgent: expect.any(String),
        language: expect.any(String),
        platform: expect.any(String),
        screen: expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
          availWidth: expect.any(Number),
          availHeight: expect.any(Number),
        }),
        viewport: expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
          devicePixelRatio: expect.any(Number),
          scrollX: expect.any(Number),
          scrollY: expect.any(Number),
        }),
        selection: expect.any(String),
        capturedAt: expect.any(String),
      })
    )
  })

  it('captures the current location href and document title', () => {
    const m = extractMetadata()
    expect(m.url).toBe('https://app.example.com/page?x=1')
    expect(m.title).toBe('Example Page')
  })

  it('falls back to an empty string when document.title is unset', () => {
    document.title = ''
    const m = extractMetadata()
    expect(m.title).toBe('')
  })

  it('produces a valid ISO-8601 capturedAt timestamp', () => {
    const m = extractMetadata()
    const ms = Date.parse(m.capturedAt)
    expect(Number.isFinite(ms)).toBe(true)
  })

  it('returns an empty string for selection when nothing is selected', () => {
    // jsdom has no real selection; the try/catch in extractMetadata guards this.
    const m = extractMetadata()
    expect(m.selection).toBe('')
  })

  it('reflects the window inner size in viewport', () => {
    const m = extractMetadata()
    expect(m.viewport.width).toBe(window.innerWidth)
    expect(m.viewport.height).toBe(window.innerHeight)
  })

  it('reads navigator identity fields', () => {
    const m = extractMetadata()
    expect(m.userAgent).toBe(navigator.userAgent)
    expect(m.language).toBe(navigator.language)
  })
})
