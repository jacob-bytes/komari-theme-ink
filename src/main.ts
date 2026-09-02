import { createPinia } from 'pinia'
import { createApp } from 'vue'
import { setupChunkReload } from '@/utils/chunkReload'
import { setupIconify } from '@/utils/iconify'
import { message } from '@/utils/message'
import App from './App.vue'
import router from './router'

import './styles/main.css'

window.$message = message

// 必须在挂载应用（以及任何懒加载路由/组件可能触发的动态 import）之前注册，
// 避免站点发布新版本后，旧 tab 里点击工具触发的旧 chunk 404 直接让页面留白。
setupChunkReload()

setupIconify().catch((err) => {
  console.warn('[main] iconify init failed', err)
})

const pinia = createPinia()
const app = createApp(App)

app.use(pinia)
app.use(router)

app.mount('#app')
