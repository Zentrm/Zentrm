<template>
  <div id="app">
    <router-view />
  </div>
</template>

<script>
export default {
  name: 'App',
  mounted() {
    // 页面加载时尝试自动重连SSH
    if (!this.$store.state.sshConnected && this.$store.state.sessionId) {
      this.$store.dispatch('autoReconnect').then(function (ok) {
        if (ok && this.$route.path !== '/terminal') {
          this.$router.push('/terminal')
        }
      }.bind(this))
    }
  }
}
</script>

<style lang="less">
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background: #0a0e14;
  color: #e0e0e0;
}

/* 滚动条样式 */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: #1a1e24;
}
::-webkit-scrollbar-thumb {
  background: #3a3e44;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #4a4e54;
}
</style>
