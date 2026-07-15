import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

// 独立 Vite 配置只服务浏览器视觉预览，正式桌面构建仍由 electron-vite 负责。
export default defineConfig({
  // 与 electron.vite 保持同一来源，浏览器预览也能看到与 package.json 同步的版本号。
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react()],
});
