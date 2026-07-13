/**
 * oops 2 issues — reference attachments panel (drag & drop / browse).
 *
 * Lets the user attach arbitrary files (images, PDFs, docs, archives) as
 * references alongside screenshots. Pure validation/formatting rules live in
 * attachments.js; this module is the DOM/controller glue.
 */
import { el, state, svgNode, setStatus, saveDraft } from './core.js'
import {
  validateAttachment,
  categorizeFile,
  formatFileSize,
} from './attachments.js'

// File-picker accept hint (mirrors /api/upload's allow-list). The authoritative
// check is validateAttachment() in attachments.js.
export const ATTACHMENT_ACCEPT =
  'image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,text/plain,text/markdown,text/csv,.json,.xml,.html,.css,.js,.zip,.rar,.7z'

function iconForCategory(cat) {
  if (cat === 'image') return 'image'
  if (cat === 'code') return 'code'
  return 'fileText'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

/** Read + validate a batch of Files (from <input> or drop) into state. */
export async function handleFilesAdded(fileList) {
  const files = Array.from(fileList || []).filter(Boolean)
  if (!files.length) return
  let added = 0
  let skipped = 0
  for (const file of files) {
    const err = validateAttachment(file)
    if (err) {
      skipped++
      setStatus('err', `${file.name}: ${err}`)
      continue
    }
    try {
      const data = await readFileAsDataUrl(file)
      state.attachments.push({
        data,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
        size: file.size,
        description: '',
      })
      added++
    } catch (e) {
      skipped++
      setStatus('err', `${file.name}: ${e?.message || 'read failed'}`)
    }
  }
  if (added) {
    renderAttachments()
    saveDraft()
  }
  if (added && !skipped) {
    setStatus(
      'ok',
      `Attached ${added} file${added === 1 ? '' : 's'} (${state.attachments.length} total).`
    )
  }
}

export function removeAttachment(index) {
  state.attachments.splice(index, 1)
  renderAttachments()
  saveDraft()
}

export function setAttachmentDescription(index, value) {
  if (state.attachments[index]) {
    state.attachments[index].description = value
    saveDraft()
  }
}

export function renderAttachments() {
  const items = state.attachments
  el.attList.replaceChildren()
  el.attCount.hidden = items.length === 0
  el.attCount.textContent = String(items.length)
  el.attList.hidden = items.length === 0
  items.forEach((att, i) => {
    const cat = categorizeFile(att.type, att.name)
    const row = document.createElement('div')
    row.className = 'att-row'

    const ico = document.createElement('span')
    ico.className = 'att-ico'
    ico.replaceChildren(svgNode(iconForCategory(cat)))

    const body = document.createElement('div')
    body.className = 'att-body'
    const name = document.createElement('span')
    name.className = 'att-name'
    name.textContent = att.name
    name.title = att.name
    const meta = document.createElement('span')
    meta.className = 'att-meta'
    meta.textContent = `${formatFileSize(att.size)} · ${att.type || 'file'}`
    const desc = document.createElement('input')
    desc.type = 'text'
    desc.className = 'att-desc'
    desc.value = att.description
    desc.placeholder = 'Describe this reference (optional)'
    desc.setAttribute('aria-label', `Description for ${att.name}`)
    desc.addEventListener('input', e =>
      setAttachmentDescription(i, e.target.value)
    )
    body.append(name, meta, desc)

    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'att-clear'
    rm.title = 'Remove'
    rm.setAttribute('aria-label', `Remove ${att.name}`)
    rm.replaceChildren(svgNode('x'))
    rm.addEventListener('click', e => {
      e.stopPropagation()
      removeAttachment(i)
    })

    row.append(ico, body, rm)
    el.attList.appendChild(row)
  })
}
