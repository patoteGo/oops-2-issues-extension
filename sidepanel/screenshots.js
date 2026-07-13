/**
 * oops 2 issues — screenshot image processing + capture list.
 *
 * - PNG -> WebP compression (full capture + region crop), capped to MAX_WIDTH.
 * - The screenshot list state ops + thumbnail grid rendering.
 */
import { el, state, svgNode, saveDraft } from './core.js'

export const MAX_WIDTH = 1280
export const WEBP_QUALITY = 0.7

// ----- Image compression (PNG -> WebP) ---------------------------------
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Failed to decode screenshot.'))
    img.src = src
  })
}

export async function compressFull(pngDataUrl) {
  const img = await loadImage(pngDataUrl)
  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/webp', WEBP_QUALITY)
}

export async function cropAndCompress(pngDataUrl, rectCss, viewport) {
  const img = await loadImage(pngDataUrl)
  const vw = viewport?.width || window.innerWidth
  const vh = viewport?.height || window.innerHeight
  const scaleX = img.naturalWidth / vw
  const scaleY = img.naturalHeight / vh
  const sx = rectCss.x * scaleX
  const sy = rectCss.y * scaleY
  const sw = Math.max(1, rectCss.w * scaleX)
  const sh = Math.max(1, rectCss.h * scaleY)
  const scale = sw > MAX_WIDTH ? MAX_WIDTH / sw : 1
  const dw = Math.max(1, Math.round(sw * scale))
  const dh = Math.max(1, Math.round(sh * scale))
  const canvas = document.createElement('canvas')
  canvas.width = dw
  canvas.height = dh
  canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh)
  return canvas.toDataURL('image/webp', WEBP_QUALITY)
}

// ----- Screenshot list (multiple, each with a description) -------------
/** Add a WebP capture to the list. */
export function addShot(webp, source = null) {
  if (!webp) return
  state.screenshots.push({ data: webp, description: '', source })
  renderShots()
  saveDraft()
}

/** Remove a capture by index. */
export function removeShot(index) {
  state.screenshots.splice(index, 1)
  renderShots()
  saveDraft()
}

/** Update a capture's description by index. */
export function setShotDescription(index, value) {
  if (state.screenshots[index]) {
    state.screenshots[index].description = value
    saveDraft()
  }
}

/** Rebuild the thumbnail grid from state.screenshots. */
export function renderShots() {
  el.shotList.replaceChildren()
  const shots = state.screenshots
  el.shotCount.hidden = shots.length === 0
  el.shotCount.textContent = String(shots.length)
  el.shotList.hidden = shots.length === 0
  shots.forEach((shot, i) => {
    const src = shot.data ?? shot
    const desc = shot.description ?? ''
    const source = shot.source || null

    const thumb = document.createElement('div')
    thumb.className = 'shot-thumb'

    const imgWrap = document.createElement('div')
    imgWrap.className = 'shot-item'
    const img = document.createElement('img')
    img.src = src
    img.alt = `Screenshot ${i + 1}`
    img.addEventListener('click', () => window.open(src, '_blank'))
    const idx = document.createElement('span')
    idx.className = 'shot-item-index'
    idx.textContent = String(i + 1)
    const rm = document.createElement('button')
    rm.type = 'button'
    rm.className = 'shot-clear'
    rm.title = 'Discard'
    rm.setAttribute('aria-label', `Discard screenshot ${i + 1}`)
    rm.replaceChildren(svgNode('x'))
    rm.addEventListener('click', e => {
      e.stopPropagation()
      removeShot(i)
    })
    imgWrap.append(img, idx, rm)

    const descInput = document.createElement('input')
    descInput.type = 'text'
    descInput.className = 'shot-desc'
    descInput.value = desc
    descInput.placeholder = `Why is screenshot ${i + 1} important?`
    descInput.setAttribute('aria-label', `Description for screenshot ${i + 1}`)
    descInput.addEventListener('input', e =>
      setShotDescription(i, e.target.value)
    )

    thumb.append(imgWrap)
    // Per-screenshot source URL — the panel can collect captures from many
    // pages, so each one remembers where it came from.
    if (source && source.url) {
      const srcRow = document.createElement('a')
      srcRow.className = 'shot-source'
      srcRow.href = source.url
      srcRow.target = '_blank'
      srcRow.rel = 'noopener noreferrer'
      srcRow.title = source.url
      const srcText = document.createElement('span')
      srcText.textContent = source.title || source.url
      srcRow.append(svgNode('link'), srcText)
      thumb.append(srcRow)
    }
    thumb.append(descInput)
    el.shotList.appendChild(thumb)
  })
}
