import { describe, it, expect } from 'vitest'
import { buildSource, buildDescription, normalizeShots } from '../logic.js'

describe('buildSource', () => {
  it('returns null for null/undefined/empty meta', () => {
    expect(buildSource(null)).toBeNull()
    expect(buildSource(undefined)).toBeNull()
    expect(buildSource({})).toBeNull()
  })

  it('builds a source from full metadata', () => {
    const meta = {
      url: 'https://app.example.com/x',
      title: 'Page X',
      capturedAt: '2026-06-17T00:00:00.000Z',
      viewport: { width: 1440 }, // must be ignored
    }
    expect(buildSource(meta)).toEqual({
      url: 'https://app.example.com/x',
      title: 'Page X',
      capturedAt: '2026-06-17T00:00:00.000Z',
    })
  })

  it('keeps only the fields that are present', () => {
    expect(buildSource({ url: 'https://a.test' })).toEqual({
      url: 'https://a.test',
    })
    expect(buildSource({ title: 'Only title' })).toEqual({
      title: 'Only title',
    })
  })

  it('treats a url that is an empty string as absent', () => {
    // empty string is falsy -> not copied -> object stays empty -> null
    expect(buildSource({ url: '', title: '' })).toBeNull()
  })
})

describe('buildDescription', () => {
  const file = (url, description) => ({ url, description })

  it('returns just the trimmed user markdown when there are no files', () => {
    expect(buildDescription('  hi  ', [], [])).toBe('hi')
  })

  it('returns empty string when nothing is provided', () => {
    expect(buildDescription('', [], [])).toBe('')
    expect(buildDescription('   ', [], [])).toBe('')
  })

  it('renders a single screenshot with no source as a bare image', () => {
    const out = buildDescription('', [file('http://u/1.png')], [])
    expect(out).toBe('![Screenshot 1](http://u/1.png)')
  })

  it('uses the description as the alt label and caption', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png', 'Login button broken')],
      []
    )
    expect(out).toBe(
      '![Login button broken](http://u/1.png)\n*Login button broken*'
    )
  })

  it('attaches the per-screenshot source link to the caption', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png', 'boom')],
      [{ source: { url: 'https://p.test/a', title: 'Page A' } }]
    )
    expect(out).toContain('![boom](http://u/1.png)')
    expect(out).toContain('*boom — [Page A](https://p.test/a)*')
    expect(out).toContain('- **Source:** [Page A](https://p.test/a)')
  })

  it('uses the raw url as link text when there is no title', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png')],
      [{ source: { url: 'https://p.test/a' } }]
    )
    expect(out).toContain('- **Source:** https://p.test/a')
  })

  it('groups multiple screenshots under a heading and joins them', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png'), file('http://u/2.png')],
      []
    )
    expect(out).toContain('#### Screenshots\n\n')
    expect(out).toContain('![Screenshot 1](http://u/1.png)')
    expect(out).toContain('![Screenshot 2](http://u/2.png)')
    // both blocks separated by a blank line
    expect(out).toMatch(
      /\[Screenshot 1\]\(http:\/\/u\/1\.png\)\n\n!\[Screenshot 2\]/
    )
  })

  it('dedupes source URLs: same page twice collapses to the singular Source line in Context', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png'), file('http://u/2.png')],
      [
        { source: { url: 'https://p.test/a', title: 'A' } },
        { source: { url: 'https://p.test/a', title: 'A dup' } }, // same URL
      ]
    )
    // Each screenshot's own caption still carries its source link (by design),
    // so 'A dup' appears in screenshot 2's caption. The DEDUP only governs the
    // Context section — assert against that slice specifically.
    const context = out.slice(out.indexOf('#### Context'))
    expect(context).toContain('- **Source:** [A](https://p.test/a)')
    expect(context).not.toContain('Sources (')
    expect(context).not.toContain('A dup')
  })

  it('lists multiple distinct pages in order, numbered', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png'), file('http://u/2.png')],
      [
        { source: { url: 'https://p.test/a', title: 'Page A' } },
        { source: { url: 'https://p.test/b', title: 'Page B' } },
      ]
    )
    expect(out).toContain('- **Sources (2 pages):**')
    expect(out).toContain('  1. [Page A](https://p.test/a)')
    expect(out).toContain('  2. [Page B](https://p.test/b)')
  })

  it('includes the capturedAt from the last screenshot in Context', () => {
    const out = buildDescription(
      '',
      [file('http://u/1.png')],
      [{ source: { url: 'https://p.test/a', capturedAt: '2026-06-17' } }]
    )
    expect(out).toContain('- **Captured:** 2026-06-17')
  })

  it('aligns files to screenshots by index and tolerates missing shots', () => {
    // file present, no matching screenshot object -> bare image, no Context
    const out = buildDescription('', [file('http://u/1.png')], [])
    expect(out).toBe('![Screenshot 1](http://u/1.png)')
    // no Context section at all
    expect(out).not.toContain('#### Context')
  })

  it('ignores file entries without a url', () => {
    const out = buildDescription(
      '',
      [{ description: 'no url' }, file('http://u/1.png')],
      []
    )
    expect(out).toBe('![Screenshot 1](http://u/1.png)')
  })

  it('tolerates non-array inputs without throwing', () => {
    expect(() => buildDescription('body', null, undefined)).not.toThrow()
    expect(buildDescription('body', null, undefined)).toBe('body')
  })
})

describe('normalizeShots', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeShots(undefined)).toEqual([])
    expect(normalizeShots(null)).toEqual([])
    expect(normalizeShots('nope')).toEqual([])
  })

  it('upgrades a legacy single-string entry', () => {
    expect(normalizeShots(['dataUrl1'])).toEqual([
      { data: 'dataUrl1', description: '', source: null },
    ])
  })

  it('passes through full objects and defaults missing optional fields', () => {
    expect(
      normalizeShots([{ data: 'd', description: 'x', source: { url: 'u' } }])
    ).toEqual([{ data: 'd', description: 'x', source: { url: 'u' } }])

    // object with only `data` -> description '' and source null
    expect(normalizeShots([{ data: 'd' }])).toEqual([
      { data: 'd', description: '', source: null },
    ])
  })

  it('preserves explicit null source and empty description', () => {
    expect(
      normalizeShots([{ data: 'd', description: '', source: null }])
    ).toEqual([{ data: 'd', description: '', source: null }])
  })

  it('keeps a mixed legacy + modern list in order', () => {
    const out = normalizeShots([
      'legacyString',
      { data: 'modern', description: 'cap', source: { url: 'u' } },
    ])
    expect(out).toEqual([
      { data: 'legacyString', description: '', source: null },
      { data: 'modern', description: 'cap', source: { url: 'u' } },
    ])
  })
})
