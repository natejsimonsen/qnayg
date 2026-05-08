import { initTheme } from '../theme.js'

initTheme()

const token = localStorage.getItem('token')
if (!token) window.location.href = '/'

const user = JSON.parse(localStorage.getItem('user') || '{}')
let events = []

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  })
  if (res.status === 401) { logout(); return null }
  return res
}

function logout() {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/'
}

async function loadEvents() {
  const res = await api('/api/mod/events')
  if (!res) return
  events = await res.json()
  render()
}

function render() {
  document.getElementById('user-name').textContent = user.username || ''
  const usersLink = document.getElementById('users-link')
  if (usersLink) usersLink.style.display = user.role === 'superuser' ? 'inline-flex' : 'none'

  const list = document.getElementById('events-list')
  if (events.length === 0) {
    list.innerHTML = '<p class="empty-state">No events yet. Create your first one!</p>'
    return
  }
  list.innerHTML = ''
  events.forEach(ev => {
    const card = document.createElement('div')
    card.className = 'card event-card'
    card.innerHTML = `
      <div class="event-card-header">
        <div>
          <h3 class="event-name">${esc(ev.name)}</h3>
          <span class="event-code">Code: <strong>${ev.code}</strong></span>
        </div>
        <span class="badge ${ev.active ? 'badge-green' : 'badge-gray'}">${ev.active ? 'Active' : 'Inactive'}</span>
      </div>
      <div class="event-card-actions">
        <a href="/event/?id=${ev.id}" class="btn btn-primary btn-sm">Manage</a>
        <button onclick="toggleActive(${ev.id}, ${!ev.active})" class="btn btn-ghost btn-sm">
          ${ev.active ? 'Deactivate' : 'Activate'}
        </button>
        <button onclick="deleteEvent(${ev.id})" class="btn btn-danger btn-sm">Delete</button>
      </div>
    `
    list.appendChild(card)
  })
}

window.toggleActive = async function(id, active) {
  const ev = events.find(e => e.id === id)
  if (!ev) return
  await api(`/api/mod/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: ev.name, active })
  })
  loadEvents()
}

window.deleteEvent = async function(id) {
  if (!confirm('Delete this event? This cannot be undone.')) return
  await api(`/api/mod/events/${id}`, { method: 'DELETE' })
  loadEvents()
}

const form = document.getElementById('create-form')
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const name = document.getElementById('event-name').value.trim()
  if (!name) return
  const btn = form.querySelector('[type=submit]')
  if (btn.disabled) return
  btn.disabled = true
  const res = await api('/api/mod/events', {
    method: 'POST',
    body: JSON.stringify({ name })
  })
  btn.disabled = false
  if (res && res.ok) {
    document.getElementById('event-name').value = ''
    document.getElementById('create-section').classList.remove('open')
    document.getElementById('show-create').classList.remove('active')
    loadEvents()
  }
})

document.getElementById('show-create').addEventListener('click', () => {
  const section = document.getElementById('create-section')
  const fab = document.getElementById('show-create')
  const opening = !section.classList.contains('open')
  section.classList.toggle('open', opening)
  fab.classList.toggle('active', opening)
})

document.getElementById('logout-btn').addEventListener('click', logout)

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

loadEvents()
