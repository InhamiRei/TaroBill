<div align="center">
  <img src="./assets/app-icons/tarobill.png" width="128" alt="TaroBill 应用图标" />
  <h1>TaroBill</h1>
  <p><strong>一个本地优先的桌面支出账单应用，按月和年度清晰查看人民币支出。</strong></p>
  <p>
    <img alt="macOS" src="https://img.shields.io/badge/platform-macOS-111827?logo=apple&logoColor=white" />
    <img alt="Windows" src="https://img.shields.io/badge/platform-Windows-111827?logo=windows11&logoColor=white" />
    <img alt="Electron" src="https://img.shields.io/badge/Electron-33-47848F?logo=electron" />
    <img alt="React" src="https://img.shields.io/badge/React-18-149ECA?logo=react" />
  </p>
</div>

## 功能

- 默认提供“AI账单”和“药屋账单”，支持新增、重命名和删除类型。
- 记录内容、人民币金额和精确到分钟的发生时间。
- 月度日历、每日支出折线图和年度十二个月柱状图。
- 浅色/深色主题，以及本地 JSON 导入和导出。
- 数据完全保存在本机，不需要账号或网络服务。

## 开发运行

```bash
nvm install
nvm use
npm install
npm start
```

普通浏览器视觉预览：

```bash
npm run preview:web
```

## 检查与构建

```bash
npm run typecheck
npm test
npm run build
```

## 打包

```bash
npm run dist:mac   # macOS arm64 dmg/zip
npm run dist:win   # Windows x64 NSIS exe
npm run dist:all   # 同时构建两端
```

产物保存在 `release/` 目录。macOS 使用可验证完整性的 ad-hoc 签名但未公证；Windows 安装包未签名，首次运行时可能出现 SmartScreen 提示。

## 数据位置

- macOS：`~/Library/Application Support/TaroBill/data.json`
- Windows：`%APPDATA%\TaroBill\data.json`

金额以整数分存储，发生时间以本地 `YYYY-MM-DDTHH:mm` 保存，避免浮点累计误差和时区导致的跨日问题。
