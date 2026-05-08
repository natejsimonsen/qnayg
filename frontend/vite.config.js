import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/api': 'http://localhost:8080'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        event: resolve(__dirname, 'event/index.html'),
        display: resolve(__dirname, 'display/index.html'),
        adminLogin: resolve(__dirname, 'admin/index.html'),
        adminDashboard: resolve(__dirname, 'admin/dashboard/index.html'),
        adminEvent: resolve(__dirname, 'admin/event/index.html'),
        adminUsers: resolve(__dirname, 'admin/users/index.html'),
      }
    }
  }
})
