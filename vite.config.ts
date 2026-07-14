import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 独立 Vite 配置只服务浏览器视觉预览，正式桌面构建仍由 electron-vite 负责。
export default defineConfig({
  plugins: [react()]
})
