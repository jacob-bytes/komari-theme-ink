<script setup lang="ts">
import type { BlueprintData } from './types'
import { computed } from 'vue'

const props = defineProps<{ data: BlueprintData }>()

const today = new Date().toISOString().slice(0, 10)

const totalSheets = computed(() => 2 + props.data.zones.length)

const hasWarn = computed(() => props.data.totals.warn > 0)

const revisionRows = computed(() => {
  const rows: { rev: string, date: string, desc: string }[] = [
    { rev: 'A', date: today, desc: `首次发行 · ${props.data.flat.length} 台 · ${props.data.zones.length} 分区` },
  ]
  let i = 0
  for (const n of props.data.flat) {
    if (n.status === 'warn') {
      rows.unshift({ rev: letter(++i), date: today, desc: `${n.tag} 负载偏高 · 增补修订云线` })
    }
  }
  for (const n of props.data.flat) {
    if (n.status === 'offline') {
      rows.unshift({ rev: letter(++i), date: today, desc: `${n.tag} 信号中断 · 盖作废章` })
    }
  }
  return rows
})

function letter(i: number): string {
  return String.fromCharCode(64 + i)
}
</script>

<template>
  <footer class="bp-foot">
    <div class="bp-rev">
      <table>
        <caption>修订记录</caption>
        <thead>
          <tr><th>版本</th><th>日期</th><th>说明</th></tr>
        </thead>
        <tbody>
          <tr v-for="r in revisionRows" :key="r.rev">
            <td>{{ r.rev }}</td><td>{{ r.date }}</td><td>{{ r.desc }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div>
      <table class="bp-tblock">
        <tbody>
          <tr>
            <td class="bp-k">
              图名
            </td><td class="bp-v" colspan="3">
              KOMARI 基础设施监控
            </td>
          </tr>
          <tr>
            <td class="bp-k">
              图号
            </td><td class="bp-v">
              KOM-26-001
            </td>
            <td class="bp-k">
              版本
            </td><td class="bp-v">
              C
            </td>
          </tr>
          <tr>
            <td class="bp-k">
              日期
            </td><td class="bp-v">
              {{ today }}
            </td>
            <td class="bp-k">
              比例
            </td><td class="bp-v">
              1:1
            </td>
          </tr>
          <tr>
            <td class="bp-k">
              绘制
            </td><td class="bp-v">
              KOMARI 自动绘制
            </td>
            <td class="bp-k">
              张次
            </td><td class="bp-v">
              第 1 张 / 共 {{ totalSheets }} 张
            </td>
          </tr>
          <tr>
            <td class="bp-k">
              审核
            </td>
            <td class="bp-v" colspan="3">
              <span v-if="hasWarn" class="bp-stamp">有告警 · 待复测</span>
              <span v-else class="bp-stamp ok">审核通过</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </footer>
</template>
