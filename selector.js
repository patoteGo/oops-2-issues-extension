/**
 * BugSnap - Region selection overlay.
 *
 * Injected on demand via chrome.scripting AFTER background captured the full
 * viewport PNG. Drawn over the LIVE page: the whole screen is dimmed on open;
 * the user drags a rectangle (clear inside, dark outside via box-shadow); on
 * release the rect (CSS px) is reported to the side panel, which crops the
 * already-captured clean PNG. The overlay tears itself down on confirm/cancel.
 *
 * Runs in the isolated world (has chrome.runtime), manipulates shared DOM.
 * Styles come from selector.css (injected via insertCSS) using .bugsnap-* classes.
 */
;(() => {
  const ROOT_ID = 'bugsnap-selector-root'
  document.getElementById(ROOT_ID)?.remove()

  const send = msg => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {})
    } catch {
      /* ignore */
    }
  }

  const root = document.createElement('div')
  root.id = ROOT_ID
  root.className = 'bugsnap-root'

  const dimEl = document.createElement('div')
  dimEl.className = 'bugsnap-dim' // whole-screen dim, visible until dragging

  const hint = document.createElement('div')
  hint.className = 'bugsnap-hint'
  const hintMain = document.createElement('span')
  hintMain.textContent = 'Drag to select a region'
  const hintSub = document.createElement('span')
  hintSub.className = 'bugsnap-hint-sub'
  hintSub.textContent = 'Esc to cancel'
  hint.append(hintMain, hintSub)

  const rectEl = document.createElement('div')
  rectEl.className = 'bugsnap-rect'
  rectEl.hidden = true

  const cancelBtn = document.createElement('button')
  cancelBtn.type = 'button'
  cancelBtn.className = 'bugsnap-cancel'
  cancelBtn.title = 'Cancel (Esc)'
  cancelBtn.textContent = 'Cancel'

  root.append(dimEl, hint, rectEl, cancelBtn)
  document.documentElement.appendChild(root)

  let start = null
  let dragging = false
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))

  const teardown = () => {
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('pointerdown', onDown, true)
    document.removeEventListener('pointermove', onMove, true)
    document.removeEventListener('pointerup', onUp, true)
    root.remove()
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      send({ action: 'REGION_CANCELLED' })
      teardown()
    }
  }

  function onDown(e) {
    // Ignore clicks on the hint/cancel so they don't start a drag.
    if (
      e.target.closest('.bugsnap-cancel') ||
      e.target.closest('.bugsnap-hint')
    )
      return
    if (e.button !== 0 && e.pointerType === 'mouse') return
    e.preventDefault()
    e.stopPropagation()
    dragging = true
    start = { x: e.clientX, y: e.clientY }
    // Hide base dim; the rect's box-shadow now darkens the outside.
    dimEl.hidden = true
    rectEl.hidden = false
    draw(e.clientX, e.clientY)
  }

  function draw(x, y) {
    if (!start) return
    const x0 = clamp(Math.min(start.x, x), 0, window.innerWidth)
    const y0 = clamp(Math.min(start.y, y), 0, window.innerHeight)
    const x1 = clamp(Math.max(start.x, x), 0, window.innerWidth)
    const y1 = clamp(Math.max(start.y, y), 0, window.innerHeight)
    const w = x1 - x0
    const h = y1 - y0
    rectEl.style.left = `${x0}px`
    rectEl.style.top = `${y0}px`
    rectEl.style.width = `${w}px`
    rectEl.style.height = `${h}px`
    rectEl.setAttribute('data-dim', `${Math.round(w)} × ${Math.round(h)}`)
  }

  function onMove(e) {
    if (!dragging) return
    e.preventDefault()
    draw(e.clientX, e.clientY)
  }

  function onUp(e) {
    if (!dragging) return
    e.preventDefault()
    dragging = false
    const x0 = clamp(Math.min(start.x, e.clientX), 0, window.innerWidth)
    const y0 = clamp(Math.min(start.y, e.clientY), 0, window.innerHeight)
    const x1 = clamp(Math.max(start.x, e.clientX), 0, window.innerWidth)
    const y1 = clamp(Math.max(start.y, e.clientY), 0, window.innerHeight)
    const w = x1 - x0
    const h = y1 - y0
    teardown()
    if (w < 8 || h < 8) {
      send({ action: 'REGION_CANCELLED' })
      return
    }
    send({
      action: 'REGION_SELECTED',
      rect: { x: x0, y: y0, w, h },
      dpr: window.devicePixelRatio || 1,
    })
  }

  cancelBtn.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    send({ action: 'REGION_CANCELLED' })
    teardown()
  })

  document.addEventListener('keydown', onKey, true)
  document.addEventListener('pointerdown', onDown, true)
  document.addEventListener('pointermove', onMove, true)
  document.addEventListener('pointerup', onUp, true)
})()
