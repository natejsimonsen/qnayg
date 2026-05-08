import { initTheme } from './theme.js'

initTheme()

const params = new URLSearchParams(window.location.search)
const code = params.get('code')
if (!code) window.location.href = '/'

let questions = []
let sseConn = null
const newIds = new Set()

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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
    document.getElementById('ask-fab').style.display = 'none'
    return
  }
  const event = await res.json()
  document.getElementById('event-name').textContent = event.name
  document.title = event.name

  if (!event.active) {
    document.getElementById('ask-fab').style.display = 'none'
    document.getElementById('inactive-banner').style.display = 'block'
  }

  const qRes = await fetch(`/api/events/${code}/questions`)
  if (qRes.ok) {
    questions = await qRes.json()
    render()
  }

  setupSSE()
}

// Ask modal
const askFab = document.getElementById('ask-fab')
const askModal = document.getElementById('ask-modal')

askFab.addEventListener('click', () => {
  askModal.classList.add('modal-open')
  askFab.classList.add('active')
  setTimeout(() => document.getElementById('q-text').focus(), 50)
})

document.getElementById('ask-modal-close').addEventListener('click', closeModal)
askModal.addEventListener('click', (e) => { if (e.target === askModal) closeModal() })
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal() })

function closeModal() {
  askModal.classList.remove('modal-open')
  askFab.classList.remove('active')
}

// Render — voteFlipId triggers the flip animation on that question's count
function render(voteFlipId = null) {
  const list = document.getElementById('questions-list')
  if (questions.length === 0) {
    list.innerHTML = '<p class="empty-state">No questions yet. Be the first!</p>'
    newIds.clear()
    return
  }
  const sorted = [...questions].sort((a, b) => b.votes - a.votes || a.id - b.id)

  // FLIP: snapshot positions of existing cards before DOM changes
  const before = {}
  sorted.forEach(q => {
    const el = document.getElementById(`q-${q.id}`)
    if (el) before[q.id] = el.getBoundingClientRect().top
  })

  list.innerHTML = ''
  sorted.forEach(q => list.appendChild(makeCard(q, newIds.has(q.id))))
  newIds.clear()

  // FLIP: animate cards that moved from a known previous position
  sorted.forEach(q => {
    if (before[q.id] == null) return
    const el = document.getElementById(`q-${q.id}`)
    if (!el) return
    const after = el.getBoundingClientRect().top
    const delta = before[q.id] - after
    if (Math.abs(delta) < 1) return
    el.style.transform = `translateY(${delta}px)`
    el.style.transition = 'none'
    void el.offsetHeight
    el.style.transition = 'transform 0.3s cubic-bezier(0.2,0.8,0.4,1)'
    el.style.transform = ''
  })

  if (voteFlipId !== null) {
    const el = document.getElementById(`votes-${voteFlipId}`)
    if (el) el.classList.add('vote-flip')
  }
}

function makeCard(q, entering = false) {
  const div = document.createElement('div')
  div.className = `card question-card${entering ? ' card-entering' : ''}`
  div.id = `q-${q.id}`
  const voted = hasVoted(q.id)
  div.innerHTML = `
    <p class="q-text">${esc(q.text)}</p>
    <div class="q-meta">
      <span class="q-author">${esc(q.author_name)}</span>
      <button class="vote-btn ${voted ? 'voted' : ''}" onclick="vote(${q.id})" ${voted ? 'disabled' : ''}>
        <span class="vote-icon">👍</span>
        <span class="vote-count-wrap"><span class="vote-count" id="votes-${q.id}">${q.votes}</span></span>
      </button>
    </div>
  `
  return div
}

// Two-phase exit: slide right, then collapse height so cards below shift up
async function animateCardOut(qid) {
  const card = document.getElementById(`q-${qid}`)
  if (!card) return
  card.classList.add('card-exiting')
  await sleep(300)
  const h = card.offsetHeight
  card.style.height = h + 'px'
  card.style.overflow = 'hidden'
  card.style.transition = 'height 0.22s ease, margin-bottom 0.22s ease, padding-top 0.22s ease, padding-bottom 0.22s ease'
  void card.offsetHeight
  card.style.height = '0'
  card.style.marginBottom = '0'
  card.style.paddingTop = '0'
  card.style.paddingBottom = '0'
  await sleep(230)
}

window.vote = async function(qid) {
  if (hasVoted(qid)) return
  markVoted(qid)
  // Update button optimistically; vote count updates via SSE
  const card = document.getElementById(`q-${qid}`)
  if (card) {
    const btn = card.querySelector('.vote-btn')
    if (btn) { btn.classList.add('voted'); btn.disabled = true }
  }
  await fetch(`/api/events/${code}/questions/${qid}/vote`, { method: 'POST' })
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

  document.getElementById('q-text').value = ''
  closeModal()

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
  } else {
    const err = await res.json().catch(() => ({}))
    showToast(err.error || 'Failed to submit question.')
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
        newIds.add(data.question.id)
      }
      const pendingId = sessionStorage.getItem(`pendingQ:${code}`)
      if (pendingId && Number(pendingId) === data.question.id) {
        sessionStorage.removeItem(`pendingQ:${code}`)
      }
      render()
    } else if (data.type === 'vote_updated') {
      const q = questions.find(q => q.id === data.question_id)
      if (q) { q.votes = data.votes; render(data.question_id) }
    } else if (data.type === 'question_answered') {
      animateCardOut(data.question_id).then(() => {
        questions = questions.filter(q => q.id !== data.question_id)
        render()
      })
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
