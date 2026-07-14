import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.less'

// React 严格模式帮助开发期发现副作用，生产构建不会重复执行渲染。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

