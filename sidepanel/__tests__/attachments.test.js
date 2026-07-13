import { describe, it, expect } from 'vitest'
import {
  formatFileSize,
  isAllowedAttachmentType,
  validateAttachment,
  categorizeFile,
  buildReferences,
  normalizeAttachments,
} from '../attachments.js'

describe('formatFileSize', () => {
  it('formats bytes, KB, MB, GB with sensible precision', () => {
    expect(formatFileSize(0)).toBe('0 B')
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1024)).toBe('1 KB')
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(10240)).toBe('10 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB')
    expect(formatFileSize(2 * 1024 * 1024 * 1024)).toBe('2 GB')
  })

  it('is resilient to non-finite / negative input', () => {
    expect(formatFileSize(NaN)).toBe('0 B')
    expect(formatFileSize(-5)).toBe('0 B')
    expect(formatFileSize(undefined)).toBe('0 B')
  })
})

describe('isAllowedAttachmentType', () => {
  it('accepts the allow-listed types', () => {
    expect(isAllowedAttachmentType('image/png')).toBe(true)
    expect(isAllowedAttachmentType('application/pdf')).toBe(true)
    expect(isAllowedAttachmentType('application/zip')).toBe(true)
    expect(isAllowedAttachmentType('text/markdown')).toBe(true)
  })

  it('accepts any text/* type and an empty type', () => {
    expect(isAllowedAttachmentType('text/x-custom')).toBe(true)
    expect(isAllowedAttachmentType('')).toBe(true)
  })

  it('rejects unsupported types', () => {
    expect(isAllowedAttachmentType('application/x-msdownload')).toBe(false)
    expect(isAllowedAttachmentType('video/mp4')).toBe(false)
  })
})

describe('validateAttachment', () => {
  const ok = (over = {}) => ({
    name: 'f',
    type: 'image/png',
    size: 1024,
    ...over,
  })

  it('returns null for a valid file', () => {
    expect(validateAttachment(ok())).toBeNull()
  })

  it('rejects oversized files with a friendly message', () => {
    const big = ok({ size: 26 * 1024 * 1024 })
    const msg = validateAttachment(big)
    expect(msg).toMatch(/too large/i)
    expect(msg).toContain('25 MB')
  })

  it('rejects unsupported types', () => {
    expect(
      validateAttachment(ok({ type: 'application/x-msdownload' }))
    ).toMatch(/not supported/i)
  })

  it('rejects null/undefined input', () => {
    expect(validateAttachment(null)).toMatch(/no file/i)
    expect(validateAttachment(undefined)).toMatch(/no file/i)
  })
})

describe('categorizeFile', () => {
  it('buckets by mime prefix', () => {
    expect(categorizeFile('image/png')).toBe('image')
    expect(categorizeFile('video/mp4')).toBe('video')
    expect(categorizeFile('audio/mpeg')).toBe('audio')
  })

  it('recognizes documents, spreadsheets, presentations', () => {
    expect(categorizeFile('application/pdf')).toBe('document')
    expect(
      categorizeFile(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBe('document')
    expect(
      categorizeFile(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      )
    ).toBe('spreadsheet')
    expect(
      categorizeFile(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      )
    ).toBe('presentation')
  })

  it('recognizes archives and code/text', () => {
    expect(categorizeFile('application/zip')).toBe('archive')
    expect(categorizeFile('application/x-7z-compressed')).toBe('archive')
    expect(categorizeFile('text/plain')).toBe('code')
    expect(categorizeFile('application/json', 'a.json')).toBe('code')
    expect(categorizeFile('', 'script.py')).toBe('code')
  })

  it('falls back to other for unknown types', () => {
    expect(categorizeFile('application/x-msdownload')).toBe('other')
    expect(categorizeFile('')).toBe('other')
  })
})

describe('buildReferences', () => {
  it('returns empty string when there are no files', () => {
    expect(buildReferences([])).toBe('')
    expect(buildReferences(undefined)).toBe('')
  })

  it('ignores entries without a url', () => {
    expect(buildReferences([{ name: 'no url' }])).toBe('')
  })

  it('embeds an image inline with the description as caption', () => {
    const out = buildReferences([
      {
        url: 'http://u/a.png',
        name: 'a.png',
        type: 'image/png',
        description: 'the bug',
      },
    ])
    expect(out).toBe('#### References\n\n![the bug](http://u/a.png)\n*the bug*')
  })

  it('uses the filename as alt text when there is no description', () => {
    const out = buildReferences([
      { url: 'http://u/a.png', name: 'a.png', type: 'image/png' },
    ])
    expect(out).toBe('#### References\n\n![a.png](http://u/a.png)')
  })

  it('lists non-image files as bold links', () => {
    const out = buildReferences([
      { url: 'http://u/log.pdf', name: 'log.pdf', type: 'application/pdf' },
    ])
    expect(out).toBe('#### References\n\n- **[log.pdf](http://u/log.pdf)**')
  })

  it('appends an italic description to a linked file', () => {
    const out = buildReferences([
      {
        url: 'http://u/log.pdf',
        name: 'log.pdf',
        type: 'application/pdf',
        description: 'prod error log',
      },
    ])
    expect(out).toBe(
      '#### References\n\n- **[log.pdf](http://u/log.pdf)** — *prod error log*'
    )
  })

  it('separates inline images from the linked file list', () => {
    const out = buildReferences([
      {
        url: 'http://u/a.png',
        name: 'a.png',
        type: 'image/png',
        description: 'shot',
      },
      { url: 'http://u/log.pdf', name: 'log.pdf', type: 'application/pdf' },
    ])
    expect(out).toBe(
      '#### References\n\n![shot](http://u/a.png)\n*shot*\n\n- **[log.pdf](http://u/log.pdf)**'
    )
  })
})

describe('normalizeAttachments', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeAttachments(undefined)).toEqual([])
    expect(normalizeAttachments(null)).toEqual([])
  })

  it('drops entries without data and defaults missing fields', () => {
    const out = normalizeAttachments([
      {
        data: 'd1',
        name: 'a.png',
        type: 'image/png',
        size: 10,
        description: 'cap',
      },
      { name: 'no-data' },
      { data: 'd2' },
    ])
    expect(out).toEqual([
      {
        data: 'd1',
        name: 'a.png',
        type: 'image/png',
        size: 10,
        description: 'cap',
      },
      {
        data: 'd2',
        name: 'file',
        type: 'application/octet-stream',
        size: 0,
        description: '',
      },
    ])
  })
})
