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
  document.getElementById('presenter-title').textContent = eventData.name
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
  document.getElementById('pending-count').textContent = pending.length
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
  const sorted = [...approved].sort((a, b) => b.votes - a.votes)
  document.getElementById('approved-count').textContent = approved.length
  if (sorted.length === 0) {
    list.innerHTML = '<p class="empty-state">No approved questions yet</p>'
  } else {
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
  renderPresenter()
}

function renderPresenter() {
  const list = document.getElementById('presenter-list')
  const sorted = [...approved].sort((a, b) => b.votes - a.votes)
  if (sorted.length === 0) {
    list.innerHTML = '<p class="empty-state" style="font-size:1.1rem;">No questions yet — waiting for audience...</p>'
    return
  }
  list.innerHTML = ''
  sorted.forEach((q, i) => {
    const card = document.createElement('div')
    card.className = `presenter-card${i === 0 ? ' top-q' : ''}`
    card.innerHTML = `
      <div class="presenter-rank">${i + 1}</div>
      <div class="presenter-body">
        <p class="presenter-text">${esc(q.text)}</p>
        <div class="presenter-meta">
          <span class="presenter-author">— ${esc(q.author_name)}</span>
          <span class="presenter-votes">▲ ${q.votes}</span>
        </div>
      </div>
    `
    list.appendChild(card)
  })
}

window.approve = async function(qid) {
  const btn = document.querySelector(`#pending-${qid} .btn-success`)
  if (btn) btn.disabled = true
  const res = await api(`/api/mod/questions/${qid}/approve`, { method: 'PUT' })
  if (res && res.ok) {
    const q = await res.json()
    pending = pending.filter(p => p.id !== qid)
    approved.push(q)
    renderPending()
    renderApproved()
  } else if (btn) {
    btn.disabled = false
  }
}

window.reject = async function(qid) {
  const btn = document.querySelector(`#pending-${qid} .btn-danger`)
  if (btn) btn.disabled = true
  const res = await api(`/api/mod/questions/${qid}/reject`, { method: 'PUT' })
  if (res && res.ok) {
    pending = pending.filter(p => p.id !== qid)
    renderPending()
  } else if (btn) {
    btn.disabled = false
  }
}

window.markAnswered = async function(qid) {
  const btn = document.querySelector(`#approved-${qid} button`)
  if (btn) btn.disabled = true
  const res = await api(`/api/mod/questions/${qid}/answered`, { method: 'PUT' })
  if (res && res.ok) {
    approved = approved.filter(q => q.id !== qid)
    renderApproved()
  } else if (btn) {
    btn.disabled = false
  }
}

// QR modal
document.getElementById('qr-btn').addEventListener('click', async () => {
  const modal = document.getElementById('qr-modal')
  document.getElementById('event-code-modal').textContent = eventData?.code || ''
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

// Presenter view
document.getElementById('presenter-btn').addEventListener('click', () => {
  document.getElementById('presenter-overlay').style.display = 'flex'
})
document.getElementById('presenter-close').addEventListener('click', () => {
  document.getElementById('presenter-overlay').style.display = 'none'
})
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('presenter-overlay').style.display = 'none'
    document.getElementById('qr-modal').style.display = 'none'
  }
})

function setupSSE() {
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
