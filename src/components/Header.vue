<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import VisitorInfo from '@/components/VisitorInfo.vue'
import { useVisitorAudit } from '@/composables/useVisitorAudit'
import { useAppStore } from '@/stores/app'

const router = useRouter()
const appStore = useAppStore()
const { record: recordVisitorEvent } = useVisitorAudit()

const siteFavicon = ref('/favicon.ico')

const actionButtons = computed(() => {
  const themeTitleMap = {
    auto: appStore.managedThemeMode === 'beijing'
      ? appStore.isBeijingDaytime ? '自动主题：北京时间日间' : '自动主题：北京时间夜间'
      : appStore.managedThemeMode === 'light' ? '自动主题：后台浅色' : '自动主题：后台深色',
    light: '浅色主题',
    dark: '深色主题',
  } as const

  const themeIconMap = {
    auto: appStore.isDark ? 'icon-park-outline:moon' : 'icon-park-outline:sun-one',
    light: 'icon-park-outline:sun-one',
    dark: 'icon-park-outline:moon',
  } as const

  const buttons: Array<{ title: string, icon: string, action: string, pressed?: boolean }> = []

  if (router.currentRoute.value.name === 'home' && appStore.homeToolsEnabled) {
    buttons.push({
      title: appStore.homeAdvancedToolsVisible ? '收起首页工具' : '显示首页工具',
      icon: 'tabler:tools',
      action: 'toggleHomeTools',
      pressed: appStore.homeAdvancedToolsVisible,
    })
  }

  buttons.push({
    title: `${themeTitleMap[appStore.themeMode]}（点击切换）`,
    icon: themeIconMap[appStore.themeMode],
    action: 'toggleTheme',
  })

  if (!appStore.loading && (appStore.privateFeaturesAllowed || !appStore.hideAdminEntryWhenLoggedOut)) {
    buttons.push({
      title: '后台管理',
      icon: 'icon-park-outline:setting',
      action: 'jumpToSetting',
    })
  }
  return buttons
})

function handleButtonClick(action: string) {
  switch (action) {
    case 'toggleTheme':
      appStore.updateThemeMode()
      void recordVisitorEvent({
        event: 'theme_mode_change',
        path: router.currentRoute.value.path,
        route: String(router.currentRoute.value.name ?? ''),
        target: appStore.themeMode,
      })
      break
    case 'toggleHomeTools':
      appStore.homeAdvancedToolsVisible = !appStore.homeAdvancedToolsVisible
      break
    case 'jumpToSetting':
      void recordVisitorEvent({
        event: 'admin_entry_click',
        path: router.currentRoute.value.path,
        route: String(router.currentRoute.value.name ?? ''),
      })
      location.href = '/admin'
      break
  }
}

/** 站点名：读 localStorage 缓存，避免刷新时先显示默认文案再闪烁为自定义站名 */
const sitename = computed(() => {
  let cached = ''
  try {
    cached = localStorage.getItem('theme:sitename:v1') || ''
  }
  catch {
    cached = ''
  }
  return cached || appStore.publicSettings?.sitename || 'Komari Monitor'
})

/**
 * 数据新鲜度指示：freshAt 是锚点（进入页面的时间），只设置一次；now 每 2s 更新一次
 * 仅用于触发 freshText 重新计算，让"Ns 前更新"随时间递增。之前的实现每次 tick 都把
 * freshAt 本身重置为当前时间，导致 seconds 永远接近 0、文案永远卡在"实时"，且定时器
 * 从未清理。
 */
const freshAt = Date.now()
const now = ref(Date.now())
const freshText = computed(() => {
  const seconds = Math.max(0, Math.round((now.value - freshAt) / 1000))
  return seconds <= 1 ? '实时' : `${seconds}s 前更新`
})
let freshTimer: ReturnType<typeof window.setInterval> | undefined
onMounted(() => {
  freshTimer = window.setInterval(() => {
    now.value = Date.now()
  }, 2000)
})
onUnmounted(() => {
  if (freshTimer !== undefined)
    window.clearInterval(freshTimer)
})
</script>

<template>
  <!-- 访客 IP 组件，全局悬浮 -->
  <VisitorInfo v-if="!appStore.loading && appStore.visitorInfoEnabled" />

  <div
    class="bg-card transition-colors duration-200 top-0 sticky z-10 w-full border-b border-border"
    style="padding-top: env(safe-area-inset-top); width: 100%;"
  >
    <div class="px-4 flex-between h-14 max-w-[1280px] mx-auto">
      <div class="flex items-center gap-3 cursor-pointer" @click="router.push('/')">
        <Avatar class="size-8">
          <AvatarImage :src="siteFavicon" :alt="sitename" />
          <AvatarFallback>{{ sitename.slice(0, 1) }}</AvatarFallback>
        </Avatar>
        <h3 class="m-0 text-lg font-semibold">
          {{ sitename }}
        </h3>
      </div>
      <TooltipProvider :delay-duration="200">
        <div class="flex items-center gap-2">
          <span
            class="mr-1 hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground"
            :title="freshText" aria-label="数据更新时间"
          >
            <span class="size-1.5 rounded-full bg-primary" />
            {{ freshText }}
          </span>
          <Tooltip v-for="button in actionButtons" :key="button.action">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="button.title"
                :aria-pressed="button.pressed"
                :class="button.pressed && 'bg-background/70 text-selection'"
                @click="handleButtonClick(button.action)"
              >
                <Icon :icon="button.icon" :width="18" :height="18" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{{ button.title }}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  </div>
</template>
