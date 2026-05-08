import { initTheme } from './theme.js'

initTheme()

const params = new URLSearchParams(window.location.search)
const code = params.get('code')
if (!code) window.location.href = '/'

let questions = []
let sseConn = null

// Toast
function showToast(msg, type = 'error') {
  let container = document.getElementById('toast-container')
  if (!container) {
    container = document.createElement('div')
    container.id = 'toast-container'
    container.className = 'toast-container'
    document.body.appendChild(container)
  }
  const t = document.createElement('div')
  t.className = `toast toast-${type}`
  t.textContent = msg
  container.appendChild(t)
  setTimeout(() => t.remove(), 4000)
}

async function init() {
  const res = await fetch(`/api/events/${code}`)
  if (!res.ok) {
    document.getElementById('event-name').textContent = 'Event not found'
    return
  }
  const event = await res.json()
  document.getElementById('event-name').textContent = event.name
  document.title = event.name

  if (!event.active) {
    document.getElementById('submit-section').style.display = 'none'
    document.getElementById('inactive-banner').style.display = 'block'
  }

  const qRes = await fetch(`/api/events/${code}/questions`)
  if (qRes.ok) {
    questions = await qRes.json()
    render()
  }

  setupSSE()
}

function render() {
  const list = document.getElementById('questions-list')
  if (questions.length === 0) {
    list.innerHTML = '<p class="empty-state">No questions yet. Be the first!</p>'
    return
  }
  const sorted = [...questions].sort((a, b) => b.votes - a.votes)
  list.innerHTML = ''
  sorted.forEach(q => list.appendChild(makeCard(q)))
}

function makeCard(q) {
  const div = document.createElement('div')
  div.className = 'card question-card'
  div.id = `q-${q.id}`
  const voted = hasVoted(q.id)
  div.innerHTML = `
    <p class="q-text">${esc(q.text)}</p>
    <div class="q-meta">
      <span class="q-author">${esc(q.author_name)}</span>
      <button class="vote-btn ${voted ? 'voted' : ''}" onclick="vote(${q.id})" ${voted ? 'disabled' : ''}>
        ▲ <span id="votes-${q.id}">${q.votes}</span>
      </button>
    </div>
  `
  return div
}

window.vote = async function(qid) {
  if (hasVoted(qid)) return
  const res = await fetch(`/api/events/${code}/questions/${qid}/vote`, { method: 'POST' })
  if (res.ok) {
    markVoted(qid)
    const data = await res.json()
    const q = questions.find(q => q.id === qid)
    if (q) { q.votes = data.votes; render() }
  }
}

function hasVoted(qid) {
  return JSON.parse(localStorage.getItem('voted') || '[]').includes(qid)
}

function markVoted(qid) {
  const v = JSON.parse(localStorage.getItem('voted') || '[]')
  v.push(qid)
  localStorage.setItem('voted', JSON.stringify(v))
}

const form = document.getElementById('question-form')
form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = document.getElementById('q-text').value.trim()
  const author = document.getElementById('q-author').value.trim()
  const msgEl = document.getElementById('submit-msg')
  if (!text) return

  const btn = form.querySelector('[type=submit]')
  if (btn.disabled) return
  btn.disabled = true

  const res = await fetch(`/api/events/${code}/questions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, author_name: author || 'Anonymous' })
  })

  btn.disabled = false

  if (res.ok) {
    const data = await res.json()
    sessionStorage.setItem(`pendingQ:${code}`, String(data.id))
    document.getElementById('q-text').value = ''
    msgEl.className = 'alert alert-success'
    msgEl.textContent = 'Question submitted!'
    msgEl.style.display = 'block'
    setTimeout(() => { msgEl.style.display = 'none' }, 3000)
  } else {
    const err = await res.json()
    msgEl.className = 'alert alert-error'
    msgEl.textContent = err.error || 'Failed to submit question.'
    msgEl.style.display = 'block'
    setTimeout(() => { msgEl.style.display = 'none' }, 4000)
  }
})

function setupSSE() {
  if (sseConn) sseConn.close()
  sseConn = new EventSource(`/api/events/${code}/stream`)
  sseConn.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.type === 'question_new') {
      if (!questions.find(q => q.id === data.question.id)) {
        questions.push(data.question)
      }
      const pendingId = sessionStorage.getItem(`pendingQ:${code}`)
      if (pendingId && Number(pendingId) === data.question.id) {
        sessionStorage.removeItem(`pendingQ:${code}`)
      }
      render()
    } else if (data.type === 'vote_updated') {
      const q = questions.find(q => q.id === data.question_id)
      if (q) { q.votes = data.votes; render() }
    } else if (data.type === 'question_answered') {
      questions = questions.filter(q => q.id !== data.question_id)
      render()
    } else if (data.type === 'question_rejected') {
      const pendingId = sessionStorage.getItem(`pendingQ:${code}`)
      if (pendingId && Number(pendingId) === data.question_id) {
        sessionStorage.removeItem(`pendingQ:${code}`)
        showToast('Your question was not approved.')
      }
    }
  }
  sseConn.onerror = () => setTimeout(setupSSE, 3000)
}

function esc(str) {
  const d = document.createElement('div')
  d.textContent = str
  return d.innerHTML
}

init()
