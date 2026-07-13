/**
 * BugSnap — pure reference-attachment rules + formatting.
 *
 * Mirrors the /api/upload allow-list and size limit, derives a display
 * category, composes the markdown "#### References" section, and normalizes a
 * restored attachment list. No DOM/Chrome deps — safe to unit-test directly.
 */

/** Max size for a reference attachment — mirrors the /api/upload limit. */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024

/** MIME types accepted for reference attachments (mirrors /api/upload). */
export const ALLOWED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-7z-compressed',
  'application/json',
  'application/xml',
  'text/html',
  'text/css',
  'text/javascript',
]

/**
 * Human-readable file size, e.g. 1536 -> "1.5 KB".
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024))
  )
  const value = bytes / 1024 ** i
  const digits = i === 0 ? 0 : value < 10 ? 1 : 0
  // Drop a trailing ".0" so 1.0 KB reads as "1 KB".
  const display = value.toFixed(digits).replace(/\.0$/, '')
  return `${display} ${units[i]}`
}

/**
 * Is the given MIME type accepted as a reference attachment?
 * Mirrors the server's allow-rule (allow-list OR text/* OR empty type).
 * @param {string} type
 * @returns {boolean}
 */
export function isAllowedAttachmentType(type) {
  const t = (type || '').toLowerCase()
  if (t === '') return true
  if (t.startsWith('text/')) return true
  return ALLOWED_ATTACHMENT_TYPES.includes(t)
}

/**
 * Validate a reference file before reading/uploading it.
 * @param {{size?:number, type?:string, name?:string}|null|undefined} file
 * @returns {string|null} an error message, or null when valid
 */
export function validateAttachment(file) {
  if (!file) return 'No file.'
  const size = typeof file.size === 'number' ? file.size : 0
  if (size > MAX_ATTACHMENT_SIZE) {
    return `File is too large (max ${formatFileSize(MAX_ATTACHMENT_SIZE)}).`
  }
  if (!isAllowedAttachmentType(file.type)) {
    return `File type "${file.type || 'unknown'}" is not supported.`
  }
  return null
}

/**
 * Derive a coarse display category from a file's MIME type + name.
 * @param {string} type MIME type
 * @param {string} [name]
 * @returns {'image'|'video'|'audio'|'document'|'spreadsheet'|'presentation'|'archive'|'code'|'other'}
 */
export function categorizeFile(type, name = '') {
  const t = (type || '').toLowerCase()
  if (t.startsWith('image/')) return 'image'
  if (t.startsWith('video/')) return 'video'
  if (t.startsWith('audio/')) return 'audio'
  // Check spreadsheet/presentation BEFORE the generic document markers:
  // the OpenXML MIME strings all contain "officedocument", so a naive
  // includes('document') would mis-bucket sheets & decks as documents.
  if (t.includes('sheet') || t.includes('excel')) return 'spreadsheet'
  if (t.includes('presentation') || t.includes('powerpoint'))
    return 'presentation'
  if (t.includes('pdf') || t.includes('word') || t.includes('msword'))
    return 'document'
  if (
    t.includes('zip') ||
    t.includes('rar') ||
    t.includes('7z') ||
    t.includes('tar') ||
    t.includes('gzip')
  )
    return 'archive'
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (
    t.startsWith('text/') ||
    ['json', 'xml', 'js', 'ts', 'py', 'md', 'csv', 'html', 'css'].includes(ext)
  )
    return 'code'
  return 'other'
}

/**
 * Compose the "#### References" markdown section for uploaded reference files.
 *
 * Images embed inline (`![alt](url)` + optional caption); every other file is
 * listed as a bold link. Returns '' when there are no files.
 *
 * @param {Array<{url:string, name?:string, type?:string, description?:string}>} files
 * @returns {string}
 */
export function buildReferences(files) {
  const refs = Array.isArray(files) ? files.filter(f => f?.url) : []
  if (!refs.length) return ''
  const images = []
  const links = []
  for (const f of refs) {
    const name = f.name || 'file'
    const desc = (f.description || '').trim()
    const type = (f.type || '').toLowerCase()
    if (type.startsWith('image/')) {
      const alt = desc || name
      images.push(
        desc ? `![${alt}](${f.url})\n*${desc}*` : `![${alt}](${f.url})`
      )
    } else {
      links.push(
        desc
          ? `- **[${name}](${f.url})** — *${desc}*`
          : `- **[${name}](${f.url})**`
      )
    }
  }
  const blocks = []
  if (images.length) blocks.push(images.join('\n\n'))
  if (links.length) blocks.push(links.join('\n'))
  return blocks.length ? `#### References\n\n${blocks.join('\n\n')}` : ''
}

/**
 * Normalize a restored reference-attachment list into a uniform shape.
 * Drops entries without `data` so a corrupted draft cannot break the panel.
 * @param {Array} raw
 * @returns {Array<{data:string,name:string,type:string,size:number,description:string}>}
 */
export function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(a => a && typeof a === 'object' && a.data)
    .map(a => ({
      data: a.data,
      name: a.name || 'file',
      type: a.type || 'application/octet-stream',
      size: typeof a.size === 'number' ? a.size : 0,
      description: a.description ?? '',
    }))
}
