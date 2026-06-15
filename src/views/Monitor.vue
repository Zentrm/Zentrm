<template>
  <div class="monitor-page">
    <!-- 未连接提示 -->
    <div v-if="!sshConnected" class="no-connection">
      <i class="el-icon-warning-outline"></i>
      <p>请先连接到服务器</p>
      <el-button type="primary" size="small" @click="$router.push('/terminal')">去连接</el-button>
    </div>

    <!-- 监控面板 -->
    <div v-else class="monitor-content">
      <div class="monitor-toolbar">
        <h3>{{ currentConnection ? currentConnection.host : '' }} 系统状态</h3>
        <div class="toolbar-right">
          <el-button size="mini" icon="el-icon-refresh" @click="refreshAll">刷新</el-button>
          <el-switch v-model="autoRefresh" active-text="自动刷新" @change="toggleAutoRefresh"></el-switch>
        </div>
      </div>

      <!-- 信息卡片 -->
      <div class="info-grid">
        <!-- 系统信息 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-info"></i> 系统信息</div>
          <div class="card-body">
            <div class="info-line" v-for="(val, key) in osInfo" :key="key">
              <span class="label">{{ key }}</span>
              <span class="value">{{ val }}</span>
            </div>
          </div>
        </div>

        <!-- CPU 信息 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-cpu"></i> CPU 使用</div>
          <div class="card-body">
            <div class="cpu-usage" v-if="cpuParsed.usage !== null">
              <div class="usage-header">
                <span class="usage-label">CPU 使用率</span>
                <span class="usage-value">{{ cpuParsed.usage.toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="cpuParsed.usage" :stroke-width="12" :color="cpuParsed.usage > 80 ? '#F56C6C' : cpuParsed.usage > 50 ? '#E6A23C' : '#67C23A'" :show-text="false"></el-progress>
            </div>
            <div class="cpu-details" v-if="cpuParsed.details.length">
              <div class="info-line" v-for="item in cpuParsed.details" :key="item.label">
                <span class="label">{{ item.label }}</span>
                <span class="value">{{ item.value }}</span>
              </div>
            </div>
            <div v-else class="cpu-raw">
              <pre class="cmd-output">{{ cpuInfo }}</pre>
            </div>
          </div>
        </div>

        <!-- 内存信息 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-coin"></i> 内存使用</div>
          <div class="card-body">
            <div class="mem-usage" v-if="memParsed.usage !== null">
              <div class="usage-header">
                <span class="usage-label">内存使用率</span>
                <span class="usage-value">{{ memParsed.usage.toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="memParsed.usage" :stroke-width="12" :color="memParsed.usage > 80 ? '#F56C6C' : memParsed.usage > 50 ? '#E6A23C' : '#67C23A'" :show-text="false"></el-progress>
              <div class="mem-detail">{{ memParsed.used }} / {{ memParsed.total }}</div>
            </div>
            <div class="swap-usage" v-if="memParsed.swapUsage !== null">
              <div class="usage-header" style="margin-top:12px">
                <span class="usage-label">Swap 使用率</span>
                <span class="usage-value">{{ memParsed.swapUsage.toFixed(1) }}%</span>
              </div>
              <el-progress :percentage="memParsed.swapUsage" :stroke-width="8" color="#909399" :show-text="false"></el-progress>
              <div class="mem-detail">{{ memParsed.swapUsed }} / {{ memParsed.swapTotal }}</div>
            </div>
          </div>
        </div>

        <!-- 磁盘信息 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-files"></i> 磁盘使用</div>
          <div class="card-body">
            <div v-if="diskParsed.length" class="disk-list">
              <div class="disk-item" v-for="(d, i) in diskParsed" :key="i">
                <div class="disk-mount">
                  <span class="disk-device">{{ d.device }}</span>
                  <span class="disk-mount-point">{{ d.mount }}</span>
                </div>
                <el-progress :percentage="d.usePercent" :stroke-width="10" :color="d.usePercent > 80 ? '#F56C6C' : d.usePercent > 50 ? '#E6A23C' : '#67C23A'" :show-text="false"></el-progress>
                <div class="disk-detail">
                  <span>{{ d.used }} / {{ d.size }}</span>
                  <span>可用 {{ d.avail }}</span>
                </div>
              </div>
            </div>
            <pre v-else class="cmd-output">{{ diskInfo }}</pre>
          </div>
        </div>

        <!-- 运行时间 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-time"></i> 运行时间</div>
          <div class="card-body">
            <div v-if="uptimeParsed" class="uptime-info">
              <div class="uptime-main">
                <i class="el-icon-timer"></i>
                <span class="uptime-duration">{{ uptimeParsed.upTime }}</span>
              </div>
              <div class="info-line" v-for="item in uptimeParsed.details" :key="item.label">
                <span class="label">{{ item.label }}</span>
                <span class="value">{{ item.value }}</span>
              </div>
            </div>
            <pre v-else class="cmd-output">{{ uptimeInfo }}</pre>
          </div>
        </div>

        <!-- 快捷命令 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-s-promotion"></i> 快捷命令</div>
          <div class="card-body">
            <div class="quick-grid">
              <el-tooltip v-for="cmd in quickCommands" :key="cmd.name" :content="cmd.desc" placement="top" :open-delay="200">
                <el-button size="mini" :icon="cmd.icon" @click="execQuickCommand(cmd.cmd)">
                  {{ cmd.name }}
                </el-button>
              </el-tooltip>
            </div>
          </div>
        </div>

        <!-- 系统日志 -->
        <div class="info-card">
          <div class="card-title"><i class="el-icon-notebook-2"></i> 系统日志</div>
          <div class="card-body">
            <div class="log-toolbar">
              <el-button size="mini" icon="el-icon-refresh" :loading="logLoading" @click="loadSysLog">刷新日志</el-button>
              <el-button size="mini" type="danger" icon="el-icon-delete" :disabled="!sysLog" @click="clearSysLog">清理日志</el-button>
            </div>
            <pre class="cmd-output log-output">{{ sysLog || '暂无日志' }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import wsManager from '@/utils/ws'

export default {
  name: 'MonitorView',
  data() {
    return {
      autoRefresh: false,
      refreshTimer: null,
      logLoading: false,
      cpuInfo: '',
      memInfo: '',
      diskInfo: '',
      uptimeInfo: '',
      osInfo: {},
      sysLog: '',
      quickCommands: [
        { name: '进程列表', cmd: 'ps aux | head -20', desc: '查看前20个进程', icon: 'el-icon-document' },
        { name: '内存占用排行', cmd: 'ps aux --sort=-%mem | head -10', desc: '按内存排序前10', icon: 'el-icon-coin' },
        { name: 'CPU占用排行', cmd: 'ps aux --sort=-%cpu | head -10', desc: '按CPU排序前10', icon: 'el-icon-cpu' },
        { name: '监听端口', cmd: 'ss -tlnp', desc: '查看TCP监听端口', icon: 'el-icon-connection' },
        { name: '网络连接', cmd: 'ss -s', desc: '查看网络连接统计', icon: 'el-icon-share' },
        { name: '网卡流量', cmd: 'cat /proc/net/dev', desc: '查看各网卡收发流量', icon: 'el-icon-data-line' },
        { name: '磁盘IO统计', cmd: 'iostat -x 1 1 2>/dev/null || echo "iostat未安装，请执行: apt install sysstat"', desc: '查看磁盘读写速率', icon: 'el-icon-files' },
        { name: '最近登录', cmd: 'last -10', desc: '查看最近10次登录记录', icon: 'el-icon-user' }
      ]
    }
  },
  computed: {
    ...mapState(['sshConnected', 'currentConnection']),
    cpuParsed() {
      var result = { usage: null, details: [] }
      if (!this.cpuInfo) return result
      // 解析 %Cpu(s):  1.5 us,  0.5 sy,  0.0 ni, 97.8 id,  0.2 wa,  0.0 hi,  0.0 si,  0.0 st
      var cpuLine = this.cpuInfo.match(/%Cpu\(s\):\s*(.+)/)
      if (cpuLine) {
        var parts = cpuLine[1].split(',')
        var idlePart = parts.find(function(p) { return p.includes('id') })
        if (idlePart) {
          var idleVal = parseFloat(idlePart.trim())
          result.usage = 100 - idleVal
        }
        var labels = { us: '用户态', sy: '内核态', ni: 'nice', id: '空闲', wa: 'IO等待', hi: '硬中断', si: '软中断', st: '虚拟化' }
        parts.forEach(function(p) {
          var m = p.trim().match(/([\d.]+)\s+(\w+)/)
          if (m && labels[m[2]]) {
            result.details.push({ label: labels[m[2]], value: m[1] + '%' })
          }
        })
      }
      // 解析负载
      var loadLine = this.cpuInfo.match(/load average:\s*(.+)/)
      if (loadLine) {
        var loads = loadLine[1].split(',').map(function(s) { return s.trim() })
        result.details.unshift(
          { label: '1分钟负载', value: loads[0] },
          { label: '5分钟负载', value: loads[1] },
          { label: '15分钟负载', value: loads[2] }
        )
      }
      // 解析进程
      var taskLine = this.cpuInfo.match(/Tasks:\s*(.+)/)
      if (taskLine) {
        result.details.push({ label: '进程', value: taskLine[1].trim() })
      }
      return result
    },
    memParsed() {
      var result = { usage: null, used: '', total: '', swapUsage: null, swapUsed: '', swapTotal: '' }
      if (!this.memInfo) return result
      // free -m 输出格式: Mem:   3921   2048   512   128   1360   1480
      var memLine = this.memInfo.match(/Mem:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
      if (memLine) {
        var total = parseFloat(memLine[1])
        var used = parseFloat(memLine[2])
        result.total = total >= 1024 ? (total / 1024).toFixed(1) + ' GB' : total.toFixed(0) + ' MB'
        result.used = used >= 1024 ? (used / 1024).toFixed(1) + ' GB' : used.toFixed(0) + ' MB'
        result.usage = total > 0 ? (used / total) * 100 : 0
      }
      // Swap:   2048      0   2048
      var swapLine = this.memInfo.match(/Swap:\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/)
      if (swapLine) {
        var sTotal = parseFloat(swapLine[1])
        var sUsed = parseFloat(swapLine[2])
        result.swapTotal = sTotal >= 1024 ? (sTotal / 1024).toFixed(1) + ' GB' : sTotal.toFixed(0) + ' MB'
        result.swapUsed = sUsed >= 1024 ? (sUsed / 1024).toFixed(1) + ' GB' : sUsed.toFixed(0) + ' MB'
        result.swapUsage = sTotal > 0 ? (sUsed / sTotal) * 100 : 0
      }
      return result
    },
    diskParsed() {
      var result = []
      if (!this.diskInfo) return result
      // df -h 输出格式:
      // Filesystem      Size  Used Avail Use% Mounted on
      // /dev/sda1        50G   20G   28G  42% /
      var lines = this.diskInfo.split('\n')
      lines.forEach(function(line) {
        // 匹配 /dev/ 开头的行
        var match = line.match(/^(\S+)\s+([\d.]+[KMGT]?)\s+([\d.]+[KMGT]?)\s+([\d.]+[KMGT]?)\s+(\d+)%\s+(\/.*)/)
        if (match) {
          result.push({
            device: match[1],
            size: match[2],
            used: match[3],
            avail: match[4],
            usePercent: parseInt(match[5]),
            mount: match[6]
          })
        }
      })
      return result
    },
    uptimeParsed() {
      if (!this.uptimeInfo) return null
      // uptime 输出格式: 14:20:01 up 10 days,  3:45,  2 users,  load average: 0.00, 0.01, 0.05
      var result = { upTime: '', details: [] }
      // 提取 up 之后到逗号或users之前的内容
      var upMatch = this.uptimeInfo.match(/up\s+(.*?),\s*\d+\s*user/)
      if (upMatch) {
        var raw = upMatch[1].trim()
        // 将英文时长转为中文: "10 days, 3:45" → "10天 3小时45分钟"
        var cnTime = raw
          .replace(/(\d+)\s+days?/, '$1天')
          .replace(/(\d+)\s+hours?/, '$1小时')
          .replace(/(\d+)\s+minutes?/, '$1分钟')
          .replace(/(\d+):(\d+)/, function(m, h, min) { return h + '小时' + min + '分钟' })
        result.upTime = cnTime
      }
      // 提取用户数
      var userMatch = this.uptimeInfo.match(/(\d+)\s*user/)
      if (userMatch) {
        result.details.push({ label: '在线用户', value: userMatch[1] + ' 个' })
      }
      // 提取负载，加说明
      var loadMatch = this.uptimeInfo.match(/load average:\s*(.+)/)
      if (loadMatch) {
        var loads = loadMatch[1].split(',').map(function(s) { return s.trim() })
        result.details.push({ label: '1分钟平均负载', value: loads[0] })
        result.details.push({ label: '5分钟平均负载', value: loads[1] })
        result.details.push({ label: '15分钟平均负载', value: loads[2] })
      }
      // 提取当前时间
      var timeMatch = this.uptimeInfo.match(/^(\d+:\d+:\d+)/)
      if (timeMatch) {
        result.details.unshift({ label: '当前系统时间', value: timeMatch[1] })
      }
      return result
    }
  },
  mounted() {
    if (this.sshConnected) {
      this.refreshAll()
    }
  },
  beforeDestroy() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer)
    }
  },
  watch: {
    sshConnected(val) {
      if (val) this.refreshAll()
    }
  },
  methods: {
    async fetchMetric(metric) {
      try {
        const res = await wsManager.request({ type: 'monitor', metric })
        return res.data
      } catch (err) {
        return '获取失败: ' + err.message
      }
    },

    async refreshAll() {
      const [cpu, mem, disk, uptime, os] = await Promise.all([
        this.fetchMetric('cpu'),
        this.fetchMetric('memory'),
        this.fetchMetric('disk'),
        this.fetchMetric('uptime'),
        this.fetchMetric('os')
      ])
      this.cpuInfo = cpu
      this.memInfo = mem
      this.diskInfo = disk
      this.uptimeInfo = uptime

      // 同时加载日志
      this.loadSysLog()

      // 解析 OS 信息，key 映射为中文
      if (os) {
        const keyMap = {
          'PRETTY_NAME': '系统名称',
          'NAME': '发行版',
          'VERSION_ID': '版本号'
        }
        const lines = os.split('\n')
        this.osInfo = {}
        lines.forEach(line => {
          if (line.includes('=')) {
            const [key, ...vals] = line.split('=')
            const rawKey = key.trim()
            const value = vals.join('=').replace(/"/g, '')
            if (value && keyMap[rawKey]) {
              this.osInfo[keyMap[rawKey]] = value
            }
          }
        })
      }
    },

    toggleAutoRefresh(val) {
      if (val) {
        this.refreshTimer = setInterval(() => this.refreshAll(), 5000)
      } else {
        clearInterval(this.refreshTimer)
        this.refreshTimer = null
      }
    },

    async execQuickCommand(cmd) {
      try {
        const res = await wsManager.request({ type: 'exec', command: cmd })
        this.$alert(`<pre style="color:#e0e0e0;background:#0a0e14;padding:16px;border-radius:6px;font-family:Consolas,monospace;font-size:12px;line-height:1.7;max-height:450px;overflow:auto;white-space:pre-wrap;word-break:break-all;">${res.data}</pre>`, '执行结果', {
          dangerouslyUseHTMLString: true,
          customClass: 'cmd-result-dialog',
          width: '700px'
        })
      } catch (err) {
        this.$message.error('执行失败: ' + err.message)
      }
    },

    async loadSysLog() {
      this.logLoading = true
      try {
        // journalctl优先，兼容更多系统
        const res = await wsManager.request({ type: 'exec', command: 'journalctl -n 50 --no-pager 2>/dev/null || tail -50 /var/log/syslog 2>/dev/null || tail -50 /var/log/messages 2>/dev/null' })
        if (res.data && res.data.trim()) {
          this.sysLog = res.data
        } else {
          this.sysLog = '暂无日志'
        }
      } catch (err) {
        this.sysLog = '读取日志失败'
      } finally {
        this.logLoading = false
      }
    },

    async clearSysLog() {
      try {
        await this.$confirm('确定要清理系统日志吗？此操作不可恢复！', '警告', {
          type: 'warning',
          confirmButtonText: '确定清理',
          cancelButtonText: '取消'
        })
        // 同时清理多种日志源
        await wsManager.request({ type: 'exec', command: 'journalctl --vacuum-time=0s 2>/dev/null; truncate -s 0 /var/log/syslog 2>/dev/null; truncate -s 0 /var/log/messages 2>/dev/null; echo "done"' })
        this.$message.success('日志清理完成')
        this.sysLog = ''
      } catch (err) {
        if (err !== 'cancel') {
          this.$message.error('清理失败: ' + err.message)
        }
      }
    }
  }
}
</script>

<style lang="less" scoped>
.monitor-page {
  width: 100%;
  height: 100%;
}

.no-connection {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #a0a4a8;

  i { font-size: 48px; margin-bottom: 16px; }
  p { margin-bottom: 16px; }
}

.monitor-content {
  padding: 20px;
  overflow-y: auto;
  height: 100%;
}

.monitor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    color: #e0e0e0;
    font-size: 18px;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

.info-card {
  background: #1a1e24;
  border: 1px solid #2a2e34;
  border-radius: 8px;
  overflow: hidden;

  .card-title {
    padding: 12px 16px;
    background: #12161c;
    border-bottom: 1px solid #2a2e34;
    font-size: 14px;
    font-weight: 600;
    color: #e0e0e0;

    i {
      margin-right: 6px;
      color: #409EFF;
    }
  }

  .card-body {
    padding: 16px;
  }
}

.info-line {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #2a2e34;

  &:last-child { border-bottom: none; }

  .label {
    color: #a0a4a8;
    font-size: 13px;
  }

  .value {
    color: #e0e0e0;
    font-size: 13px;
    font-family: 'Consolas', monospace;
    text-align: right;
    max-width: 60%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.cmd-output {
  color: #67C23A;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.6;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}

.quick-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;

  .el-button {
    font-size: 12px;
    padding: 6px 10px;
    margin: 0;
  }
}
</style>

<style lang="less">
.el-dialog.cmd-result-dialog {
  background: #1a1e24 !important;
  border: 1px solid #2a2e34 !important;
  border-radius: 10px !important;

  .el-dialog__header {
    background: #12161c;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2e34;
    border-radius: 9px 9px 0 0;

    .el-dialog__title {
      color: #e0e0e0;
      font-size: 15px;
      font-weight: 600;
    }

    .el-dialog__headerbtn .el-dialog__close {
      color: #909399;
      &:hover { color: #F56C6C; }
    }
  }

  .el-dialog__body {
    padding: 0;
    max-height: 500px;
    overflow: auto;
  }

  .el-dialog__footer {
    background: #12161c;
    padding: 12px 20px;
    border-top: 1px solid #2a2e34;

    .el-button--primary {
      background-color: #409EFF;
      border-color: #409EFF;
      &:hover { opacity: 0.85; }
    }
  }
}

.log-toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.log-output {
  max-height: 300px;
  color: #E6A23C;
}

.usage-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;

  .usage-label {
    color: #a0a4a8;
    font-size: 13px;
  }

  .usage-value {
    color: #e0e0e0;
    font-size: 14px;
    font-weight: 600;
    font-family: 'Consolas', monospace;
  }
}

.cpu-details {
  margin-top: 12px;
}

.mem-detail {
  color: #a0a4a8;
  font-size: 12px;
  margin-top: 4px;
  font-family: 'Consolas', monospace;
}

.disk-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.disk-item {
  &:not(:last-child) {
    padding-bottom: 16px;
    border-bottom: 1px solid #2a2e34;
  }
}

.disk-mount {
  display: flex;
  justify-content: space-between;
  margin-bottom: 6px;

  .disk-device {
    color: #e0e0e0;
    font-size: 13px;
    font-family: 'Consolas', monospace;
  }

  .disk-mount-point {
    color: #a0a4a8;
    font-size: 12px;
  }
}

.disk-detail {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: #a0a4a8;
  font-size: 12px;
  font-family: 'Consolas', monospace;
}

.uptime-info {
  .uptime-main {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 16px;
    padding: 12px 0;
    border-bottom: 1px solid #2a2e34;

    i {
      font-size: 28px;
      color: #67C23A;
    }

    .uptime-duration {
      font-size: 22px;
      font-weight: 700;
      color: #e0e0e0;
      font-family: 'Consolas', monospace;
    }
  }
}
</style>

<style lang="less">
.el-dialog.cmd-result-dialog {
  background: #1a1e24 !important;
  border: 1px solid #2a2e34 !important;
  border-radius: 10px !important;

  .el-dialog__header {
    background: #12161c;
    padding: 16px 20px;
    border-bottom: 1px solid #2a2e34;
    border-radius: 9px 9px 0 0;

    .el-dialog__title {
      color: #e0e0e0;
      font-size: 15px;
      font-weight: 600;
    }

    .el-dialog__headerbtn .el-dialog__close {
      color: #909399;
      &:hover { color: #F56C6C; }
    }
  }

  .el-dialog__body {
    padding: 0;
    max-height: 500px;
    overflow: auto;
  }

  .el-dialog__footer {
    background: #12161c;
    padding: 12px 20px;
    border-top: 1px solid #2a2e34;

    .el-button--primary {
      background-color: #409EFF;
      border-color: #409EFF;
      &:hover { opacity: 0.85; }
    }
  }
}
</style>