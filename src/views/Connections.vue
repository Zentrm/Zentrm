<template>
  <div class="connections-page">
    <div class="page-header">
      <h3>连接管理</h3>
      <el-button type="primary" size="small" icon="el-icon-plus" @click="showDialog()">新建连接</el-button>
    </div>

    <!-- 连接列表 -->
    <div class="conn-grid">
      <div
        v-for="conn in connections"
        :key="conn.id"
        class="conn-card"
        @dblclick="handleQuickConnect(conn)"
      >
        <div class="conn-card-header">
          <div class="conn-icon">
            <i class="el-icon-monitor"></i>
          </div>
          <div class="conn-actions">
            <el-button type="text" icon="el-icon-edit" @click.stop="showDialog(conn)"></el-button>
            <el-button type="text" icon="el-icon-delete" @click.stop="handleDelete(conn.id)"></el-button>
          </div>
        </div>
        <div class="conn-card-body">
          <div class="conn-name">{{ conn.name || conn.host }}</div>
          <div class="conn-detail">
            <span><i class="el-icon-user"></i> {{ conn.username }}</span>
            <span><i class="el-icon-link"></i> {{ conn.host }}:{{ conn.port || 22 }}</span>
            <span><i :class="conn.authType === 'privateKey' ? 'el-icon-key' : 'el-icon-lock'"></i> {{ conn.authType === 'privateKey' ? '密钥认证' : '密码认证' }}</span>
          </div>
        </div>
        <div class="conn-card-footer">
          <el-button type="primary" size="mini" @click.stop="handleQuickConnect(conn)" icon="el-icon-right">
            连接
          </el-button>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-if="!connections.length" class="empty-state">
        <i class="el-icon-connection"></i>
        <p>暂无保存的连接</p>
        <el-button type="primary" size="small" @click="showDialog()">创建连接</el-button>
      </div>
    </div>

    <!-- 新建/编辑对话框 -->
    <el-dialog
      :title="editConn ? '编辑连接' : '新建连接'"
      :visible.sync="dialogVisible"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="80px" size="small">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="我的服务器"></el-input>
        </el-form-item>
        <el-form-item label="主机">
          <el-input v-model="form.host" placeholder="192.168.1.100"></el-input>
        </el-form-item>
        <el-form-item label="端口">
          <el-input v-model="form.port" type="number" placeholder="22"></el-input>
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
      <span slot="footer">
        <el-button size="small" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleSave">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import wsManager, { generateId } from '@/utils/ws'

export default {
  name: 'ConnectionsView',
  data() {
    return {
      dialogVisible: false,
      editConn: null,
      form: {
        name: '',
        host: '',
        port: 22,
        username: 'root',
        authType: 'password',
        password: '',
        privateKey: '',
        passphrase: ''
      }
    }
  },
  computed: {
    ...mapState(['connections'])
  },
  methods: {
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
      e.target.value = ''
    },
    handleAuthTypeChange() {
      if (this.form.authType === 'password') {
        this.form.privateKey = ''
        this.form.passphrase = ''
      } else {
        this.form.password = ''
      }
    },

    showDialog(conn) {
      if (conn) {
        this.editConn = conn
        this.form = { ...conn }
      } else {
        this.editConn = null
        this.form = { name: '', host: '', port: 22, username: 'root', authType: 'password', password: '', privateKey: '', passphrase: '' }
      }
      this.dialogVisible = true
    },

    handleSave() {
      if (!this.form.host) {
        this.$message.warning('请填写主机地址')
        return
      }
      if (this.form.authType === 'privateKey') {
        if (!this.form.privateKey || !this.form.privateKey.trim()) {
          this.$message.warning('请填写私钥内容')
          return
        }
        if (this.form.privateKey.indexOf('-----BEGIN') === -1) {
          this.$message.error('私钥格式不正确！必须以 -----BEGIN 开头的标准 PEM 格式')
          return
        }
      } else {
        if (!this.form.password) {
          this.$message.warning('请填写密码')
          return
        }
      }
      var conn = {
        id: this.editConn ? this.editConn.id : generateId(),
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
      this.dialogVisible = false
      this.$message.success('保存成功')
    },

    handleDelete(id) {
      this.$store.dispatch('deleteConnection', id)
      this.$message.success('已删除')
    },

    async handleQuickConnect(conn) {
      try {
        if (!wsManager.isConnected) {
          await wsManager.connect()
        }
        await wsManager.sshConnect(conn)
        this.$store.commit('SET_SSH_CONNECTED', true)
        this.$store.commit('SET_CURRENT_CONNECTION', Object.assign({}, conn))
        this.$message.success('连接成功！')
        this.$router.push('/terminal')
      } catch (err) {
        this.$message.error('连接失败: ' + err.message)
      }
    }
  }
}
</script>

<style lang="less" scoped>
.connections-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;

  h3 {
    color: #e0e0e0;
    font-size: 18px;
  }
}

.conn-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.conn-card {
  background: #1a1e24;
  border: 1px solid #2a2e34;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s;

  &:hover {
    border-color: #409EFF;
    box-shadow: 0 0 12px rgba(64, 158, 255, 0.15);
  }

  .conn-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;

    .conn-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      background: linear-gradient(135deg, #409EFF, #1a8cff);
      display: flex;
      align-items: center;
      justify-content: center;

      i {
        font-size: 20px;
        color: #fff;
      }
    }

    .conn-actions {
      .el-button {
        color: #a0a4a8;
        &:hover { color: #409EFF; }
      }
    }
  }

  .conn-card-body {
    .conn-name {
      font-size: 15px;
      font-weight: 600;
      color: #e0e0e0;
      margin-bottom: 8px;
    }

    .conn-detail {
      display: flex;
      flex-direction: column;
      gap: 4px;

      span {
        color: #a0a4a8;
        font-size: 12px;
        font-family: 'Consolas', monospace;

        i {
          width: 16px;
          text-align: center;
        }
      }
    }
  }

  .conn-card-footer {
    margin-top: 12px;
    border-top: 1px solid #2a2e34;
    padding-top: 12px;
  }
}

.empty-state {
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
  color: #a0a4a8;

  i {
    font-size: 48px;
    margin-bottom: 16px;
    display: block;
  }

  p {
    margin-bottom: 16px;
  }
}
</style>
