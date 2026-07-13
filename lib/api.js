/**
 * EP Project Manager API client for BugSnap.
 *
 * All routes live under "<baseUrl>/api/...". Auth uses a Bearer JWT stored by
 * the caller (chrome.storage.local). Throws Error(message) on non-2xx with the
 * server's message when available.
 */
const DEBUG_PREFIX = '[BugSnap video debug]'

function debugStep(step, details = {}) {
  try {
    console.debug(DEBUG_PREFIX, step, details)
  } catch {
    /* debug must never break API calls */
  }
}

export class EpApi {
  /**
   * @param {string} baseUrl e.g. "http://localhost:3001" (no trailing slash)
   */
  constructor(baseUrl) {
    this.baseUrl = (baseUrl || '').replace(/\/+$/, '')
  }

  /** @private */
  url(path) {
    return `${this.baseUrl}/api${path}`
  }

  /** @private */
  static async readError(res) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      detail = body?.error || body?.message || detail
    } catch {
      /* non-JSON error body */
    }
    return detail
  }

  /**
   * @param {string} username
   * @param {string} password
   * @returns {Promise<{token:string, user:object}>}
   */
  async login(username, password) {
    const res = await fetch(this.url('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) throw new Error(await EpApi.readError(res))
    const data = await res.json()
    if (!data?.token) throw new Error('Login did not return a token.')
    return { token: data.token, user: data.user }
  }

  /**
   * Verify a token. Returns 'valid' | 'invalid' | 'unknown'.
   * 'unknown' = network/transport error (don't log the user out for these).
   * 'invalid' = the server explicitly rejected the token (401/403).s
   * @param {string} token
   */
  async verify(token) {
    try {
      const res = await fetch(this.url('/auth/verify'), {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401 || res.status === 403) return 'invalid'
      if (!res.ok) return 'unknown'
      const data = await res.json()
      return data?.valid === true ? 'valid' : 'invalid'
    } catch {
      return 'unknown'
    }
  }

  /** @param {string} token @returns {Promise<Array<{id:number,name:string}>>} */
  async getProjects(token) {
    const res = await fetch(this.url('/projects'), {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error(await EpApi.readError(res))
    const data = await res.json()
    const rows = Array.isArray(data) ? data : [data]
    return rows
      .filter(p => p && (p.id != null || p.id === 0))
      .map(p => ({ id: p.id, name: p.name || `Project #${p.id}` }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }

  /**
   * Upload any file with an optional caption and return the full file object
   * from the server (url, name, type, size, description, ...).
   * @param {string} token
   * @param {Blob} blob
   * @param {string} filename filename reported to the server
   * @param {string} [description]
   * @returns {Promise<object>} file object
   */
  async uploadFile(token, blob, filename, description) {
    debugStep('api:upload-request', {
      filename: filename || 'file',
      blobSize: blob?.size,
      blobType: blob?.type,
      hasDescription: Boolean(description),
    })
    const form = new FormData()
    form.append('file', blob, filename || 'file')
    form.append('entityType', 'tasks')
    form.append('entityId', 'bugsnap')
    if (description) form.append('description', description)
    const res = await fetch(this.url('/upload'), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    debugStep('api:upload-response-status', {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    })
    if (!res.ok) throw new Error(await EpApi.readError(res))
    const data = await res.json()
    const file = data?.file
    if (!file?.url)
      throw new Error('Upload succeeded but no file URL was returned.')
    return file
  }

  /**
   * Back-compat thin wrapper: upload a captured WebP screenshot.
   * @param {string} token
   * @param {Blob} blob
   * @param {string} [description]
   * @returns {Promise<object>} file object
   */
  async uploadScreenshot(token, blob, description) {
    return this.uploadFile(token, blob, 'bugsnap.webp', description)
  }

  /**
   * Create a task.
   * @param {string} token
   * @param {{projectId:number|string, title:string, description?:string, priority?:string, status?:string, taskType?:string}} payload
   */
  async createTask(token, payload) {
    debugStep('api:create-task-request', {
      projectId: payload?.projectId,
      titleLength: payload?.title?.length,
      descriptionHasVideo: payload?.description?.includes?.('<video'),
      attachmentsBytes: payload?.attachments?.length,
    })
    const res = await fetch(this.url('/tasks'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
    debugStep('api:create-task-response-status', {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
    })
    if (!res.ok) throw new Error(await EpApi.readError(res))
    return res.json()
  }
}
