import { initTheme } from './theme.js'

initTheme()

const form = document.getElementById('join-form')
const input = document.getElementById('code-input')
const errorEl = document.getElementById('error')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const code = input.value.trim().toUpperCase()
  if (!code) return

  errorEl.textContent = ''
  const res = await fetch(`/api/events/${code}`)
  if (!res.ok) {
    errorEl.textContent = 'Event not found. Check your code and try again.'
    return
  }
  const event = await res.json()
  if (!event.active) {
    errorEl.textContent = 'This event is not currently accepting questions.'
    return
  }
  window.location.href = `/event/?code=${code}`
})
