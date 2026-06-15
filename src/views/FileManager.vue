<template>
  <div class="file-manager">
    <!-- 未连接提示 -->
    <div v-if="!sshConnected" class="no-connection">
      <i class="el-icon-warning-outline"></i>
      <p>请先连接到服务器</p>
      <el-button type="primary" size="small" @click="$router.push('/terminal')">去连接</el-button>
    </div>

    <!-- 文件管理器主体 -->
    <div v-else class="file-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <el-button size="mini" icon="el-icon-back" @click="goBack" :disabled="pathStack.length <= 1">返回</el-button>
          <el-button size="mini" icon="el-icon-refresh" @click="handleRefresh">刷新</el-button>
          <el-button size="mini" icon="el-icon-folder-add" @click="showMkdirDialog">新建目录</el-button>
          <el-button size="mini" icon="el-icon-document-add" @click="showNewFileDialog">新建文件</el-button>
          <el-button size="mini" icon="el-icon-upload2" @click="triggerUpload">上传文件</el-button>
        </div>
        <div class="path-bar">
          <i class="el-icon-folder"></i>
          <input
            class="path-input"
            v-model="inputPath"
            @keyup.enter="gotoPath"
            placeholder="输入路径回车进入"
          />
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="file-list" v-loading="loading" element-loading-text="加载中..." element-loading-background="#0f1318">
        <div class="file-header">
          <div class="col-name">名称</div>
          <div class="col-size">大小</div>
          <div class="col-time">修改时间</div>
        </div>
        <div v-if="loadError" class="file-error">
          <i class="el-icon-warning-outline"></i>
          <p>{{ loadError }}</p>
          <el-button type="primary" size="mini" @click="loadHome">重试</el-button>
        </div>
        <div v-else-if="fileList.length === 0 && !loading" class="file-empty">
          <i class="el-icon-folder-opened"></i>
          <p>目录为空</p>
        </div>
        <div
          v-for="file in fileList"
          :key="file.name"
          class="file-row"
          @click="handleOpen(file)"
          @mouseenter="handleHover(file)"
          @contextmenu.prevent="showContextMenu($event, file)"
        >
          <div class="col-name">
            <i :class="file.isDirectory ? 'el-icon-folder' : 'el-icon-document'" :style="{ color: file.isDirectory ? '#E6A23C' : '#909399' }"></i>
            <span>{{ file.name }}</span>
          </div>
          <div class="col-size">{{ file.isDirectory ? '-' : formatSize(file.size) }}</div>
          <div class="col-time">{{ formatDate(file.mtime) }}</div>
        </div>
      </div>
    </div>

    <!-- 新建目录对话框 -->
    <el-dialog title="新建目录" :visible.sync="mkdirDialogVisible" width="400px">
      <el-input v-model="newDirName" placeholder="目录名称" size="small"></el-input>
      <span slot="footer">
        <el-button size="small" @click="mkdirDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleMkdir">创建</el-button>
      </span>
    </el-dialog>

    <!-- 新建文件对话框 -->
    <el-dialog title="新建文件" :visible.sync="newFileDialogVisible" width="400px">
      <el-input v-model="newFileName" placeholder="文件名称" size="small"></el-input>
      <span slot="footer">
        <el-button size="small" @click="newFileDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleNewFile">创建</el-button>
      </span>
    </el-dialog>

    <!-- 文件编辑对话框 -->
    <el-dialog :title="editingFilePath ? '编辑: ' + editingFileName : '查看: ' + editingFileName" :visible.sync="editDialogVisible" width="800px" :close-on-click-modal="false">
      <div class="file-editor">
        <el-input
          v-model="editingContent"
          type="textarea"
          :rows="20"
          spellcheck="false"
          placeholder="文件内容"
        ></el-input>
      </div>
      <span slot="footer">
        <el-button size="small" @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" size="small" @click="handleSaveFile" :loading="savingFile">保存</el-button>
      </span>
    </el-dialog>
    <!-- 隐藏的文件上传 input -->
    <input type="file" ref="uploadInput" style="display:none" @change="handleUpload" />

    <!-- 右键菜单 -->
    <div v-if="contextMenu.visible" class="context-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
      <div v-if="!contextMenu.file.isDirectory" class="context-item" @click="handleEditFile(contextMenu.file)">
        <i class="el-icon-edit"></i> 编辑
      </div>
      <div v-if="!contextMenu.file.isDirectory" class="context-item" @click="handleDownload(contextMenu.file)">
        <i class="el-icon-download"></i> 下载
      </div>
      <div class="context-item" @click="handleDelete(contextMenu.file)">
        <i class="el-icon-delete"></i> 删除
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import wsManager from '@/utils/ws'

export default {
  name: 'FileManagerView',
  data() {
    return {
      currentPath: '',
      pathStack: [],
      fileList: [],
      dirCache: {},
      fileCache: {},
      inputPath: '',
      loading: false,
      loadError: '',
      mkdirDialogVisible: false,
      newDirName: '',
      newFileDialogVisible: false,
      newFileName: '',
      editDialogVisible: false,
      editingFileName: '',
      editingFilePath: '',
      editingContent: '',
      originalContent: '',
      savingFile: false,
      contextMenu: { visible: false, x: 0, y: 0, file: {} }
    }
  },
  computed: {
    ...mapState(['sshConnected'])
  },
  watch: {
    sshConnected(val) {
      if (val) {
        this.loadHome()
      }
    }
  },
  mounted() {
    if (this.sshConnected) {
      this.loadHome()
    }
    this._closeMenu = () => { this.contextMenu.visible = false }
    document.addEventListener('click', this._closeMenu)
  },
  beforeDestroy() {
    document.removeEventListener('click', this._closeMenu)
  },
  methods: {
    async loadDirectory(path, silent) {
      if (!silent) {
        this.currentPath = path
        this.inputPath = path
        this.loading = true
        this.loadError = ''
      }
      if (!silent && this.dirCache[path]) {
        this.fileList = this.dirCache[path]
      }
      try {
        var res = await wsManager.request({
          type: 'sftp-list',
          path: path
        })
        var sorted = res.data.sort(function (a, b) {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        this.dirCache[path] = sorted
        if (this.currentPath === path) {
          this.fileList = sorted
        }
      } catch (err) {
        if (silent) return
        if (err.message && err.message.includes('Permission')) {
          this.loadError = '无权限访问该目录'
        } else {
          this.loadError = '读取目录失败: ' + err.message
        }
      }
      if (!silent) {
        this.loading = false
      }
    },

    async loadHome() {
      this.loading = true
      this.loadError = ''
      // 不再依赖 exec，直接尝试常见 home 目录
      var pathsToTry = ['/root', '/home']
      // 如果有当前连接信息，尝试用户名对应的 home
      var conn = this.$store.state.currentConnection
      if (conn && conn.username && conn.username !== 'root') {
        pathsToTry.unshift('/home/' + conn.username)
      }
      for (var i = 0; i < pathsToTry.length; i++) {
        try {
          var res = await wsManager.request({ type: 'sftp-list', path: pathsToTry[i] })
          if (res.data && res.data.length >= 0) {
            this.pathStack = [pathsToTry[i]]
            this.currentPath = pathsToTry[i]
            this.inputPath = pathsToTry[i]
            this.fileList = res.data.sort(function (a, b) {
              if (a.isDirectory && !b.isDirectory) return -1
              if (!a.isDirectory && b.isDirectory) return 1
              return a.name.localeCompare(b.name)
            })
            this.dirCache[pathsToTry[i]] = this.fileList
            this.loading = false
            return
          }
        } catch (e) {
          // 继续尝试下一个路径
        }
      }
      // 所有路径都失败，尝试根目录
      try {
        var res2 = await wsManager.request({ type: 'sftp-list', path: '/' })
        this.pathStack = ['/']
        this.currentPath = '/'
        this.inputPath = '/'
        this.fileList = res2.data.sort(function (a, b) {
          if (a.isDirectory && !b.isDirectory) return -1
          if (!a.isDirectory && b.isDirectory) return 1
          return a.name.localeCompare(b.name)
        })
        this.dirCache['/'] = this.fileList
      } catch (e) {
        this.loadError = '无法加载目录: ' + e.message
      }
      this.loading = false
    },

    handleOpen(file) {
      if (file.isDirectory) {
        var newPath = this.currentPath === '/' ? '/' + file.name : this.currentPath + '/' + file.name
        this.pathStack.push(newPath)
        this.loadDirectory(newPath)
      } else {
        this.handleEditFile(file)
      }
    },

    showContextMenu(e, file) {
      this.contextMenu = { visible: true, x: e.clientX, y: e.clientY, file: file }
    },

    goBack() {
      if (this.pathStack.length > 1) {
        this.pathStack.pop()
        var path = this.pathStack[this.pathStack.length - 1]
        this.loadDirectory(path)
      }
    },

    gotoPath() {
      var path = this.inputPath.trim()
      if (!path) return
      if (!path.startsWith('/')) path = '/' + path
      // 去掉末尾斜杠（根目录除外）
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
      this.pathStack.push(path)
      this.loadDirectory(path)
    },

    handleHover(file) {
      // 仅预加载目录（不预加载文件，避免大量请求卡死）
      if (file.isDirectory) {
        var dirPath = this.currentPath === '/' ? '/' + file.name : this.currentPath + '/' + file.name
        if (!this.dirCache[dirPath]) {
          this.loadDirectory(dirPath, true)
        }
      }
    },

    async handleEditFile(file) {
      var filePath = this.currentPath === '/' ? '/' + file.name : this.currentPath + '/' + file.name
      this.editingFileName = file.name
      this.editingFilePath = filePath
      // 如果有缓存，直接显示
      if (this.fileCache[filePath]) {
        this.editingContent = this.fileCache[filePath]
        this.originalContent = this.fileCache[filePath]
        this.editDialogVisible = true
        return
      }
      try {
        var res = await wsManager.request({
          type: 'sftp-read',
          path: filePath
        })
        this.fileCache[filePath] = res.data
        this.editingContent = res.data
        this.originalContent = res.data
        this.editDialogVisible = true
      } catch (err) {
        this.$message.error('读取文件失败: ' + err.message)
      }
    },

    async handleSaveFile() {
      if (!this.editingFilePath) return
      this.savingFile = true
      try {
        await wsManager.request({
          type: 'sftp-write',
          path: this.editingFilePath,
          content: this.editingContent
        })
        this.$message.success('保存成功')
        this.editDialogVisible = false
        this.loadDirectory(this.currentPath)
      } catch (err) {
        this.$message.error('保存失败: ' + err.message)
      } finally {
        this.savingFile = false
      }
    },

    showMkdirDialog() {
      this.newDirName = ''
      this.mkdirDialogVisible = true
    },

    showNewFileDialog() {
      this.newFileName = ''
      this.newFileDialogVisible = true
    },

    async handleNewFile() {
      if (!this.newFileName) return
      const filePath = this.currentPath === '/' ? '/' + this.newFileName : this.currentPath + '/' + this.newFileName
      try {
        await wsManager.request({
          type: 'sftp-write',
          path: filePath,
          content: ''
        })
        this.$message.success('文件创建成功')
        this.newFileDialogVisible = false
        delete this.dirCache[this.currentPath]
        this.loadDirectory(this.currentPath)
      } catch (err) {
        this.$message.error('创建文件失败: ' + err.message)
      }
    },

    handleRefresh() {
      delete this.dirCache[this.currentPath]
      this.loadDirectory(this.currentPath)
    },

    async handleMkdir() {
      if (!this.newDirName) return
      const path = this.currentPath === '/' ? `/${this.newDirName}` : `${this.currentPath}/${this.newDirName}`
      try {
        await wsManager.request({
          type: 'sftp-mkdir',
          path: path
        })
        this.$message.success('创建成功')
        this.mkdirDialogVisible = false
        this.loadDirectory(this.currentPath)
      } catch (err) {
        this.$message.error('创建失败: ' + err.message)
      }
    },

    async handleDelete(file) {
      const path = this.currentPath === '/' ? `/${file.name}` : `${this.currentPath}/${file.name}`
      try {
        await this.$confirm(`确定删除 ${file.name} 吗？`, '提示', { type: 'warning' })
        await wsManager.request({
          type: 'sftp-delete',
          path: path,
          isDirectory: file.isDirectory
        })
        this.$message.success('删除成功')
        this.loadDirectory(this.currentPath)
      } catch (err) {
        if (err !== 'cancel') {
          this.$message.error('删除失败: ' + err.message)
        }
      }
    },

    formatSize(bytes) {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i]
    },

    formatDate(ts) {
      if (!ts) return '-'
      const d = new Date(ts)
      return d.toLocaleString('zh-CN')
    },

    triggerUpload() {
      this.$refs.uploadInput.click()
    },

    handleUpload(event) {
      var file = event.target.files[0]
      if (!file) return
      // 50MB 限制
      if (file.size > 50 * 1024 * 1024) {
        this.$message.error('文件过大，最大支持 50MB')
        return
      }
      var self = this
      var reader = new FileReader()
      reader.onload = function (e) {
        var base64 = e.target.result.split(',')[1]
        var remotePath = self.currentPath === '/' ? '/' + file.name : self.currentPath + '/' + file.name
        wsManager.request({
          type: 'sftp-upload',
          path: remotePath,
          content: base64
        }).then(function () {
          self.$message.success('上传成功: ' + file.name)
          delete self.dirCache[self.currentPath]
          self.loadDirectory(self.currentPath)
        }).catch(function (err) {
          self.$message.error('上传失败: ' + err.message)
        })
      }
      reader.readAsDataURL(file)
      // 重置 input 以便重复上传同一文件
      event.target.value = ''
    },

    async handleDownload(file) {
      var filePath = this.currentPath === '/' ? '/' + file.name : this.currentPath + '/' + file.name
      try {
        this.$message.info('正在下载 ' + file.name + ' ...')
        var res = await wsManager.request({
          type: 'sftp-download',
          path: filePath
        })
        // base64 转 Blob 并触发下载
        var binaryStr = atob(res.data)
        var bytes = new Uint8Array(binaryStr.length)
        for (var i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        var blob = new Blob([bytes])
        var url = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = file.name
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        this.$message.success('下载完成: ' + file.name)
      } catch (err) {
        this.$message.error('下载失败: ' + err.message)
      }
    }
  }
}
</script>

<style lang="less" scoped>
.file-manager {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.no-connection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #a0a4a8;

  i { font-size: 48px; margin-bottom: 16px; }
  p { margin-bottom: 16px; }
}

.file-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #12161c;
  border-bottom: 1px solid #2a2e34;

  .path-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #1a1e24;
    border: 1px solid #2a2e34;
    border-radius: 4px;
    padding: 0 12px;
    font-family: 'Consolas', monospace;
    font-size: 13px;
    color: #67C23A;
    flex: 1;
    max-width: 600px;

    i { color: #E6A23C; flex-shrink: 0; }
  }

  .path-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #67C23A;
    font-family: 'Consolas', monospace;
    font-size: 13px;
    padding: 4px 0;
    &::placeholder { color: #555; }
  }
}

.file-list {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.file-header, .file-row {
  display: flex;
  align-items: center;
  padding: 0 16px;
  height: 40px;
}

.file-header {
  background: #12161c;
  color: #a0a4a8;
  font-size: 12px;
  font-weight: 600;
  border-bottom: 1px solid #2a2e34;
}

.file-row {
  border-bottom: 1px solid #1a1e24;
  cursor: pointer;
  transition: background 0.2s;

  &:hover {
    background: #1a1e24;
  }
}

.col-name {
  flex: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  min-width: 0;

  i { font-size: 16px; flex-shrink: 0; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

.col-size {
  flex: 0.8;
  font-size: 12px;
  color: #a0a4a8;
  font-family: 'Consolas', monospace;
}

.col-time {
  flex: 1.2;
  font-size: 12px;
  color: #a0a4a8;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  background: #1a1e24;
  border: 1px solid #2a2e34;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

.context-item {
  padding: 8px 16px;
  font-size: 13px;
  color: #e0e0e0;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    background: #2a2e34;
  }

  i { font-size: 14px; }
}

.file-error, .file-empty {
  text-align: center;
  padding: 60px 0;
  color: #a0a4a8;

  i { font-size: 48px; margin-bottom: 16px; display: block; }
  p { margin-bottom: 16px; }
}

.file-error {
  color: #F56C6C;
}

.file-editor {
  /deep/ .el-textarea__inner {
    background: #0a0e14;
    color: #e0e0e0;
    border-color: #2a2e34;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 13px;
    line-height: 1.6;
    border-radius: 6px;
    padding: 16px;

    &:focus {
      border-color: #409EFF;
    }
  }
}
</style>
