/**
 * oops 2 issues — capture flow (full tab + drag-a-region).
 *
 * Drives the background capture message, compresses the result, and appends it
 * to the screenshot list. Region results arrive later via runtime.onMessage
 * (wired in the main controller) and are handled by `onRegionSelected`.
 */
import { buildSource } from './logic.js'
import {
  el,
  state,
  setStatus,
  setBusy,
  setButtonLoading,
  resetCaptureButtons,
} from './core.js'
import { compressFull, cropAndCompress, addShot } from './screenshots.js'

/**
 * Capture in the given mode and append to the screenshot list.
 * 'full' grabs the visible tab immediately; 'region' injects the drag overlay
 * and stays busy until REGION_SELECTED/CANCELLED arrives from the page.
 */
export async function capture(mode) {
  if (state.busy) return
  const btn = el.captureMode.querySelector(`button[data-mode="${mode}"]`)
  setBusy(true)
  setButtonLoading(btn, true)
  state.captureMode = mode
  setStatus(
    'busy',
    mode === 'region' ? 'Drag a region on the page…' : 'Capturing…'
  )
  try {
    const res = await chrome.runtime.sendMessage({
      action: mode === 'region' ? 'CAPTURE_REGION' : 'CAPTURE_FULL',
    })
    if (!res?.ok) throw new Error(res?.error || 'Capture failed.')

    state.fullPng = res.dataUrl
    state.metadata = res.metadata || {}
    prefillFromMetadata(res.metadata)

    if (mode === 'full') {
      setStatus('busy', 'Compressing…')
      const webp = await compressFull(res.dataUrl)
      addShot(webp, buildSource(res.metadata))
      setStatus('ok', `Screenshot captured (${state.screenshots.length}).`)
      resetCaptureButtons()
      setBusy(false)
    }
    // For region: keep busy state until REGION_SELECTED/CANCELLED arrives.
    // The selector overlay reports back via runtime.onMessage.
  } catch (err) {
    setStatus('err', err?.message || 'Capture error.')
    resetCaptureButtons()
    setBusy(false)
  }
}

function prefillFromMetadata(meta) {
  if (!meta) return
  if (meta.title && !el.title.value.trim()) el.title.value = meta.title
  if (meta.selection && !el.description.value.trim()) {
    el.description.value = meta.selection
  }
}

export async function onRegionSelected(rect) {
  setStatus('busy', 'Cropping…')
  try {
    const webp = await cropAndCompress(
      state.fullPng,
      rect,
      state.metadata?.viewport
    )
    addShot(webp, buildSource(state.metadata))
    setStatus('ok', `Region captured (${state.screenshots.length}).`)
  } catch (err) {
    setStatus('err', err?.message || 'Crop failed.')
  } finally {
    resetCaptureButtons()
    setBusy(false)
  }
}
