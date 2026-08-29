<script setup lang="ts">
import type { BlueprintData, BlueprintNode } from './types'
import { computed } from 'vue'

const props = defineProps<{ data: BlueprintData }>()
const emit = defineEmits<{ (e: 'open', uuid: string): void }>()

function osShort(n: BlueprintNode): string {
  return n.os.replace(' LTS', '').replace(' Linux', '')
}

function hot(v: number): string {
  if (v >= 85)
    return 'bp-bad'
  if (v >= 70)
    return 'bp-hot'
  return ''
}

/** B/s → 自适应单位（G/M/K）显示，避免设备表出现原始字节整数 */
function fmtNet(v: number): string {
  if (v >= 1024 ** 3)
    return `${(v / 1024 ** 3).toFixed(1)}G`
  if (v >= 1024 ** 2)
    return `${(v / 1024 ** 2).toFixed(1)}M`
  if (v >= 1024)
    return `${(v / 1024).toFixed(0)}K`
  return `${Math.round(v)}`
}

function stamp(n: BlueprintNode): string {
  if (n.status === 'offline')
    return `<span class="bp-stamp">已离线</span>`
  if (n.status === 'warn')
    return `<span class="bp-stamp">负载偏高</span>`
  return `<span class="bp-stamp ok">正常</span>`
}

function schedRow(n: BlueprintNode): string {
  if (n.status === 'offline') {
    return `<tr class="bp-off bp-link" data-host="${n.uuid}"><td>${n.tag}</td><td>${n.host}</td><td>${n.region}</td><td>${osShort(n)}</td><td class="bp-num">—</td><td class="bp-num">—</td><td class="bp-num">—<br><span style="font-size:9px">${n.diskText}</span></td><td class="bp-num">—</td><td class="bp-num">—</td><td>${stamp(n)}</td></tr>`
  }
  return `<tr class="bp-link" data-host="${n.uuid}">
    <td>${n.tag}</td><td>${n.host}</td><td>${n.region}</td><td>${osShort(n)}</td>
    <td class="bp-num ${hot(n.cpu)}">${n.cpu}</td>
    <td class="bp-num ${hot(n.mem)}">${n.mem}</td>
    <td class="bp-num ${hot(n.disk)}">${n.disk}<br><span style="font-size:9px;color:var(--bp-faint)">${n.diskText}</span></td>
    <td class="bp-num">↓${fmtNet(n.netIn)} / ↑${fmtNet(n.netOut)}</td>
    <td class="bp-num ${n.ping != null && n.ping >= 150 ? 'bp-hot' : ''}">${n.ping ?? '—'}</td>
    <td>${stamp(n)}</td>
  </tr>`
}

const body = computed(() => {
  const { flat } = props.data
  if (props.data.zones.length <= 1)
    return flat.map(schedRow).join('')
  // 多分区:按 group 分节
  const grouped = new Map<string, BlueprintNode[]>()
  const ungrouped: BlueprintNode[] = []
  for (const n of flat) {
    if (n.group) {
      const g = grouped.get(n.group) ?? []
      g.push(n)
      grouped.set(n.group, g)
    }
    else {
      ungrouped.push(n)
    }
  }
  const secs: { label: string, items: BlueprintNode[] }[] = [
    ...Array.from(grouped.entries()).map(([label, items]) => ({ label, items })),
  ]
  if (ungrouped.length)
    secs.push({ label: '未分组', items: ungrouped })
  return secs.map((sec) => {
    const online = sec.items.filter(n => n.status !== 'offline').length
    const warn = sec.items.filter(n => n.status === 'warn').length
    const off = sec.items.length - online
    return `<tr class="bp-gsec"><td colspan="10">▉ ${sec.label} · ${sec.items.length} 台 · 正常 ${online} · 告警 ${warn} · 离线 ${off}</td></tr>${
      sec.items.map(schedRow).join('')}`
  }).join('')
})

function onClick(e: Event) {
  const t = (e.target as Element).closest('[data-host]')
  if (t)
    emit('open', (t as HTMLElement).dataset.host!)
}
</script>

<template>
  <div class="bp-tablewrap">
    <table class="bp-sched">
      <thead>
        <tr>
          <th>位号</th>
          <th>主机</th>
          <th>区域</th>
          <th>系统</th>
          <th class="bp-num">
            CPU%
          </th>
          <th class="bp-num">
            内存%
          </th>
          <th class="bp-num">
            硬盘%
          </th>
          <th class="bp-num">
            网络 ↓/↑ MB/s
          </th>
          <th class="bp-num">
            延迟 ms
          </th>
          <th>状态</th>
        </tr>
      </thead>
      <tbody @click="onClick" v-html="body" />
    </table>
  </div>
</template>
