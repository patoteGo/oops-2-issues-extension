/**
 * oops 2 issues — markdown editor (formatting toolbar + Write/Preview tabs).
 *
 * The preview is parsed via DOMParser and sanitized (scripts, on* handlers,
 * and unsafe URL schemes stripped) before appending nodes — avoids innerHTML.
 */
import { renderMarkdown } from '../lib/markdown.js'
import { el, state, saveDraft } from './core.js'

export const MD_TOOLS = [
  { id: 'heading', ico: 'heading', title: 'Heading' },
  { id: 'bold', ico: 'bold', title: 'Bold' },
  { id: 'italic', ico: 'italic', title: 'Italic' },
  { id: 'code', ico: 'code', title: 'Code' },
  { id: 'link', ico: 'link', title: 'Link' },
  { id: 'list', ico: 'list', title: 'List' },
  { id: 'quote', ico: 'quote', title: 'Quote' },
]

export function applyFormat(id) {
  const ta = el.description
  const { selectionStart: s, selectionEnd: e, value } = ta
  const sel = value.slice(s, e)
  let out = value
  let caretStart = s
  let caretEnd = e

  const wrap = (pre, post, ph) => {
    const inner = sel || ph
    out = value.slice(0, s) + pre + inner + post + value.slice(e)
    caretStart = s + pre.length
    caretEnd = caretStart + inner.length
  }
  const linePrefix = (prefix, ph) => {
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const blockEnd = value.indexOf('\n', e)
    const end = blockEnd === -1 ? value.length : blockEnd
    const block = value.slice(lineStart, end) || ph
    const replaced = block
      .split('\n')
      .map(l => (l.startsWith(prefix) ? l : prefix + l))
      .join('\n')
    out = value.slice(0, lineStart) + replaced + value.slice(end)
    caretStart = lineStart
    caretEnd = lineStart + replaced.length
  }

  switch (id) {
    case 'heading':
      linePrefix('## ', 'Heading')
      break
    case 'bold':
      wrap('**', '**', 'bold')
      break
    case 'italic':
      wrap('*', '*', 'italic')
      break
    case 'code':
      wrap('`', '`', 'code')
      break
    case 'link': {
      const url = window.prompt('Link URL', 'https://')
      if (!url) return
      wrap('[', `](${url})`, 'link')
      break
    }
    case 'list':
      linePrefix('- ', 'List item')
      break
    case 'quote':
      linePrefix('> ', 'Quote')
      break
    default:
      return
  }

  el.description.value = out
  el.description.focus()
  el.description.setSelectionRange(caretStart, caretEnd)
  syncPreview()
  saveDraft()
}

export function setEditorTab(tab) {
  state.previewOn = tab === 'preview'
  const writeActive = !state.previewOn
  el.tabWrite.classList.toggle('tab--active', writeActive)
  el.tabPreview.classList.toggle('tab--active', state.previewOn)
  el.tabWrite.setAttribute('aria-selected', String(writeActive))
  el.tabPreview.setAttribute('aria-selected', String(state.previewOn))
  el.description.hidden = state.previewOn
  el.preview.hidden = !state.previewOn
  el.toolbarWrap.hidden = state.previewOn
  if (state.previewOn) syncPreview()
}

export function syncPreview() {
  const html = renderMarkdown(el.description.value)
  // Parse in a detached document (no script execution) and sanitize the DOM
  // before appending nodes — avoids innerHTML and blocks residual vectors.
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  sanitizePreview(doc.body)
  el.preview.replaceChildren(...doc.body.firstChild.childNodes)
}

function isSafeUrl(v) {
  return /^(https?:|mailto:|#)/i.test(v) || v.startsWith('/')
}

function sanitizePreview(root) {
  const nodes = root.querySelectorAll('script, style, iframe, object, embed')
  nodes.forEach(n => n.remove())
  root.querySelectorAll('*').forEach(node => {
    ;[...node.attributes].forEach(attr => {
      const name = attr.name.toLowerCase()
      const val = attr.value || ''
      if (name.startsWith('on')) node.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src') && !isSafeUrl(val)) {
        node.removeAttribute(attr.name)
      }
    })
  })
}
