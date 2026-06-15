const express = require('express')
const http = require('http')
const WebSocket = require('ws')
const { Client: SSHClient } = require('ssh2')
const crypto = require('crypto')
const path = require('path')

const app = express()
app.use(express.json())
const server = http.createServer(app)

// 静态文件服务（生产环境）
app.use(express.static(path.join(__dirname, '../dist')))

// SPA fallback：所有非 API/WS 请求返回 index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'))
})

// CORS（开发环境跨域）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// 健康检查接口
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// WebSocket 服务器（匹配 /ws 路径，兼容开发模式代理）
const wss = new WebSocket.Server({ server, path: '/ws' })

// 存储活跃的 SSH 连接
const connections = new Map()

// WebSocket 连接处理
wss.on('connection', (ws) => {
  const sessionId = crypto.randomUUID()
  let sshClient = null

  console.log(`[WS] 新客户端连接 sessionId=${sessionId}`)

  // 辅助函数：发送带 id 的响应
  function sendResponse(type, payload) {
    const msg = Object.assign({ type }, payload || {})
    // 如果有 requestId 就带上
    ws.send(JSON.stringify(msg))
  }

  ws.on('message', (msg) => {
    let data
    try {
      data = JSON.parse(msg.toString ? msg.toString() : msg)
    } catch (e) {
      console.error('[WS] 消息解析失败:', e.message)
      return
    }

    // 记录请求 ID 用于匹配响应
    const reqId = data.id

    switch (data.type) {
      // ==================== 重连（刷新页面恢复SSH） ====================
      case 'reconnect': {
        const oldSession = connections.get(data.sessionId)
        if (oldSession && oldSession.sshClient) {
          // 清除旧的超时清理计时器
          if (oldSession.cleanupTimer) {
            clearTimeout(oldSession.cleanupTimer)
          }
          // 恢复 SSH 客户端到当前连接
          sshClient = oldSession.sshClient
          connections.delete(data.sessionId)
          connections.set(sessionId, { sshClient, ws, stream: null, createdAt: Date.now() })
          console.log(`[SSH] 重连成功 sessionId=${sessionId}`)
          sendResponse('connected', { sessionId, id: reqId, reconnected: true })
        } else {
          sendResponse('error', { message: '会话已过期，请重新连接', id: reqId })
        }
        break
      }

      // ==================== SSH 连接 ====================
      case 'connect': {
        // 如果已有连接先关闭
        if (sshClient) {
          sshClient.end()
          sshClient = null
        }

        sshClient = new SSHClient()

        sshClient.on('ready', () => {
          console.log(`[SSH] ${data.host} 连接成功`)
          sendResponse('connected', { sessionId, id: reqId })
          connections.set(sessionId, { sshClient, ws, createdAt: Date.now() })
        })

        sshClient.on('error', (err) => {
          console.error(`[SSH] 连接失败:`, err.message)
          sendResponse('error', { message: err.message, id: reqId })
          sshClient = null
        })

        sshClient.on('close', () => {
          console.log('[SSH] 连接已断开')
          sendResponse('disconnected', { id: reqId })
          connections.delete(sessionId)
        })

        // 构建 SSH 连接配置
        const config = {
          host: data.host,
          port: parseInt(data.port) || 22,
          username: data.username,
          readyTimeout: 15000,
          keepaliveInterval: 30000,
          keepaliveCountMax: 3
        }

        // 根据认证方式设置凭证
        if (data.authType === 'privateKey') {
          if (!data.privateKey || !data.privateKey.trim()) {
            sendResponse('error', { message: '私钥不能为空', id: reqId })
            return
          }
          config.privateKey = data.privateKey.trim()
          if (data.passphrase && data.passphrase.trim()) {
            config.passphrase = data.passphrase.trim()
          }
        } else {
          // 密码认证（默认）
          if (!data.password) {
            sendResponse('error', { message: '密码不能为空', id: reqId })
            return
          }
          config.password = data.password
        }

        console.log(`[SSH] 正在连接 ${config.username}@${config.host}:${config.port} (${data.authType || 'password'})`)
        sshClient.connect(config)
        break
      }

      // ==================== 创建终端 ====================
      case 'shell': {
        if (!sshClient) {
          sendResponse('error', { message: 'SSH 未连接，请先建立连接', id: reqId })
          return
        }
        sshClient.shell({
          term: data.term || 'xterm-256color',
          cols: data.cols || 80,
          rows: data.rows || 24
        }, (err, stream) => {
          if (err) {
            console.error('[Shell] 创建终端失败:', err.message)
            sendResponse('error', { message: '创建终端失败: ' + err.message, id: reqId })
            return
          }

          const conn = connections.get(sessionId)
          if (conn) conn.stream = stream

          stream.on('data', (d) => {
            ws.send(JSON.stringify({ type: 'shell-data', data: d.toString('utf8') }))
          })

          stream.stderr.on('data', (d) => {
            ws.send(JSON.stringify({ type: 'shell-data', data: d.toString('utf8') }))
          })

          stream.on('close', () => {
            ws.send(JSON.stringify({ type: 'shell-closed' }))
            if (conn) delete conn.stream
          })

          stream.on('error', (err) => {
            console.error('[Shell] 流错误:', err.message)
          })

          sendResponse('shell-ready', { id: reqId })
        })
        break
      }

      // ==================== 终端输入 ====================
      case 'shell-input': {
        const conn = connections.get(sessionId)
        if (conn && conn.stream) {
          conn.stream.write(data.data)
        }
        break
      }

      // ==================== 终端尺寸调整 ====================
      case 'shell-resize': {
        const conn = connections.get(sessionId)
        if (conn && conn.stream) {
          try {
            conn.stream.setWindow(data.rows, data.cols, 0, 0)
          } catch (e) {}
        }
        break
      }

      // ==================== 执行命令 ====================
      case 'exec': {
        if (!sshClient) {
          sendResponse('exec-error', { id: data.id, message: 'SSH 未连接' })
          return
        }
        sshClient.exec(data.command, { env: { TERM: 'xterm-256color' } }, (err, stream) => {
          if (err) {
            sendResponse('exec-error', { id: data.id, message: err.message })
            return
          }
          let output = ''
          stream.on('data', (d) => { output += d.toString('utf8') })
          stream.stderr.on('data', (d) => { output += d.toString('utf8') })
          stream.on('close', () => {
            sendResponse('exec-result', { id: data.id, data: output })
          })
        })
        break
      }

      // ==================== SFTP 列出目录 ====================
      case 'sftp-list': {
        if (!sshClient) {
          sendResponse('sftp-error', { id: data.id, message: 'SSH 未连接' })
          return
        }
        sshClient.sftp((err, sftp) => {
          if (err) {
            sendResponse('sftp-error', { id: data.id, message: 'SFTP 启动失败: ' + err.message })
            return
          }
          const targetPath = data.path || '/'
          sftp.readdir(targetPath, (err, list) => {
            if (err) {
              sendResponse('sftp-error', { id: data.id, message: '读取目录失败: ' + err.message })
              sftp.end()
              return
            }
            const files = list.map(f => ({
              name: f.filename,
              size: f.attrs.size,
              mode: f.attrs.mode,
              mtime: f.attrs.mtime * 1000,
              isDirectory: (f.attrs.mode & 0o40000) !== 0
            }))
            sendResponse('sftp-list-result', { id: data.id, data: files, path: targetPath })
            sftp.end()
          })
        })
        break
      }

      // ==================== SFTP 读取文件 ====================
      case 'sftp-read': {
        if (!sshClient) {
          sendResponse('sftp-error', { id: data.id, message: 'SSH 未连接' })
          return
        }
        sshClient.sftp((err, sftp) => {
          if (err) {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            return
          }
          const readStream = sftp.createReadStream(data.path)
          let chunks = []
          readStream.on('data', (chunk) => { chunks.push(chunk) })
          readStream.on('end', () => {
            const content = Buffer.concat(chunks).toString('utf8')
            sendResponse('sftp-read-result', { id: data.id, data: content })
            sftp.end()
          })
          readStream.on('error', (err) => {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            sftp.end()
          })
        })
        break
      }

      // ==================== SFTP 写入文件 ====================
      case 'sftp-write': {
        if (!sshClient) return
        sshClient.sftp((err, sftp) => {
          if (err) {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            return
          }
          const writeStream = sftp.createWriteStream(data.path)
          writeStream.write(data.content, 'utf8')
          writeStream.end()
          writeStream.on('close', () => {
            sendResponse('sftp-write-result', { id: data.id, success: true })
            sftp.end()
          })
          writeStream.on('error', (err) => {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            sftp.end()
          })
        })
        break
      }

      // ==================== SFTP 创建目录 ====================
      case 'sftp-mkdir': {
        if (!sshClient) return
        sshClient.sftp((err, sftp) => {
          if (err) {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            return
          }
          sftp.mkdir(data.path, (err) => {
            if (err) {
              sendResponse('sftp-error', { id: data.id, message: err.message })
            } else {
              sendResponse('sftp-mkdir-result', { id: data.id, success: true })
            }
            sftp.end()
          })
        })
        break
      }

      // ==================== SFTP 删除 ====================
      case 'sftp-delete': {
        if (!sshClient) return
        sshClient.sftp((err, sftp) => {
          if (err) {
            sendResponse('sftp-error', { id: data.id, message: err.message })
            return
          }
          const delFn = data.isDirectory ? sftp.rmdir.bind(sftp) : sftp.unlink.bind(sftp)
          delFn(data.path, (err) => {
            if (err) {
              sendResponse('sftp-error', { id: data.id, message: err.message })
            } else {
              sendResponse('sftp-delete-result', { id: data.id, success: true })
            }
            sftp.end()
          })
        })
        break
      }

      // ==================== 系统监控 ====================
      case 'monitor': {
        if (!sshClient) {
          sendResponse('monitor-error', { id: data.id, message: 'SSH 未连接' })
          return
        }
        const commands = {
          cpu: 'top -bn1 | head -5',
          memory: 'free -m',
          disk: 'df -h',
          uptime: 'uptime',
          os: 'cat /etc/os-release 2>/dev/null'
        }
        const cmd = commands[data.metric]
        if (!cmd) return
        sshClient.exec(cmd, (err, stream) => {
          if (err) {
            sendResponse('monitor-error', { id: data.id, message: err.message })
            return
          }
          let output = ''
          stream.on('data', (d) => { output += d.toString('utf8') })
          stream.on('close', () => {
            sendResponse('monitor-result', { id: data.id, metric: data.metric, data: output })
          })
        })
        break
      }

      // ==================== 断开连接 ====================
      case 'disconnect': {
        if (sshClient) {
          sshClient.end()
          sshClient = null
          connections.delete(sessionId)
          console.log('[SSH] 主动断开连接')
        }
        break
      }

      default:
        console.warn('[WS] 未知消息类型:', data.type)
    }
  })

  ws.on('close', (code, reason) => {
    console.log(`[WS] 客户端断开 code=${code}`)
    if (sshClient) {
      // 保留 SSH 连接 30 秒，等待前端刷新重连
      console.log(`[SSH] 保留连接 30 秒，等待重连 sessionId=${sessionId}`)
      const oldSessionId = sessionId
      const oldSshClient = sshClient
      const cleanupTimer = setTimeout(() => {
        if (connections.has(oldSessionId) && connections.get(oldSessionId).sshClient === oldSshClient) {
          console.log(`[SSH] 重连超时，关闭连接 sessionId=${oldSessionId}`)
          try { oldSshClient.end() } catch (e) {}
          connections.delete(oldSessionId)
        }
      }, 30000)

      connections.set(oldSessionId, { sshClient: oldSshClient, ws: null, stream: null, cleanupTimer, createdAt: Date.now() })
      sshClient = null
    }
  })

  ws.on('error', (err) => {
    console.error('[WS] 错误:', err.message)
  })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
  console.log('')
  console.log('=========================================')
  console.log(`  Zentrm v1.0`)
  console.log(`  http://localhost:${PORT}`)
  console.log(`  WebSocket: ws://localhost:${PORT}`)
  console.log('=========================================')
  console.log('')
})
