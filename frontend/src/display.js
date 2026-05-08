import { initTheme } from './theme.js'

initTheme()

const params = new URLSearchParams(window.location.search)
const code = params.get('code')
if (!code) window.location.href = '/'

let questions = []

async function init() {
  const res = await fetch(`/api/events/${code}`)
  if (!res.ok) {
    document.getElementById('event-name').textContent = 'Event not found'
    return
  }
  const event = await res.json()
  document.getElementById('event-name').textContent = event.name
  document.title = event.name

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
    list.innerHTML = '<p class="empty-state">Waiting for questions...</p>'
    return
  }
  const sorted = [...questions].sort((a, b) => b.votes - a.votes)
  list.innerHTML = ''
  sorted.forEach((q, i) => {
    const div = document.createElement('div')
    div.className = `display-card ${i === 0 ? 'top-question' : ''}`
    div.id = `q-${q.id}`
    div.innerHTML = `
      <div class="display-rank">${i + 1}</div>
      <div class="display-content">
        <p class="display-text">${esc(q.text)}</p>
        <div class="display-meta">
          <span class="display-author">${esc(q.author_name)}</span>
          <span class="display-votes">▲ ${q.votes}</span>
        </div>
      </div>
    `
    list.appendChild(div)
  })
}

function setupSSE() {
  const es = new EventSource(`/api/events/${code}/stream`)
  es.onmessage = (e) => {
    const data = JSON.parse(e.data)
    if (data.type === 'question_new') {
      questions.push(data.question)
      render()
    } else if (data.type === 'vote_updated') {
      const q = questions.find(q => q.id === data.question_id)
      if (q) { q.votes = data.votes; render() }
    } else if (data.type === 'question_answered') {
      questions = questions.filter(q => q.id !== data.question_id)
      render()
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
