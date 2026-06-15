// 简易 UUID 生成
export function generateId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

class WsManager {
  constructor() {
    this.ws = null
    this.listeners = new Map()
    this.msgId = 0
    this.pendingRequests = new Map()
    this._boundOnMessage = null
    this._connectResolve = null
    this._connectReject = null
    this._autoReconnect = false
    this._reconnectTimer = null
    this._reconnectAttempts = 0
    this._lastUrl = null
  }

  connect(url, autoReconnect) {
    var self = this
    if (!url) {
      var proto = window.location.protocol === 'https:' ? 'wss://' : 'ws://'
      url = proto + window.location.host + '/ws'
    }
    this._lastUrl = url
    this._autoReconnect = autoReconnect !== false
    this._reconnectAttempts = 0

    return new Promise(function (resolve, reject) {
      self._connectResolve = resolve
      self._connectReject = reject

      try {
        self.ws = new WebSocket(url)
      } catch (e) {
        reject(new Error('浏览器不支持 WebSocket'))
        return
      }

      self.ws.onopen = function () {
        console.log('[WS] 已连接到', url)
        self._reconnectAttempts = 0
        resolve(self.ws)
      }

      self.ws.onclose = function (event) {
        console.log('[WS] 连接已关闭 code=' + event.code)

        if (self._connectReject && !self._connectResolve._used) {
          self._connectReject(new Error('WebSocket 连接被服务端关闭 (code: ' + event.code + ')'))
          self._connectResolve = null
          self._connectReject = null
        }

        self.pendingRequests.forEach(function (item, id) {
          item.reject(new Error('连接已关闭 (code: ' + event.code + ')'))
          self.pendingRequests.delete(id)
        })
        self.listeners.forEach(function (cb, key) {
          try { cb({ type: 'ws-close' }) } catch (e) {}
        })
        if (self._boundOnMessage && self.ws) {
          self.ws.removeEventListener('message', self._boundOnMessage)
        }

        // 自动重连（非主动断开时）
        if (self._autoReconnect && event.code !== 1000) {
          self._scheduleReconnect()
        }
      }

      self.ws.onerror = function () {
        console.error('[WS] WebSocket 错误')
        if (self._connectReject) {
          self._connectReject(new Error('连接失败，请确认后端是否启动（cd server && node index.js）'))
          self._connectResolve = null
          self._connectReject = null
        }
      }

      self._boundOnMessage = function (event) { self._handleMessage(event.data) }
      self.ws.addEventListener('message', self._boundOnMessage)
    })
  }

  _scheduleReconnect() {
    var self = this
    if (this._reconnectTimer) return
    // 指数退避: 1s, 2s, 4s, 8s, 最大 30s
    var delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts), 30000)
    this._reconnectAttempts++
    console.log('[WS] ' + delay + 'ms 后尝试第 ' + this._reconnectAttempts + ' 次重连...')
    this._reconnectTimer = setTimeout(function () {
      self._reconnectTimer = null
      self.connect(self._lastUrl, true).catch(function (err) {
        console.warn('[WS] 重连失败:', err.message)
      })
    }, delay)
  }

  _handleMessage(rawData) {
    var data
    try { data = JSON.parse(rawData) } catch (e) { return }

    // 匹配 pending 请求（通过 id）
    if (data.id && this.pendingRequests.has(data.id)) {
      var req = this.pendingRequests.get(data.id)
      this.pendingRequests.delete(data.id)

      var isError = (
        data.type === 'error' ||
        (data.type && data.type.indexOf('-error') !== -1)
      )

      if (isError) {
        req.reject(new Error(data.message || '服务器返回错误'))
      } else {
        req.resolve(data)
      }
      return
    }

    // ★ 打印非请求响应消息，方便调试
    if (data.type === 'shell-data' || data.type === 'shell-closed') {
      console.log('[WS] 广播消息:', data.type, 'shellId:', data.shellId, 'listeners数:', this.listeners.size)
    }

    // 发给监听器（try-catch 防止单个监听器报错阻塞其他）
    this.listeners.forEach(function (cb, key) {
      try { cb(data) } catch (e) { console.error('[WS] Listener error (' + key + '):', e) }
    })
  }

  send(msg) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] 发送失败: 未连接')
      return false
    }
    try {
      this.ws.send(JSON.stringify(msg))
      return true
    } catch (e) {
      console.error('[WS] 发送异常:', e.message)
      return false
    }
  }

  request(msg) {
    var self = this
    return new Promise(function (resolve, reject) {
      if (!self.ws || self.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket 未连接'))
        return
      }

      var id = ++self.msgId
      msg.id = id

      // 超时 30s
      var timer = setTimeout(function () {
        if (self.pendingRequests.has(id)) {
          self.pendingRequests.delete(id)
          reject(new Error('请求超时 (30s)，请检查网络或服务器状态'))
        }
      }, 30000)

      self.pendingRequests.set(id, {
        resolve: function (data) { clearTimeout(timer); resolve(data) },
        reject: function (err) { clearTimeout(timer); reject(err) }
      })

      self.send(msg)
    })
  }

  onMessage(key, callback) {
    this.listeners.set(key, callback)
  }

  offMessage(key) {
    this.listeners.delete(key)
  }

  sshConnect(conn) {
    var msg = {
      type: 'connect',
      host: conn.host,
      port: conn.port || 22,
      username: conn.username,
      authType: conn.authType || 'password'
    }

    if (conn.authType === 'privateKey') {
      msg.privateKey = conn.privateKey
      if (conn.passphrase) msg.passphrase = conn.passphrase
    } else {
      msg.password = conn.password
    }

    return this.request(msg)
  }

  sshReconnect(sessionId) {
    return this.request({ type: 'reconnect', sessionId: sessionId })
  }

  disconnect() {
    this._autoReconnect = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    this.send({ type: 'disconnect' })
  }

  get isConnected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  close() {
    this._autoReconnect = false
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer)
      this._reconnectTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
}

export default new WsManager()
