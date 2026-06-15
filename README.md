<div align="center">

# Zentrm

**Web-based Linux Remote Management Tool**

基于 Vue 2 + Node.js 的 Web 端 Linux 远程管理工具，支持 SSH 终端、SFTP 文件管理、系统监控等功能。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22-green.svg)](https://nodejs.org/)

</div>

---

## Features / 功能特性

- 🔗 **SSH Terminal** — Password & private key authentication, multi-tab terminal
- 📁 **File Manager** — SFTP browse/edit/delete files, create directories, quick path navigation
- 📊 **System Monitor** — Real-time CPU, memory, disk, uptime monitoring
- 📋 **System Log** — View and clear system logs (journalctl)
- 💾 **Connection Manager** — Save connections, one-click reconnect

## Tech Stack / 技术栈

| Layer | Technology |
|-------|-----------|
| Frontend | Vue 2 + Vue Router + Vuex + Element UI |
| Terminal | xterm.js + xterm-addon-fit + xterm-addon-web-links |
| Backend | Node.js + Express + ws |
| SSH | ssh2 |
| Communication | WebSocket |

## Quick Start / 快速开始

### Prerequisites / 环境要求

- **Node.js** >= 22.x — [Download](https://registry.npmmirror.com/-/binary/node/v22.22.3/node-v22.22.3-x64.msi)

### Install & Run / 安装与运行

```bash
# Clone the repository
git clone https://github.com/Zentrm/Zentrm.git
cd zentrm

# Install frontend dependencies
npm install

# Install backend dependencies
cd server && npm install && cd ..

# Start development server (frontend + backend)
npm run dev
```

Open your browser at **http://localhost:8080**

## Production Deployment / 生产部署

```bash
# Build for production
npm run build
```

The built files will be in the `dist` directory.

### Deployment Checklist / 部署清单

1. Serve `dist` directory via Nginx or other web server
2. Run the backend service `server/index.js`
3. Configure Nginx reverse proxy for WebSocket (`/ws`)

### Nginx Config Example / Nginx 配置示例

```nginx
    server {
        listen       80;
        server_name  localhost;

        location / {
            root   html;
            index  index.html index.htm;
        }

    location /ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

## Project Structure / 项目结构

```
zentrm/
├── public/                 # Static assets
├── server/                 # Backend service
│   ├── index.js            # Express + WebSocket + SSH
│   └── package.json
├── src/                    # Frontend source
│   ├── layouts/            # Layout components
│   ├── router/             # Vue Router config
│   ├── store/              # Vuex state management
│   ├── utils/              # Utilities (WebSocket manager)
│   ├── views/              # Page components
│   │   ├── Terminal.vue    # SSH terminal
│   │   ├── Connections.vue # Connection manager
│   │   ├── FileManager.vue # File manager
│   │   └── Monitor.vue    # System monitor
│   ├── App.vue
│   └── main.js
├── vue.config.js
└── package.json
```

## Contributing / 贡献

Issues and Pull Requests are welcome!

## License

[MIT](LICENSE) © 2026 Zentrm
