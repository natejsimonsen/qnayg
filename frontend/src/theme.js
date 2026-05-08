import './styles.css'

export function initTheme() {
  const stored = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const theme = stored || (prefersDark ? 'dark' : 'light')
  applyTheme(theme)

  const toggle = document.getElementById('theme-toggle')
  if (toggle) {
    toggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme')
      const next = current === 'dark' ? 'light' : 'dark'
      applyTheme(next)
      localStorage.setItem('theme', next)
    })
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme)
  const toggle = document.getElementById('theme-toggle')
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '☀' : '☾'
  }
}
