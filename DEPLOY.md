# Zentrm 服务器部署指南

## 环境要求

- Linux 服务器（Ubuntu 、Debian、CentOS 均可）
- Node.js >= 22.x（推荐 v24.16.0）
- Nginx、OpenResty、Tengine、Apache 等 Web 服务器均支持（Web 环境需自行安装）
- 已构建好的 `dist` 文件

---

## 一、安装 Node.js

```bash
# 创建目录
mkdir -p /www/server/nodejs

# 下载 Node.js v24.16.0
wget -O /www/server/nodejs/node.tar.xz https://npmmirror.com/mirrors/node/v24.16.0/node-v24.16.0-linux-x64.tar.xz

# 解压到指定路径
tar -xJf /www/server/nodejs/node.tar.xz -C /www/server/nodejs --strip-components=1

# 配置环境变量（永久生效）
echo 'export PATH=/www/server/nodejs/bin:$PATH' >> /etc/profile

# 强制刷新配置文件，让当前终端加载最新 PATH
source /etc/profile
source ~/.bashrc

# 验证版本
node -v   # 应输出 v24.16.0
npm -v

# 配置淘宝 npm 镜像源
npm config set registry https://registry.npmmirror.com
```

---

## 二、上传文件

将本地打包的 `dist` 文件 和 `server` 目录上传到服务器的网站根目录

```
/usr/local/openresty/nginx/html/
├── index.html          ← dist/index.html
├── favicon.ico         ← dist/favicon.ico
├── css/                ← dist/css/
├── js/                 ← dist/js/
├── fonts/              ← dist/fonts/
└── server/             ← server/（整个文件夹）
    ├── index.js
    ├── package.json
    └── package-lock.json
```

### 上传方式

**宝塔面板**

1. 进入宝塔面板 → 文件 → `/usr/local/openresty/nginx/html/`
2. 上传 `dist` 里的所有文件和文件夹（index.html、favicon.ico、css、js、fonts）
3. 上传 `server` 整个文件夹

---

## 三、安装依赖并启动后端

```bash
# 进入 server 目录
cd /usr/local/openresty/nginx/html/server

# 安装依赖
npm install

# 安装 ssh2 模块
npm install ssh2@latest --save

# 启动后端服务（nohup 后台运行，断开 SSH 不会中断）
nohup node index.js > /tmp/zentrm.log 2>&1 &

# 确认在跑
ps aux | grep "node index.js"

# 查看日志
tail -f /tmp/zentrm.log
```

看到以下输出说明启动成功

```
=========================================
  Zentrm v1.0
  http://localhost:3000
  WebSocket: ws://localhost:3000
=========================================
```

启动成功后即可使用 IP 或域名访问，例如 `http://110.110.110.110/` 或 `http://demo.xxx.cn/`

---

## 四、配置开机自启（推荐 systemd）

创建服务文件

```bash
cat > /etc/systemd/system/zentrm.service << 'EOF'
[Unit]
Description=Zentrm Server
After=network.target

[Service]
WorkingDirectory=/usr/local/openresty/nginx/html/server
ExecStart=/www/server/nodejs/bin/node index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
```

加载配置、设置开机自启并启动

```bash
systemctl daemon-reload && systemctl enable zentrm && systemctl start zentrm
```

> **命令说明**
> - `daemon-reload`：重新加载 systemd 配置，让系统识别刚创建的 zentrm.service 文件
> - `enable zentrm`：设置开机自启，服务器重启后 Zentrm 会自动启动
> - `start zentrm`：立即启动 Zentrm 服务

常用管理命令：

```bash
# 查看状态
systemctl status zentrm

# 停止服务
systemctl stop zentrm

# 重启服务
systemctl restart zentrm

# 查看日志
journalctl -u zentrm -f
```
