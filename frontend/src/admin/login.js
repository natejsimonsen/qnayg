import { initTheme } from '../theme.js'

initTheme()

if (localStorage.getItem('token')) {
  window.location.href = '/dashboard/'
}

const form = document.getElementById('login-form')
const errorEl = document.getElementById('error')

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  const username = document.getElementById('username').value.trim()
  const password = document.getElementById('password').value

  errorEl.style.display = 'none'

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })

  if (!res.ok) {
    errorEl.textContent = 'Invalid username or password.'
    errorEl.style.display = 'block'
    return
  }

  const data = await res.json()
  localStorage.setItem('token', data.token)
  localStorage.setItem('user', JSON.stringify(data.user))
  window.location.href = '/dashboard/'
})
