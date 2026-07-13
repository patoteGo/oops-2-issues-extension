const statusEl = document.getElementById('status')
const button = document.getElementById('allow')

button.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
      },
    })
    stream.getTracks().forEach(track => track.stop())
    await chrome.storage.local.set({ micPermissionReady: true })
    statusEl.textContent =
      'Microphone enabled. You can close this window and record again.'
    button.disabled = true
  } catch (err) {
    statusEl.textContent = `Microphone not enabled: ${err?.message || err}`
  }
})
