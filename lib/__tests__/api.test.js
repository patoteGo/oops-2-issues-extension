import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EpApi } from '../api.js'

/** Minimal Response-like factory for the tests. */
function res(body, { status = 200, statusText = 'OK' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async json() {
      return body
    },
  }
}

describe('EpApi — construction', () => {
  it('strips trailing slashes from baseUrl', () => {
    expect(new EpApi('http://x.test/').baseUrl).toBe('http://x.test')
    expect(new EpApi('http://x.test///').baseUrl).toBe('http://x.test')
    expect(new EpApi('http://x.test').baseUrl).toBe('http://x.test')
    expect(new EpApi('').baseUrl).toBe('')
  })

  it('builds /api paths', () => {
    // url() is private; the observable effect is the fetch URL prefix.
    expect(new EpApi('http://x.test').baseUrl + '/api').toBe(
      'http://x.test/api'
    )
  })
})

describe('EpApi — login', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs credentials and returns {token, user}', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ token: 'tk', user: { id: 1 } }))
    const api = new EpApi('http://x.test')

    const result = await api.login('me@x.test', 'pw')

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://x.test/api/auth/login')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      username: 'me@x.test',
      password: 'pw',
    })
    expect(result).toEqual({ token: 'tk', user: { id: 1 } })
  })

  it('throws the server message on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res({ error: 'Bad credentials' }, { status: 401 })
    )
    const api = new EpApi('http://x.test')
    await expect(api.login('me', 'pw')).rejects.toThrow('Bad credentials')
  })

  it('throws when the response omits a token', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ user: {} }))
    const api = new EpApi('http://x.test')
    await expect(api.login('me', 'pw')).rejects.toThrow(/token/i)
  })
})

describe('EpApi — verify', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('returns "valid" when the server says so', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ valid: true }))
    const api = new EpApi('http://x.test')
    expect(await api.verify('tk')).toBe('valid')
  })

  it('returns "invalid" on 401/403', async () => {
    const f = vi.spyOn(globalThis, 'fetch')
    f.mockResolvedValueOnce(res({}, { status: 401 }))
    f.mockResolvedValueOnce(res({}, { status: 403 }))
    const api = new EpApi('http://x.test')
    expect(await api.verify('tk')).toBe('invalid')
    expect(await api.verify('tk')).toBe('invalid')
  })

  it('returns "invalid" when body.valid is not true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ valid: false }))
    const api = new EpApi('http://x.test')
    expect(await api.verify('tk')).toBe('invalid')
  })

  it('returns "unknown" on a transport error (does not throw)', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'))
    const api = new EpApi('http://x.test')
    await expect(api.verify('tk')).resolves.toBe('unknown')
  })
})

describe('EpApi — getProjects', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('maps rows to {id,name} and sorts by name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res([
        { id: 2, name: 'Zeta' },
        { id: 1, name: 'Alpha' },
        { id: 3, name: 'Mid' },
      ])
    )
    const api = new EpApi('http://x.test')
    const projects = await api.getProjects('tk')
    expect(projects.map(p => p.name)).toEqual(['Alpha', 'Mid', 'Zeta'])
    expect(projects.map(p => p.id)).toEqual([1, 3, 2])
  })

  it('handles a single object instead of an array', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res({ id: 9, name: 'Solo' })
    )
    const api = new EpApi('http://x.test')
    expect(await api.getProjects('tk')).toEqual([{ id: 9, name: 'Solo' }])
  })

  it('filters out rows without an id and falls back to a synthetic name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res([{ name: 'NoId' }, { id: 5 }, { id: 1, name: 'Real' }])
    )
    const api = new EpApi('http://x.test')
    const projects = await api.getProjects('tk')
    // "NoId" dropped (no id); id:5 -> synthetic "Project #5"; id:1 -> "Real".
    // Sorted by name: "Project #5" (P) sorts before "Real" (R).
    expect(projects.map(p => p.id)).toEqual([5, 1])
    expect(projects[0].name).toBe('Project #5')
    expect(projects[1].name).toBe('Real')
  })

  it('sends the bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(res([]))
    const api = new EpApi('http://x.test')
    await api.getProjects('tk')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tk')
  })
})

describe('EpApi — uploadScreenshot', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs multipart with file + metadata and returns the file object', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res({
        file: {
          id: 'f1',
          url: 'http://x.test/u/1.webp',
          name: 'bugsnap.webp',
          type: 'image/webp',
          size: 1234,
          description: 'cap',
        },
      })
    )
    const api = new EpApi('http://x.test')
    const blob = new Blob(['x'], { type: 'image/webp' })
    const file = await api.uploadScreenshot('tk', blob, 'cap')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://x.test/api/upload')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tk')
    // body is the FormData built inside the client
    const form = init.body
    expect(form).toBeInstanceOf(FormData)
    expect(form.get('file')).toBeInstanceOf(File)
    expect(form.get('entityType')).toBe('tasks')
    expect(form.get('entityId')).toBe('bugsnap')
    expect(form.get('description')).toBe('cap')
    // returns the file object verbatim
    expect(file.url).toBe('http://x.test/u/1.webp')
    expect(file.description).toBe('cap')
  })

  it('omits the description field when none is provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ file: { url: 'http://x.test/u/1.webp' } }))
    const api = new EpApi('http://x.test')
    await api.uploadScreenshot('tk', new Blob(['x']), undefined)
    const form = fetchMock.mock.calls[0][1].body
    expect(form.has('description')).toBe(false)
  })

  it('throws when the server returns no file url', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(res({ file: {} }))
    const api = new EpApi('http://x.test')
    await expect(
      api.uploadScreenshot('tk', new Blob(['x']), '')
    ).rejects.toThrow(/no file URL/i)
  })
})

describe('EpApi — uploadFile', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs multipart with a custom filename + description and returns the file', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res({
        file: {
          id: 'f9',
          url: 'http://x.test/u/report.pdf',
          name: 'report.pdf',
          type: 'application/pdf',
          size: 9999,
          description: 'prod log',
        },
      })
    )
    const api = new EpApi('http://x.test')
    const blob = new Blob(['x'], { type: 'application/pdf' })
    const file = await api.uploadFile('tk', blob, 'report.pdf', 'prod log')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://x.test/api/upload')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer tk')
    const form = init.body
    expect(form).toBeInstanceOf(FormData)
    const sent = form.get('file')
    expect(sent).toBeInstanceOf(File)
    expect(sent.name).toBe('report.pdf')
    expect(form.get('entityType')).toBe('tasks')
    expect(form.get('entityId')).toBe('bugsnap')
    expect(form.get('description')).toBe('prod log')
    expect(file.url).toBe('http://x.test/u/report.pdf')
  })

  it('omits the description field when none is provided', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ file: { url: 'http://x.test/u/1' } }))
    const api = new EpApi('http://x.test')
    await api.uploadFile('tk', new Blob(['x']), 'a.txt', undefined)
    const form = fetchMock.mock.calls[0][1].body
    expect(form.has('description')).toBe(false)
  })

  it('falls back to a default filename when none is given', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ file: { url: 'http://x.test/u/1' } }))
    const api = new EpApi('http://x.test')
    await api.uploadFile('tk', new Blob(['x']), '', '')
    const form = fetchMock.mock.calls[0][1].body
    expect(form.get('file').name).toBe('file')
  })
})

describe('EpApi — uploadScreenshot delegates to uploadFile', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('sends the fixed bugsnap.webp filename', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ file: { url: 'http://x.test/u/1.webp' } }))
    const api = new EpApi('http://x.test')
    await api.uploadScreenshot(
      'tk',
      new Blob(['x'], { type: 'image/webp' }),
      'cap'
    )
    const form = fetchMock.mock.calls[0][1].body
    expect(form.get('file').name).toBe('bugsnap.webp')
    expect(form.get('description')).toBe('cap')
  })
})

describe('EpApi — createTask', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('POSTs the payload as JSON with the bearer token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(res({ id: 42 }))
    const api = new EpApi('http://x.test')
    const payload = {
      projectId: 7,
      title: 'Bug',
      description: 'd',
      priority: 'high',
      status: 'open',
      taskType: 'bug_fix',
      attachments: '[]',
      checklist: null,
    }
    const result = await api.createTask('tk', payload)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://x.test/api/tasks')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.headers.Authorization).toBe('Bearer tk')
    expect(JSON.parse(init.body)).toEqual(payload)
    expect(result).toEqual({ id: 42 })
  })

  it('throws the server message on failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      res({ message: 'Project not found' }, { status: 404 })
    )
    const api = new EpApi('http://x.test')
    await expect(
      api.createTask('tk', { projectId: 1, title: 'x' })
    ).rejects.toThrow('Project not found')
  })
})
