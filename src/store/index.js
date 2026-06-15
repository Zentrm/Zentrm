import Vue from 'vue'
import Vuex from 'vuex'
import wsManager from '@/utils/ws'

Vue.use(Vuex)

export default new Vuex.Store({
  state: {
    wsConnected: false,
    sshConnected: false,
    sessionId: localStorage.getItem('ssh-session-id') || null,
    currentConnection: JSON.parse(localStorage.getItem('ssh-current-connection') || 'null'),
    connections: JSON.parse(localStorage.getItem('ssh-connections') || '[]'),
    terminals: [],
    activeTerminal: null
  },

  mutations: {
    SET_WS_CONNECTED(state, val) {
      state.wsConnected = val
    },
    SET_SSH_CONNECTED(state, val) {
      state.sshConnected = val
    },
    SET_SESSION_ID(state, id) {
      state.sessionId = id
      if (id) {
        localStorage.setItem('ssh-session-id', id)
      } else {
        localStorage.removeItem('ssh-session-id')
      }
    },
    SET_CURRENT_CONNECTION(state, conn) {
      if (conn) {
        state.currentConnection = conn
        localStorage.setItem('ssh-current-connection', JSON.stringify(conn))
      } else {
        state.currentConnection = null
        localStorage.removeItem('ssh-current-connection')
      }
    },
    SET_CONNECTIONS(state, list) {
      state.connections = list
      localStorage.setItem('ssh-connections', JSON.stringify(list))
    },
    ADD_TERMINAL(state, term) {
      state.terminals.push(term)
    },
    REMOVE_TERMINAL(state, id) {
      state.terminals = state.terminals.filter(t => t.id !== id)
    },
    SET_ACTIVE_TERMINAL(state, id) {
      state.activeTerminal = id
    }
  },

  actions: {
    // 保存连接
    saveConnection({ commit, state }, conn) {
      const list = [...state.connections]
      const idx = list.findIndex(c => c.id === conn.id)
      if (idx >= 0) {
        list[idx] = conn
      } else {
        list.push(conn)
      }
      commit('SET_CONNECTIONS', list)
    },

    // 删除连接
    deleteConnection({ commit, state }, id) {
      const list = state.connections.filter(c => c.id !== id)
      commit('SET_CONNECTIONS', list)
    },

    // 自动重连（刷新页面后）
    async autoReconnect({ commit, state }) {
      if (!state.sessionId) return false
      try {
        if (!wsManager.isConnected) {
          await wsManager.connect()
        }
        const res = await wsManager.sshReconnect(state.sessionId)
        commit('SET_SSH_CONNECTED', true)
        commit('SET_SESSION_ID', res.sessionId)
        return true
      } catch (err) {
        console.warn('[Reconnect] 重连失败:', err.message)
        commit('SET_SSH_CONNECTED', false)
        commit('SET_SESSION_ID', null)
        commit('SET_CURRENT_CONNECTION', null)
        return false
      }
    },

    // 断开 SSH
    sshDisconnect({ state, commit }) {
      wsManager.disconnect()
      commit('SET_SSH_CONNECTED', false)
      commit('SET_SESSION_ID', null)
      commit('SET_CURRENT_CONNECTION', null)
    }
  }
})
