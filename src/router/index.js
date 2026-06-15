import Vue from 'vue'
import VueRouter from 'vue-router'
import MainLayout from '../layouts/MainLayout.vue'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    component: MainLayout,
    redirect: '/terminal',
    children: [
      {
        path: 'terminal',
        name: 'Terminal',
        component: () => import('../views/Terminal.vue'),
        meta: { title: '终端', icon: 'el-icon-monitor' }
      },
      {
        path: 'connections',
        name: 'Connections',
        component: () => import('../views/Connections.vue'),
        meta: { title: '连接管理', icon: 'el-icon-connection' }
      },
      {
        path: 'files',
        name: 'FileManager',
        component: () => import('../views/FileManager.vue'),
        meta: { title: '文件管理', icon: 'el-icon-folder' }
      },
      {
        path: 'monitor',
        name: 'Monitor',
        component: () => import('../views/Monitor.vue'),
        meta: { title: '系统监控', icon: 'el-icon-data-line' }
      }
    ]
  }
]

const router = new VueRouter({
  routes
})

export default router
