/**
 * Tiny, safe Markdown -> HTML renderer for the BugSnap preview pane.
 * Supports: headings, bold, italic, inline code, fenced code blocks, links,
 * images, unordered/ordered lists, blockquotes, horizontal rules, and paragraphs.
 * Not a full spec — just enough for a faithful bug-description preview.
 */

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Drop dangerous URL schemes (defence-in-depth; the preview also sanitizes DOM).
function sanitizeUrl(url) {
  const safe = /^(https?:|mailto:|#)/i.test(url) || url.startsWith('//')
  return safe ? url : ''
}

function inline(s) {
  // Escape ONCE, up front. Inline formatting then runs on the escaped text;
  // the captured segments (alt / text / url / title / code) are already
  // escaped, so they are emitted as-is and must NOT be re-escaped below.
  // (The old version escaped the whole input before calling inline(), then
  // re-escaped code spans and titles here -> double-escaped output.)
  const esc = escapeHtml(s)
  // NOTE: titles match the ESCAPED &quot; delimiter, not a raw ". escapeHtml()
  // turns the markdown title "..." into &quot;...&quot; before this runs, so a
  // raw-" regex would never match (titled links/images fell through to a
  // paragraph before this fix). The captured title is a slice of `esc`, so
  // it is already entity-escaped and is emitted as-is.
  // images first (so links inside alt don't mangle)
  return esc
    .replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g,
      (_m, alt, url, title) => {
        const t = title ? ` title="${title}"` : ''
        return `<img alt="${alt}" src="${sanitizeUrl(url)}"${t} loading="lazy" />`
      }
    )
    .replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;(.*?)&quot;)?\)/g,
      (_m, text, url, title) => {
        const t = title ? ` title="${title}"` : ''
        return `<a href="${sanitizeUrl(url)}" rel="noreferrer noopener" target="_blank"${t}>${text}</a>`
      }
    )
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>')
}

export function renderMarkdown(src) {
  if (!src) return ''
  const lines = src.split('\n')
  const html = []
  let i = 0
  let inUl = false
  let inOl = false

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>')
      inUl = false
    }
    if (inOl) {
      html.push('</ol>')
      inOl = false
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block
    if (/^```/.test(line)) {
      closeLists()
      const code = []
      i++
      while (i < lines.length && !/^```/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      i++ // skip closing fence
      html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    // Horizontal rule
    if (/^\s*([-*_])\1\1[-*_\s]*$/.test(line)) {
      closeLists()
      html.push('<hr/>')
      i++
      continue
    }

    // Heading
    const h = line.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      closeLists()
      const level = h[1].length
      html.push(`<h${level}>${inline(h[2])}</h${level}>`)
      i++
      continue
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      closeLists()
      const quote = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      html.push(`<blockquote>${inline(quote.join(' '))}</blockquote>`)
      continue
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      if (!inUl) {
        closeLists()
        html.push('<ul>')
        inUl = true
      }
      html.push(`<li>${inline(line.replace(/^\s*[-*+]\s+/, ''))}</li>`)
      i++
      continue
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (!inOl) {
        closeLists()
        html.push('<ol>')
        inOl = true
      }
      html.push(`<li>${inline(line.replace(/^\s*\d+\.\s+/, ''))}</li>`)
      i++
      continue
    }

    // Blank line
    if (/^\s*$/.test(line)) {
      closeLists()
      i++
      continue
    }

    // Paragraph (merge consecutive non-blank lines)
    closeLists()
    const para = []
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^```/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i])
    ) {
      para.push(lines[i])
      i++
    }
    html.push(`<p>${para.map(inline).join('<br/>')}</p>`)
  }

  closeLists()
  return html.join('\n')
}
