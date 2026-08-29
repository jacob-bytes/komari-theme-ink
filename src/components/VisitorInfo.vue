<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { computed, onMounted, onUnmounted, ref } from 'vue'

interface VisitorData {
  ip: string
  city: string
  region: string
  country: string
  org: string
}

interface VisitorProvider {
  url: string
  normalize: (data: unknown) => VisitorData | null
}

type JsonRecord = Record<string, unknown>

const visitorFetchTimeout = 8000
const mobileScrollIdleDelay = 700
const mobileViewportQuery = '(max-width: 767px)'

const show = ref(false)
/** 就地展开/折叠：点击胶囊任意位置切换 */
const detailOpen = ref(false)
/** 4 秒无交互自动隐藏整个组件（刷新后重新出现） */
const hideAll = ref(false)
let hideAllTimer: number | undefined

function resetHideAllTimer() {
  if (hideAllTimer !== undefined)
    window.clearTimeout(hideAllTimer)
  hideAllTimer = window.setTimeout(() => {
    hideAll.value = true
    hideAllTimer = undefined
  }, 4000)
}

function toggleDetail(force?: boolean) {
  detailOpen.value = force ?? !detailOpen.value
  // 任何交互都重置 4 秒隐藏计时
  resetHideAllTimer()
}
const visitorLoading = ref(true)
const visitorFailed = ref(false)
const mobileScrolling = ref(false)
const visitor = ref<VisitorData>({
  ip: '',
  city: '',
  region: '',
  country: '',
  org: '',
})

const visitorProviders: VisitorProvider[] = [
  {
    url: 'https://ipwho.is/',
    normalize: normalizeIpwhoData,
  },
  {
    url: 'https://ipapi.co/json/',
    normalize: normalizeIpapiData,
  },
  {
    url: 'https://api.ip.sb/geoip',
    normalize: normalizeIpSbData,
  },
]

const compactLocation = computed(() => {
  const parts = [visitor.value.city, visitor.value.region].filter(Boolean)
  return parts.join(', ') || visitor.value.country || (visitorLoading.value ? '定位中' : '未知位置')
})

const displayIp = computed(() => visitor.value.ip || (visitorLoading.value ? '获取中' : '未获取到'))
const displayCountry = computed(() => visitor.value.country || (visitorLoading.value ? '定位中' : '未知地区'))
const displayOrg = computed(() => visitor.value.org || (visitorLoading.value ? '正在获取网络信息' : '运营商未知'))
const welcomeLocation = computed(() => visitor.value.city || visitor.value.country || (visitorLoading.value ? 'your network' : 'unknown location'))
const visitorStatusText = computed(() => {
  if (visitorLoading.value)
    return '正在获取访客信息'
  if (visitorFailed.value)
    return '已显示本地设备信息，公网定位暂未返回'
  return `Welcome from ${welcomeLocation.value}!`
})

const windowsPattern = /Windows/i
const androidPattern = /Android/i
const iosPattern = /iPhone|iPad/i
const edgPattern = /Edg/i
const chromePattern = /Chrome/i
const firefoxPattern = /Firefox/i
const safariPattern = /Safari/i
const macOsPattern = /Mac OS X/i
const linuxPattern = /Linux/i
let mobileViewport: MediaQueryList | null = null
let scrollIdleTimer: number | undefined

function handleScroll(): void {
  if (!mobileViewport?.matches)
    return

  mobileScrolling.value = true
  if (scrollIdleTimer !== undefined)
    window.clearTimeout(scrollIdleTimer)
  scrollIdleTimer = window.setTimeout(() => {
    mobileScrolling.value = false
    scrollIdleTimer = undefined
  }, mobileScrollIdleDelay)
}

onMounted(async () => {
  mobileViewport = window.matchMedia(mobileViewportQuery)
  window.addEventListener('scroll', handleScroll, { passive: true })

  window.setTimeout(() => {
    show.value = true
    // 显示后启动 4 秒无交互自动隐藏计时
    resetHideAllTimer()
  }, 600)

  try {
    const data = await fetchVisitorData()
    if (data) {
      visitor.value = data
      return
    }

    visitorFailed.value = true
  }
  finally {
    visitorLoading.value = false
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
  if (scrollIdleTimer !== undefined)
    window.clearTimeout(scrollIdleTimer)
  if (hideAllTimer !== undefined)
    window.clearTimeout(hideAllTimer)
})

async function fetchVisitorData(): Promise<VisitorData | null> {
  for (const provider of visitorProviders) {
    const data = await fetchProviderData(provider)
    if (data)
      return data
  }

  return null
}

async function fetchProviderData(provider: VisitorProvider): Promise<VisitorData | null> {
  try {
    const data = await fetchJsonWithTimeout(provider.url)
    return provider.normalize(data)
  }
  catch {
    return null
  }
}

async function fetchJsonWithTimeout(url: string): Promise<unknown> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), visitorFetchTimeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    })

    if (!response.ok)
      throw new Error(`Visitor info request failed: ${response.status}`)

    return await response.json()
  }
  finally {
    window.clearTimeout(timeoutId)
  }
}

function normalizeIpwhoData(data: unknown): VisitorData | null {
  if (!isRecord(data) || data.success === false)
    return null

  const connection = isRecord(data.connection) ? data.connection : {}

  return createVisitorData({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country,
    org: pickString(connection.org, connection.isp, connection.domain),
  })
}

function normalizeIpapiData(data: unknown): VisitorData | null {
  if (!isRecord(data) || data.error === true)
    return null

  return createVisitorData({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country_name,
    org: data.org,
  })
}

function normalizeIpSbData(data: unknown): VisitorData | null {
  if (!isRecord(data))
    return null

  return createVisitorData({
    ip: data.ip,
    city: data.city,
    region: data.region,
    country: data.country,
    org: pickString(data.organization, data.isp, data.asn_organization),
  })
}

function createVisitorData(data: Record<keyof VisitorData, unknown>): VisitorData | null {
  const ip = readString(data.ip)
  if (!ip)
    return null

  return {
    ip,
    city: readString(data.city),
    region: readString(data.region),
    country: readString(data.country),
    org: readString(data.org),
  }
}

function isRecord(data: unknown): data is JsonRecord {
  return typeof data === 'object' && data !== null
}

function pickString(...values: unknown[]): string {
  for (const value of values) {
    const text = readString(value)
    if (text)
      return text
  }

  return ''
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function getBrowserName(): string {
  const ua = navigator.userAgent
  if (edgPattern.test(ua))
    return 'Edge Browser'
  if (chromePattern.test(ua))
    return 'Chrome Browser'
  if (firefoxPattern.test(ua))
    return 'Firefox Browser'
  if (safariPattern.test(ua))
    return 'Safari Browser'
  return 'Unknown Browser'
}

function getOsName(): string {
  const ua = navigator.userAgent
  if (windowsPattern.test(ua))
    return 'Windows'
  if (macOsPattern.test(ua))
    return 'macOS'
  if (androidPattern.test(ua))
    return 'Android'
  if (iosPattern.test(ua))
    return 'iOS'
  if (linuxPattern.test(ua))
    return 'Linux'
  return 'Unknown OS'
}

function formatDate(): string {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
</script>

<template>
  <!-- 底部居中 IP 信息条：胶囊 ⇄ 就地双列展开（同一容器，无独立悬浮层） -->
  <Transition name="slide-up">
    <div
      v-if="show && !mobileScrolling && !hideAll"
      class="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 w-[440px] max-w-[calc(100vw-1.5rem)] md:bottom-4
             bg-white/55 dark:bg-black/50 backdrop-blur-md
             border border-white/40 dark:border-white/10
             shadow-lg text-[12px] md:text-[13px] select-none transition-all duration-300"
      :class="detailOpen ? 'rounded-2xl px-4 py-3' : 'rounded-full px-3 py-1.5 md:px-4'"
      role="button"
      :tabindex="detailOpen ? -1 : 0"
      :aria-label="detailOpen ? '收起访客详情' : '展开访客详情'"
      :aria-expanded="detailOpen"
      @click="toggleDetail()"
      @keydown.enter="toggleDetail()"
    >
      <!-- 折叠态：胶囊单行（内容居中；宽度与展开态恒定一致） -->
      <div v-if="!detailOpen" class="flex items-center justify-center gap-1.5 whitespace-nowrap">
        <Icon icon="icon-park-outline:earth" :width="14" :height="14" class="text-blue-500 shrink-0" />
        <span class="hidden text-muted-foreground sm:inline">Your IP:</span>
        <span class="min-w-0 truncate font-semibold text-foreground">{{ displayIp }}</span>
        <span class="text-muted-foreground/40 shrink-0">|</span>
        <span class="max-w-20 shrink-0 truncate text-muted-foreground sm:max-w-none">{{ displayCountry }}</span>
        <span class="hidden sm:inline text-muted-foreground/40 shrink-0">|</span>
        <span class="hidden sm:inline text-muted-foreground truncate max-w-[140px] md:max-w-[220px]">{{ displayOrg }}</span>
        <Icon icon="icon-park-outline:up" :width="12" :height="12" class="shrink-0 text-muted-foreground" />
      </div>

      <!-- 展开态：同容器内双列平铺全部信息 -->
      <div v-else class="flex flex-col gap-2.5">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5">
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="tabler:world" :width="13" :height="13" class="shrink-0 text-blue-500" />
            <span class="shrink-0 text-muted-foreground">地区</span>
            <span class="truncate font-medium">{{ compactLocation }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="tabler:device-desktop" :width="13" :height="13" class="shrink-0 text-blue-500" />
            <span class="shrink-0 text-muted-foreground">设备</span>
            <span class="truncate font-medium">{{ getOsName() }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="icon-park-outline:local" :width="13" :height="13" class="shrink-0 text-blue-500" />
            <span class="shrink-0 text-muted-foreground">IP</span>
            <span class="truncate font-mono font-medium">{{ displayIp }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="icon-park-outline:browser-chrome" :width="13" :height="13" class="shrink-0 text-muted-foreground" />
            <span class="shrink-0 text-muted-foreground">浏览器</span>
            <span class="truncate font-medium">{{ getBrowserName() }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="icon-park-outline:protect" :width="13" :height="13" class="shrink-0 text-muted-foreground" />
            <span class="shrink-0 text-muted-foreground">ISP</span>
            <span class="truncate font-medium">{{ displayOrg }}</span>
          </div>
          <div class="flex min-w-0 items-center gap-2">
            <Icon icon="icon-park-outline:time" :width="13" :height="13" class="shrink-0 text-muted-foreground" />
            <span class="shrink-0 text-muted-foreground">时间</span>
            <span class="truncate font-medium">{{ formatDate() }}</span>
          </div>
        </div>
        <div class="flex items-center justify-between gap-3 border-t border-black/6 pt-2 dark:border-white/10">
          <span class="truncate text-[11px] text-muted-foreground">{{ visitorStatusText }}</span>
          <button
            type="button"
            class="inline-flex size-5 shrink-0 items-center justify-center rounded-full
                   text-muted-foreground transition-colors hover:bg-black/6 hover:text-foreground dark:hover:bg-white/10"
            aria-label="收起访客详情"
            aria-expanded="true"
            @click.stop="toggleDetail(false)"
          >
            <Icon icon="icon-park-outline:down" :width="12" :height="12" />
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}
</style>
