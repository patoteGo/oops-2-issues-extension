/**
 * BugSnap — auth (sign in/out, session bootstrap) + project selection.
 *
 * The JWT is stored by the caller (chrome.storage.local) and verified on load;
 * a server-confirmed 'invalid' clears the session, a transient 'unknown'
 * (network blip) keeps it (the token is valid for 30 days).
 */
import {
  DEFAULT_API,
  el,
  state,
  api,
  setStatus,
  setBusy,
  setButtonLoading,
  showView,
} from './core.js'
import { restoreDraft } from './draft.js'

export async function bootstrapSession() {
  const stored = await chrome.storage.local.get(['apiBaseUrl', 'token', 'user'])
  state.apiBaseUrl = stored.apiBaseUrl || DEFAULT_API
  state.token = stored.token || null
  state.user = stored.user || null
  el.settingsApiUrl.value = state.apiBaseUrl

  if (state.token) {
    const result = await api().verify(state.token)
    if (result === 'invalid') {
      // Server explicitly rejected the token — clear and ask to sign in again.
      await clearSession()
      showView('auth')
      setStatus('idle', 'Session expired. Please sign in.')
      return
    }
    // 'valid' OR 'unknown' (transient network error): keep the session and
    // proceed — the JWT is valid for 30 days, so don't log out on a blip.
    await enterCompose()
  } else {
    showView('auth')
  }
}

async function clearSession() {
  state.token = null
  state.user = null
  await chrome.storage.local.remove(['token', 'user'])
}

export function renderUserChip() {
  const u = state.user
  if (!u) {
    el.userChip.hidden = true
    el.logoutBtn.hidden = true
    return
  }
  el.userChip.hidden = false
  el.logoutBtn.hidden = false
  const name = u.name || u.username || 'user'
  el.chipName.textContent = name.split(' ')[0] // first name only = compact
  el.chipAvatar.textContent = (name[0] || '?').toUpperCase()
}

export async function handleLogin(e) {
  e.preventDefault()
  setBusy(true)
  setButtonLoading(el.loginBtn, true, 'Signing in…')
  setStatus('busy', 'Signing in…')
  try {
    // The identifier may be an email or a username; the backend resolves both.
    // It travels in the `username` field for backward compat with the web app.
    state.apiBaseUrl = state.apiBaseUrl || DEFAULT_API
    const { token, user } = await api().login(
      el.email.value.trim(),
      el.password.value
    )
    state.token = token
    state.user = user
    await chrome.storage.local.set({
      apiBaseUrl: state.apiBaseUrl,
      token,
      user,
    })
    el.password.value = ''
    renderUserChip()
    setStatus('ok', `Signed in as ${user.username || user.name || 'user'}.`)
    await enterCompose()
  } catch (err) {
    setStatus('err', err?.message || 'Sign in failed.')
  } finally {
    setButtonLoading(el.loginBtn, false, 'Sign in')
    setBusy(false)
  }
}

export async function handleLogout() {
  await clearSession()
  renderUserChip()
  showView('auth')
  setStatus('idle', 'Signed out.')
}

async function enterCompose() {
  renderUserChip()
  showView('compose')
  await loadProjects()
  await restoreDraft()
}

// ----- Projects --------------------------------------------------------
export async function loadProjects() {
  setButtonLoading(el.refreshProjects, true)
  el.project.replaceChildren(
    Object.assign(document.createElement('option'), {
      textContent: 'Loading…',
      value: '',
    })
  )
  try {
    state.projects = await api().getProjects(state.token)
    renderProjectSelect()
  } catch (err) {
    el.project.replaceChildren(
      Object.assign(document.createElement('option'), {
        textContent: 'Failed to load',
        value: '',
      })
    )
    setStatus('err', err?.message || 'Could not load projects.')
  } finally {
    setButtonLoading(el.refreshProjects, false)
  }
}

function renderProjectSelect() {
  el.project.replaceChildren()
  const placeholder = document.createElement('option')
  placeholder.value = ''
  placeholder.textContent = state.projects.length
    ? 'Select a project…'
    : 'No projects found'
  el.project.appendChild(placeholder)
  for (const p of state.projects) {
    const o = document.createElement('option')
    o.value = String(p.id)
    o.textContent = p.name
    el.project.appendChild(o)
  }
}
