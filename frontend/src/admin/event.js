import { initTheme } from '../theme.js'

initTheme()

const token = localStorage.getItem('token')
if (!token) window.location.href = '/'

const params = new URLSearchParams(window.location.search)
const eventId = params.get('id')
if (!eventId) window.location.href = '/dashboard/'

let pending = []
let approved = []
let eventData = null

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

async function init() {
  const res = await api(`/api/mod/events/${eventId}`)
  if (!res || !res.ok) {
    document.getElementById('event-title').textContent = 'Event not found'
    return
  }
  eventData = await res.json()
  document.getElementById('event-title').textContent = eventData.name
  document.getElementById('event-code').textContent = eventData.code
  document.title = `Moderate: ${eventData.name}`

  await loadQuestions()
  setupSSE()
}

async function loadQuestions() {
  const [pendRes, appRes] = await Promise.all([
    api(`/api/mod/events/${eventId}/questions/pending`),
    fetch(`/api/events/${eventData.code}/questions`)
  ])
  if (pendRes && pendRes.ok) pending = await pendRes.json()
  if (appRes && appRes.ok) approved = await appRes.json()
  renderPending()
  renderApproved()
}

function renderPending() {
  const list = document.getElementById('pending-list')
  const count = document.getElementById('pending-count')
  count.textContent = pending.length
  if (pending.length === 0) {
    list.innerHTML = '<p class="empty-state">No pending questions</p>'
    return
  }
  list.innerHTML = ''
  pending.forEach(q => {
    const card = document.createElement('div')
    card.className = 'card question-mod-card'
    card.id = `pending-${q.id}`
    card.innerHTML = `
      <p class="q-text">${esc(q.text)}</p>
      <p class="q-author-small">— ${esc(q.author_name)}</p>
      <div class="mod-actions">
        <button class="btn btn-success btn-sm" onclick="approve(${q.id})">✓ Approve</button>
        <button class="btn btn-danger btn-sm" onclick="reject(${q.id})">✕ Reject</button>
      </div>
    `
    list.appendChild(card)
  })
}

function renderApproved() {
  const list = document.getElementById('approved-list')
  const count = document.getElementById('approved-count')
  const sorted = [...approved].sort((a, b) => b.votes - a.votes)
  count.textContent = approved.length
  if (sorted.length === 0) {
    list.innerHTML = '<p class="empty-state">No approved questions</p>'
    return
  }
  list.innerHTML = ''
  sorted.forEach(q => {
    const card = document.createElement('div')
    card.className = 'card question-mod-card'
    card.id = `approved-${q.id}`
    card.innerHTML = `
      <div class="q-votes-badge">▲ ${q.votes}</div>
      <p class="q-text">${esc(q.text)}</p>
      <p class="q-author-small">— ${esc(q.author_name)}</p>
      <div class="mod-actions">
        <button class="btn btn-ghost btn-sm" onclick="markAnswered(${q.id})">✓ Mark Answered</button>
      </div>
    `
    list.appendChild(card)
  })
}

window.approve = async function(qid) {
  const res = await api(`/api/mod/questions/${qid}/approve`, { method: 'PUT' })
  if (res && res.ok) {
    const q = await res.json()
    pending = pending.filter(p => p.id !== qid)
    approved.push(q)
    renderPending()
    renderApproved()
  }
}

window.reject = async function(qid) {
  const res = await api(`/api/mod/questions/${qid}/reject`, { method: 'PUT' })
  if (res && res.ok) {
    pending = pending.filter(p => p.id !== qid)
    renderPending()
  }
}

window.markAnswered = async function(qid) {
  const res = await api(`/api/mod/questions/${qid}/answered`, { method: 'PUT' })
  if (res && res.ok) {
    approved = approved.filter(q => q.id !== qid)
    renderApproved()
  }
}

document.getElementById('qr-btn').addEventListener('click', async () => {
  const modal = document.getElementById('qr-modal')
  modal.style.display = 'flex'
  const res = await api(`/api/mod/events/${eventId}/qr`)
  if (res && res.ok) {
    const blob = await res.blob()
    document.getElementById('qr-img').src = URL.createObjectURL(blob)
  }
})

document.getElementById('qr-modal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.style.display = 'none'
})

document.getElementById('qr-close').addEventListener('click', () => {
  document.getElementById('qr-modal').style.display = 'none'
})

function setupSSE() {
  // Pass token as query param since EventSource doesn't support custom headers
  const es = new EventSource(`/api/mod/events/${eventId}/stream?token=${encodeURIComponent(token)}`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.type === 'question_pending') {
      pending.push(data.question)
      renderPending()
    } else if (data.type === 'question_status_changed') {
      pending = pending.filter(q => q.id !== data.question_id)
      if (data.status === 'approved' && data.question) {
        approved.push(data.question)
      }
      renderPending()
      renderApproved()
    } else if (data.type === 'vote_updated') {
      const q = approved.find(q => q.id === data.question_id)
      if (q) { q.votes = data.votes; renderApproved() }
    } else if (data.type === 'question_answered') {
      approved = approved.filter(q => q.id !== data.question_id)
      renderApproved()
    }
  }
  es.onerror = () => setTimeout(setupSSE, 3000)
}

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

init()
