import { initTheme } from '../theme.js'

initTheme()

const token = localStorage.getItem('token')
const user = JSON.parse(localStorage.getItem('user') || '{}')
if (!token || user.role !== 'superuser') window.location.href = '/dashboard/'

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(opts.headers || {})
    }
  })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/'
    return null
  }
  return res
}

async function loadUsers() {
  const res = await api('/api/admin/users')
  if (!res || !res.ok) return
  const users = await res.json()
  render(users)
}

function render(users) {
  const list = document.getElementById('users-list')
  if (users.length === 0) {
    list.innerHTML = '<p class="empty-state">No moderators yet.</p>'
    return
  }
  list.innerHTML = ''
  users.forEach(u => {
    const row = document.createElement('div')
    row.className = 'card user-row'
    row.innerHTML = `
      <div class="user-info">
        <span class="user-name">${esc(u.username)}</span>
        <span class="badge badge-gray">moderator</span>
      </div>
      <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>
    `
    list.appendChild(row)
  })
}

window.deleteUser = async function(id) {
  if (!confirm('Delete this moderator?')) return
  const res = await api(`/api/admin/users/${id}`, { method: 'DELETE' })
  if (res) loadUsers()
}

const form = document.getElementById('create-form')
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const username = document.getElementById('new-username').value.trim()
  const password = document.getElementById('new-password').value
  const msgEl = document.getElementById('create-msg')

  const res = await api('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  })

  if (res && res.ok) {
    document.getElementById('new-username').value = ''
    document.getElementById('new-password').value = ''
    msgEl.className = 'alert alert-success'
    msgEl.textContent = `Moderator "${username}" created.`
    msgEl.style.display = 'block'
    setTimeout(() => { msgEl.style.display = 'none' }, 3000)
    loadUsers()
  } else if (res) {
    const err = await res.json()
    msgEl.className = 'alert alert-error'
    msgEl.textContent = err.error || 'Failed to create moderator.'
    msgEl.style.display = 'block'
  }
})

document.getElementById('logout-btn').addEventListener('click', () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  window.location.href = '/'
})

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

loadUsers()
