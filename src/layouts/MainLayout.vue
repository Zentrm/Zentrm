<template>
  <div class="main-layout">
    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ collapsed: isCollapsed }">
      <div class="logo">
        <i class="el-icon-position"></i>
        <span v-show="!isCollapsed" class="logo-text">Zentrm</span>
      </div>
      <el-menu
        :default-active="$route.path"
        :collapse="isCollapsed"
        :collapse-transition="false"
        background-color="#1a1e24"
        text-color="#a0a4a8"
        active-text-color="#409EFF"
        router
      >
        <el-menu-item index="/terminal">
          <i class="el-icon-monitor"></i>
          <span slot="title">终端</span>
        </el-menu-item>
        <el-menu-item index="/connections">
          <i class="el-icon-connection"></i>
          <span slot="title">连接管理</span>
        </el-menu-item>
        <el-menu-item index="/files">
          <i class="el-icon-folder"></i>
          <span slot="title">文件管理</span>
        </el-menu-item>
        <el-menu-item index="/monitor">
          <i class="el-icon-data-line"></i>
          <span slot="title">系统监控</span>
        </el-menu-item>
      </el-menu>
      <div class="sidebar-footer">
        <div class="collapse-btn" @click="isCollapsed = !isCollapsed">
          <i :class="isCollapsed ? 'el-icon-s-unfold' : 'el-icon-s-fold'"></i>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="main-content">
      <!-- 顶部状态栏 -->
      <div class="topbar">
        <div class="topbar-left">
          <span class="page-title">{{ $route.meta.title }}</span>
        </div>
        <div class="topbar-right">
          <div class="connection-status" :class="{ connected: sshConnected }">
            <span class="status-dot"></span>
            <span>{{ sshConnected ? '已连接' : '未连接' }}</span>
          </div>
          <div v-if="currentConnection" class="server-info">
            <i class="el-icon-monitor"></i>
            {{ currentConnection.username }}@{{ currentConnection.host }}
          </div>
        </div>
      </div>
      <!-- 页面内容 -->
      <div class="page-content">
        <router-view />
      </div>
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'MainLayout',
  data() {
    return {
      isCollapsed: false
    }
  },
  computed: {
    ...mapState(['sshConnected', 'currentConnection'])
  }
}
</script>

<style lang="less" scoped>
.main-layout {
  display: flex;
  width: 100%;
  height: 100%;
}

.sidebar {
  width: 200px;
  height: 100%;
  background: #1a1e24;
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
  border-right: 1px solid #2a2e34;

  &.collapsed {
    width: 64px;
  }

  .logo {
    height: 60px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 20px;
    color: #409EFF;
    border-bottom: 1px solid #2a2e34;

    i {
      font-size: 24px;
    }

    .logo-text {
      font-weight: 700;
      font-size: 16px;
      background: linear-gradient(135deg, #409EFF, #67C23A);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
  }

  .el-menu {
    border-right: none;
    flex: 1;
  }

  .sidebar-footer {
    border-top: 1px solid #2a2e34;
    padding: 10px;

    .collapse-btn {
      text-align: center;
      cursor: pointer;
      color: #a0a4a8;
      font-size: 18px;
      padding: 8px;
      border-radius: 4px;
      transition: all 0.3s;

      &:hover {
        color: #409EFF;
        background: #2a2e34;
      }
    }
  }
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  height: 50px;
  background: #12161c;
  border-bottom: 1px solid #2a2e34;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;

  .topbar-left {
    .page-title {
      font-size: 16px;
      font-weight: 600;
      color: #e0e0e0;
    }
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 20px;

    .connection-status {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: #a0a4a8;

      .status-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #F56C6C;
      }

      &.connected .status-dot {
        background: #67C23A;
        box-shadow: 0 0 6px #67C23A;
      }
    }

    .server-info {
      color: #67C23A;
      font-size: 13px;
      font-family: 'Consolas', 'Monaco', monospace;
    }
  }
}

.page-content {
  flex: 1;
  overflow: auto;
  background: #0a0e14;
}
</style>
