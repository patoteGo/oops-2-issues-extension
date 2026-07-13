/**
 * BugSnap - Page metadata extraction.
 *
 * Runs in the PAGE context via chrome.scripting.executeScript({ func }).
 * MV3 `func` constraints: fully self-contained (no imports, no closure vars).
 *
 * @returns {object} page metadata
 */
export function extractMetadata() {
  const getSelection = () => {
    try {
      return (window.getSelection && window.getSelection().toString()) || ''
    } catch {
      return ''
    }
  }

  return {
    url: window.location.href,
    title: document.title || '',
    referrer: document.referrer || '',
    userAgent: navigator.userAgent,
    language: navigator.language || '',
    platform: navigator.platform || '',
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.availWidth,
      availHeight: screen.availHeight,
    },
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      scrollX: window.scrollX || 0,
      scrollY: window.scrollY || 0,
    },
    selection: getSelection().trim(),
    capturedAt: new Date().toISOString(),
  }
}
