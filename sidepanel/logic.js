/**
 * BugSnap — pure task-description composition logic.
 *
 * Builds the per-screenshot "source" record, the final task description
 * markdown, and screenshot-list normalization. No DOM/Chrome deps — safe to
 * unit-test directly.
 *
 * Reference-attachment rules/formatting live in `attachments.js`.
 */

/**
 * Build the per-screenshot "source" record from page metadata.
 * Returns null when there is nothing usable (no url/title/capturedAt).
 * @param {object|null|undefined} meta page metadata from extractMetadata()
 * @returns {{url?:string, title?:string, capturedAt?:string}|null}
 */

/**
 * Build the markdown embed block for a recorded webm video (task 3/4).
 * Emits an inline `<video controls src>` tag (Tiptap renders it inline; PRD:
 * no dedicated field). Optional 1-based `index` numbers it; optional `caption`
 * becomes a line above the video. Empty string when the URL is missing.
 * @param {string} url
 * @param {{index?: number, caption?: string}} [opts]
 * @returns {string}
 */
export function buildVideoMarkdown(url, opts = {}) {
  if (!url) return ''
  const tag = `<video controls src="${url}"></video>`
  const caption = (opts.caption || '').trim()
  const block = caption ? `${caption}\n${tag}` : tag
  return opts.index ? `${opts.index}. ${block}` : block
}
export function buildSource(meta) {
  if (!meta) return null
  const source = {}
  if (meta.url) source.url = meta.url
  if (meta.title) source.title = meta.title
  if (meta.capturedAt) source.capturedAt = meta.capturedAt
  return Object.keys(source).length ? source : null
}

/**
 * Compose the final task description markdown.
 *
 * @param {string} userMd the user-written markdown body
 * @param {Array<{url:string, description?:string}>} files uploaded files
 *   (parallel to `screenshots`; the i-th file is the i-th screenshot's upload)
 * @param {Array<{data?:string, description?:string, source?:object}>} screenshots
 *   the captures, each optionally carrying its own page source
 * @returns {string}
 */
export function buildDescription(userMd, files, screenshots) {
  // Each screenshot may come from a DIFFERENT page (the panel stays open
  // across navigations), so the source URL is attached per shot.
  const imgs = Array.isArray(files) ? files.filter(f => f?.url) : []
  const shots = Array.isArray(screenshots) ? screenshots : []
  const parts = []
  if (userMd && userMd.trim()) parts.push(userMd.trim())
  if (imgs.length) {
    const blocks = imgs.map((f, i) => {
      const shot = shots[i] || {}
      const source = shot.source || null
      const caption = (f.description || '').trim()
      const label = caption || `Screenshot ${i + 1}`
      const imgMd = `![${label}](${f.url})`

      // Caption line carries the source link so every screenshot is
      // self-describing, even when a task mixes pages.
      const captionBits = []
      if (caption) captionBits.push(caption)
      if (source?.url) {
        const linkText = source.title || source.url
        captionBits.push(`[${linkText}](${source.url})`)
      }
      const captionLine = captionBits.length
        ? `*${captionBits.join(' — ')}*`
        : ''
      return captionLine ? `${imgMd}\n${captionLine}` : imgMd
    })
    const heading = imgs.length > 1 ? '#### Screenshots\n\n' : ''
    parts.push(`${heading}${blocks.join('\n\n')}`)
  }
  // Context — dedupe source URLs (a side-panel session can span many pages).
  const sources = []
  const seen = new Set()
  for (const shot of shots) {
    const u = shot?.source?.url
    if (u && !seen.has(u)) {
      seen.add(u)
      sources.push({ url: u, title: shot.source.title || '' })
    }
  }
  const ctx = []
  if (sources.length === 1) {
    const s = sources[0]
    ctx.push(`- **Source:** ${s.title ? `[${s.title}](${s.url})` : s.url}`)
  } else if (sources.length > 1) {
    ctx.push(`- **Sources (${sources.length} pages):**`)
    sources.forEach((s, i) => {
      ctx.push(`  ${i + 1}. ${s.title ? `[${s.title}](${s.url})` : s.url}`)
    })
  }
  const lastShot = shots[shots.length - 1]
  if (lastShot?.source?.capturedAt) {
    ctx.push(`- **Captured:** ${lastShot.source.capturedAt}`)
  }
  if (ctx.length) parts.push(`#### Context\n\n${ctx.join('\n')}`)
  return parts.join('\n\n')
}

/**
 * Normalize a restored screenshot list into a uniform shape.
 *
 * Handles three legacy draft shapes:
 *   - string                       -> { data, description:'', source:null }
 *   - {data, description, source}  -> passthrough with defaults
 *   - {data, ...}                  -> missing fields defaulted
 *
 * @param {Array} raw
 * @returns {Array<{data:string, description:string, source:object|null}>}
 */
export function normalizeShots(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(s =>
    typeof s === 'string'
      ? { data: s, description: '', source: null }
      : {
          data: s.data,
          description: s.description ?? '',
          source: s.source ?? null,
        }
  )
}
