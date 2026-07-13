/**
 * oops 2 issues — verification/steps checklist (add / check / remove).
 *
 * Sent as a structured `checklist` field on the task, matching the main app's
 * task checklist ({ id, text, completed, createdAt, completedAt }).
 */
import { el, state, svgNode, saveDraft } from './core.js'

function makeChecklistId() {
  return `cl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function addChecklistItem() {
  const text = el.clInput.value.trim()
  if (!text) return
  state.checklist.push({
    id: makeChecklistId(),
    text,
    completed: false,
    createdAt: new Date().toISOString(),
  })
  el.clInput.value = ''
  renderChecklist()
  saveDraft()
}

export function toggleChecklistItem(index) {
  const item = state.checklist[index]
  if (!item) return
  item.completed = !item.completed
  item.completedAt = item.completed ? new Date().toISOString() : undefined
  renderChecklist()
  saveDraft()
}

export function removeChecklistItem(index) {
  state.checklist.splice(index, 1)
  renderChecklist()
  saveDraft()
}

export function renderChecklist() {
  const items = state.checklist
  el.clList.replaceChildren()
  const done = items.filter(i => i.completed).length
  el.clCount.hidden = items.length === 0
  el.clCount.textContent = String(items.length)
  el.clList.hidden = items.length === 0
  el.clProgress.hidden = items.length === 0
  el.clProgress.textContent = `${done}/${items.length} done`
  items.forEach((item, i) => {
    const row = document.createElement('label')
    row.className = 'cl-item' + (item.completed ? ' is-done' : '')

    const cb = document.createElement('input')
    cb.type = 'checkbox'
    cb.checked = item.completed
    cb.setAttribute('aria-label', `Mark item ${i + 1} done`)
    cb.addEventListener('change', () => toggleChecklistItem(i))

    const span = document.createElement('span')
    span.className = 'cl-text'
    span.textContent = item.text

    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'cl-clear'
    rm.title = 'Remove'
    rm.setAttribute('aria-label', `Remove checklist item ${i + 1}`)
    rm.replaceChildren(svgNode('trash'))
    rm.addEventListener('click', e => {
      e.stopPropagation()
      e.preventDefault()
      removeChecklistItem(i)
    })

    row.append(cb, span, rm)
    el.clList.appendChild(row)
  })
}
