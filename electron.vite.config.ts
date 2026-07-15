import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// 主进程、预加载脚本和渲染进程分别构建，保持 Electron 权限边界清晰。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/main.ts')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    root: '.',
    // 版本号取自 package.json，define 在构建期替换，改版本时侧栏标签自动同步。
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version)
    },
    plugins: [react()],
    server: {
      watch: {
        ignored: ['**/release/**', '**/out/**']
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'index.html')
      }
    }
  }
})

