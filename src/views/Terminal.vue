<template>
  <div class="terminal-page">
    <!-- 未连接时显示连接面板 -->
    <div v-if="!sshConnected" class="connect-panel">
      <div class="connect-card">
        <div class="card-header">
          <i class="el-icon-monitor"></i>
          <h2>SSH 终端连接</h2>
          <p>选择已保存的连接或新建连接</p>
        </div>
        <div class="card-body">
          <el-form :model="form" label-width="80px" size="small">
            <el-form-item label="主机">
              <el-input v-model="form.host" placeholder="192.168.1.100"></el-input>
            </el-form-item>
            <el-form-item label="端口">
              <el-input v-model="form.port" placeholder="22" type="number"></el-input>
            </el-form-item>
            <el-form-item label="用户名">
              <el-input v-model="form.username" placeholder="root"></el-input>
            </el-form-item>
            <el-form-item label="认证方式">
              <el-radio-group v-model="form.authType" @change="handleAuthTypeChange">
                <el-radio label="password">密码</el-radio>
                <el-radio label="privateKey">密钥</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="form.authType === 'password'" label="密码">
              <el-input v-model="form.password" type="password" placeholder="密码" show-password></el-input>
            </el-form-item>
            <el-form-item v-if="form.authType === 'privateKey'" label="密钥">
              <el-input
                v-model="form.privateKey"
                type="textarea"
                :rows="4"
                placeholder="粘贴 SSH 私钥内容（以 -----BEGIN 开头）"
              ></el-input>
              <div style="margin-top: 6px;">
                <el-button size="mini" icon="el-icon-upload2" @click="handleKeyUpload">上传密钥文件</el-button>
                <input ref="keyFileInput" type="file" accept=".pem,.key,.txt" style="display:none" @change="onKeyFileChange" />
              </div>
            </el-form-item>
            <el-form-item v-if="form.authType === 'privateKey'" label="密钥密码">
              <el-input v-model="form.passphrase" type="password" placeholder="密钥密码（可选）" show-password></el-input>
            </el-form-item>
          </el-form>
          <div class="btn-group">
            <el-button type="primary" @click="handleConnect" :loading="connecting" icon="el-icon-link">
              连接
            </el-button>
            <el-button @click="handleSave" icon="el-icon-star-off">
              保存连接
            </el-button>
          </div>
          <!-- 已保存的连接 -->
          <div class="saved-connections" v-if="connections.length">
            <h4>已保存的连接</h4>
            <div class="conn-list">
              <div
                v-for="conn in connections"
                :key="conn.id"
                class="conn-item"
                @click="fillConnection(conn)"
              >
                <i class="el-icon-monitor"></i>
                <div class="conn-info">
                  <span class="conn-name">{{ conn.name }}</span>
                  <span class="conn-detail">{{ conn.username }}@{{ conn.host }}:{{ conn.port }}</span>
                </div>
                <el-button type="text" icon="el-icon-delete" @click.stop="handleDelete(conn.id)"></el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 已连接时显示终端 -->
    <div v-else class="terminal-container">
      <div class="terminal-tabs">
        <div
          v-for="term in terminals"
          :key="term.id"
          class="tab-item"
          :class="{ active: activeTerminal === term.id }"
          @click="activeTerminal = term.id"
        >
          <i class="el-icon-monitor"></i>
          <span>{{ term.name }}</span>
          <i class="el-icon-close tab-close" @click.stop="closeTerminal(term.id)"></i>
        </div>
        <div class="tab-add" @click="addTerminal">
          <i class="el-icon-plus"></i>
        </div>
      </div>
      <div class="terminal-wrapper">
        <div
          v-for="term in terminals"
          :key="term.id"
          v-show="activeTerminal === term.id"
          :ref="'terminal-' + term.id"
          class="terminal-instance"
        ></div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { WebLinksAddon } from 'xterm-addon-web-links'
import 'xterm/css/xterm.css'
import wsManager, { generateId } from '@/utils/ws'

export default {
  name: 'TerminalView',
  data() {
    return {
      form: {
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKey: '',
        passphrase: ''
      },
      connecting: false,
      terminals: [],
      activeTerminal: null,
      termInstances: {}
    }
  },
  computed: {
    ...mapState(['sshConnected', 'connections', 'currentConnection'])
  },
  watch: {
    sshConnected(val) {
      if (val && this.terminals.length === 0) {
        this.$nextTick(() => {
          this.addTerminal()
        })
      }
    }
  },
  mounted() {
    if (this.sshConnected && this.terminals.length === 0) {
      this.$nextTick(() => {
        this.addTerminal()
      })
    }
  },
  beforeDestroy() {
    Object.keys(this.termInstances).forEach(id => {
      var inst = this.termInstances[id]
      if (inst) {
        if (inst.terminal) inst.terminal.dispose()
        if (inst.resizeObserver) inst.resizeObserver.disconnect()
      }
      wsManager.offMessage('terminal-' + id)
    })
  },
  methods: {
    handleAuthTypeChange() {
      if (this.form.authType === 'password') {
        this.form.privateKey = ''
        this.form.passphrase = ''
      } else {
        this.form.password = ''
      }
    },

    handleKeyUpload() {
      this.$refs.keyFileInput.click()
    },
    onKeyFileChange(e) {
      var file = e.target.files[0]
      if (!file) return
      var reader = new FileReader()
      reader.onload = function (evt) {
        var text = evt.target.result.trim()
        if (text.indexOf('-----BEGIN') === -1) {
          this.$message.error('文件内容不是有效的 SSH 私钥')
          return
        }
        this.form.privateKey = text
        this.$message.success('密钥文件已读取')
      }.bind(this)
      reader.onerror = function () {
        this.$message.error('读取文件失败')
      }.bind(this)
      reader.readAsText(file)
      // 清空 input，允许重复选择同一文件
      e.target.value = ''
    },

    async handleConnect() {
      if (!this.form.host || !this.form.username) {
        this.$message.warning('请填写主机和用户名')
        return
      }
      this.connecting = true
      try {
        // 建立 WebSocket
        if (!wsManager.isConnected) {
          await wsManager.connect()
        }
        // SSH 连接
        const res = await wsManager.sshConnect(this.form)
        this.$store.commit('SET_SSH_CONNECTED', true)
        this.$store.commit('SET_SESSION_ID', res.sessionId)
        this.$store.commit('SET_CURRENT_CONNECTION', { ...this.form })
        this.$message.success('连接成功！')
      } catch (err) {
        this.$message.error('连接失败: ' + err.message)
      } finally {
        this.connecting = false
      }
    },

    fillConnection(conn) {
      this.form = { ...conn }
    },

    handleSave() {
      if (!this.form.host) {
        this.$message.warning('请先填写主机信息')
        return
      }
      var conn = {
        id: generateId(),
        name: this.form.name || (this.form.username + '@' + this.form.host),
        host: this.form.host,
        port: this.form.port || 22,
        username: this.form.username,
        authType: this.form.authType,
        password: this.form.authType === 'password' ? this.form.password : '',
        privateKey: this.form.authType === 'privateKey' ? this.form.privateKey : '',
        passphrase: this.form.authType === 'privateKey' ? this.form.passphrase : ''
      }
      this.$store.dispatch('saveConnection', conn)
      this.$message.success('保存成功')
    },

    handleDelete(id) {
      this.$store.dispatch('deleteConnection', id)
    },

    addTerminal() {
      const id = generateId()
      const term = {
        id: id,
        name: '终端 ' + (this.terminals.length + 1)
      }
      this.terminals.push(term)
      this.activeTerminal = id
      this.$nextTick(() => {
        this.createTerminal(id)
      })
    },

    createTerminal(id) {
      const container = this.$refs['terminal-' + id]
      if (!container || !container[0]) {
        console.warn('[Terminal] 容器未找到:', id)
        return
      }

      const terminal = new Terminal({
        theme: {
          background: '#0a0e14',
          foreground: '#e0e0e0',
          cursor: '#409EFF',
          cursorAccent: '#0a0e14',
          selectionBackground: '#264f78',
          black: '#0a0e14',
          red: '#ff3333',
          green: '#67C23A',
          yellow: '#E6A23C',
          blue: '#409EFF',
          magenta: '#c678dd',
          cyan: '#56b6c2',
          white: '#e0e0e0'
        },
        fontFamily: 'Consolas, Monaco, "Courier New", monospace',
        fontSize: 14,
        cursorBlink: true,
        cursorStyle: 'bar'
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.loadAddon(new WebLinksAddon())

      terminal.open(container[0])
      fitAddon.fit()

      // 监听窗口大小变化
      const ro = new ResizeObserver(function () {
        fitAddon.fit()
      })
      ro.observe(container[0])

      this.termInstances[id] = { terminal: terminal, fitAddon: fitAddon, resizeObserver: ro }

      // ★ 先注册消息监听器，再发请求（确保不会丢数据）
      var msgKey = 'terminal-' + id
      wsManager.onMessage(msgKey, function (data) {
        if (data.type === 'shell-data') {
          // 有 shellId 时精确匹配，无 shellId 时直接写入（兼容旧服务端）
          if (!data.shellId || data.shellId === id) {
            terminal.write(data.data)
          }
        } else if (data.type === 'shell-closed') {
          if (!data.shellId || data.shellId === id) {
            terminal.write('\r\n\x1b[31m[连接已断开]\x1b[0m\r\n')
          }
        } else if (data.type === 'ws-close') {
          terminal.write('\r\n\x1b[31m[WebSocket 连接断开]\x1b[0m\r\n')
        }
      })

      // ★ 请求 shell（必须带 id 以便等待响应）
      console.log('[Terminal] 请求创建 shell, id=' + id)
      wsManager.request({
        type: 'shell',
        shellId: id,
        term: 'xterm-256color',
        cols: terminal.cols,
        rows: terminal.rows
      }).then(function () {
        console.log('[Terminal] shell 就绪, id=' + id)
      }).catch(function (err) {
        console.error('[Terminal] shell 创建失败:', err.message)
        terminal.write('\r\n\x1b[31m[创建终端失败: ' + err.message + ']\x1b[0m\r\n')
      })

      // Ctrl+C 复制 / Ctrl+V 粘贴
      terminal.attachCustomKeyEventHandler(function (e) {
        if (e.type === 'keydown') {
          // Ctrl+C / Cmd+C：有选中文字时复制，无选中时发送中断信号
          if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
            var sel = terminal.getSelection()
            if (sel) {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(sel).catch(function () {
                  // HTTP fallback
                  var ta = document.createElement('textarea')
                  ta.value = sel
                  ta.style.position = 'fixed'
                  ta.style.left = '-9999px'
                  ta.style.opacity = '0'
                  document.body.appendChild(ta)
                  ta.select()
                  try { document.execCommand('copy') } catch (err) {}
                  document.body.removeChild(ta)
                })
              } else {
                var ta = document.createElement('textarea')
                ta.value = sel
                ta.style.position = 'fixed'
                ta.style.left = '-9999px'
                ta.style.opacity = '0'
                document.body.appendChild(ta)
                ta.select()
                try { document.execCommand('copy') } catch (err) {}
                document.body.removeChild(ta)
              }
              return false
            }
            return true
          }
          // Ctrl+V / Cmd+V
          if (e.key === 'v' && (e.ctrlKey || e.metaKey)) {
            // HTTPS 环境：Clipboard API 可用，彻底拦截避免重复粘贴
            if (window.isSecureContext && navigator.clipboard && navigator.clipboard.readText) {
              e.preventDefault()
              navigator.clipboard.readText().then(function (text) {
                if (text) terminal.paste(text)
              }).catch(function () {})
              return false
            }
            // HTTP 环境：不 preventDefault（保留浏览器原生 paste 事件），
            // 但 return false 阻止 xterm 把 Ctrl+V 当成 \x16 发出去
            return false
          }
        }
      })

      // 监听终端输入（带 shellId）
      terminal.onData(function (data) {
        wsManager.send({
          type: 'shell-input',
          shellId: id,
          data: data
        })
      })

      // 监听终端尺寸（带 shellId）
      terminal.onResize(function (size) {
        wsManager.send({
          type: 'shell-resize',
          shellId: id,
          cols: size.cols,
          rows: size.rows
        })
      })

    },

    closeTerminal(id) {
      const inst = this.termInstances[id]
      if (inst) {
        inst.terminal.dispose()
        inst.resizeObserver.disconnect()
        delete this.termInstances[id]
      }
      wsManager.offMessage('terminal-' + id)
      this.terminals = this.terminals.filter(t => t.id !== id)
      if (this.activeTerminal === id) {
        this.activeTerminal = this.terminals.length > 0 ? this.terminals[0].id : null
      }
      if (this.terminals.length === 0) {
        wsManager.disconnect()
        this.$store.commit('SET_SSH_CONNECTED', false)
        this.$store.commit('SET_SESSION_ID', null)
        this.$store.commit('SET_CURRENT_CONNECTION', null)
      }
    }
  }
}
</script>

<style lang="less" scoped>
.terminal-page {
  width: 100%;
  height: 100%;
}

.connect-panel {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: radial-gradient(ellipse at center, #12161c 0%, #0a0e14 100%);
}

.connect-card {
  width: 480px;
  background: #1a1e24;
  border-radius: 12px;
  border: 1px solid #2a2e34;
  overflow: hidden;

  .card-header {
    padding: 30px 30px 10px;
    text-align: center;

    i {
      font-size: 40px;
      color: #409EFF;
      margin-bottom: 10px;
    }

    h2 {
      color: #e0e0e0;
      font-size: 20px;
      margin-bottom: 6px;
    }

    p {
      color: #a0a4a8;
      font-size: 13px;
    }
  }

  .card-body {
    padding: 20px 30px 30px;

    .btn-group {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
  }
}

.saved-connections {
  margin-top: 24px;
  border-top: 1px solid #2a2e34;
  padding-top: 16px;

  h4 {
    color: #a0a4a8;
    font-size: 13px;
    margin-bottom: 12px;
  }

  .conn-list {
    max-height: 200px;
    overflow-y: auto;
  }

  .conn-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    margin-bottom: 4px;

    &:hover {
      background: #2a2e34;
    }

    i {
      font-size: 18px;
      color: #409EFF;
    }

    .conn-info {
      flex: 1;
      display: flex;
      flex-direction: column;

      .conn-name {
        color: #e0e0e0;
        font-size: 13px;
      }

      .conn-detail {
        color: #a0a4a8;
        font-size: 12px;
        font-family: 'Consolas', monospace;
      }
    }
  }
}

.terminal-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.terminal-tabs {
  display: flex;
  background: #12161c;
  border-bottom: 1px solid #2a2e34;
  height: 36px;
  align-items: center;
  padding: 0 4px;

  .tab-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    height: 30px;
    font-size: 12px;
    color: #a0a4a8;
    cursor: pointer;
    border-radius: 4px 4px 0 0;
    transition: all 0.2s;

    &:hover {
      background: #2a2e34;
    }

    &.active {
      background: #1a1e24;
      color: #e0e0e0;
      border-bottom: 2px solid #409EFF;
    }

    .tab-close {
      font-size: 12px;
      margin-left: 4px;

      &:hover {
        color: #F56C6C;
      }
    }
  }

  .tab-add {
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: #a0a4a8;
    border-radius: 4px;
    margin-left: 4px;

    &:hover {
      background: #2a2e34;
      color: #409EFF;
    }
  }
}

.terminal-wrapper {
  flex: 1;
  position: relative;

  .terminal-instance {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    padding: 4px;
  }
}
</style>
