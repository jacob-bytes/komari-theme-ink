<script setup lang="ts">
import type { BlueprintData } from './types'
import { ref } from 'vue'
import BlueprintGa from './BlueprintGa.vue'
import BlueprintSchedule from './BlueprintSchedule.vue'
import BlueprintTitleBlock from './BlueprintTitleBlock.vue'
import BlueprintZoneSheet from './BlueprintZoneSheet.vue'
import './blueprint.css'

const props = defineProps<{ data: BlueprintData }>()

const drilledZone = ref<string | null>(null)

const today = new Date().toISOString().slice(0, 10)

const multiZone = () => props.data.zones.length > 1

function onDrill(zone: string) {
  drilledZone.value = zone
}

/** 分区图/设备表点击：滚动到设备表对应行并短暂高亮 */
function onOpen(uuid: string) {
  const row = document.querySelector<HTMLElement>(`table.bp-sched tbody tr[data-host="${uuid}"]`)
  if (!row)
    return
  row.scrollIntoView({ behavior: 'smooth', block: 'center' })
  row.classList.add('bp-focus')
  window.setTimeout(() => row.classList.remove('bp-focus'), 1800)
}
</script>

<template>
  <div class="bp-root">
    <div class="bp-ref t" style="left:25%">
      B
    </div>
    <div class="bp-ref t" style="left:50%">
      C
    </div>
    <div class="bp-ref t" style="left:75%">
      D
    </div>
    <div class="bp-ref b" style="left:25%">
      B
    </div>
    <div class="bp-ref b" style="left:50%">
      C
    </div>
    <div class="bp-ref b" style="left:75%">
      D
    </div>
    <div class="bp-ref l" style="top:25%">
      2
    </div>
    <div class="bp-ref l" style="top:50%">
      3
    </div>
    <div class="bp-ref l" style="top:75%">
      4
    </div>
    <div class="bp-ref r" style="top:25%">
      2
    </div>
    <div class="bp-ref r" style="top:50%">
      3
    </div>
    <div class="bp-ref r" style="top:75%">
      4
    </div>

    <header>
      <div class="bp-head-l">
        <h1>基础设施蓝图</h1>
        <div class="bp-sub">
          KOMARI INFRASTRUCTURE · 服务器监控总图
        </div>
      </div>
      <div class="bp-head-r">
        图号 <b>KOM-26-001</b> · 版本 <b>C</b> · {{ today }}<br>
        比例 1:1 · 单位 % / ms
      </div>
    </header>

    <div class="bp-sect">
      <span class="bp-no">DWG-01</span><h2>拓扑总图</h2><span class="bp-rule" />
    </div>
    <BlueprintGa :data="data" @drill="onDrill" />

    <template v-if="multiZone()">
      <div class="bp-sect">
        <span class="bp-no">DWG-01-01…</span><h2>分区图</h2><span class="bp-rule" /><span class="bp-sub" style="letter-spacing:.1em">点击总图分区下钻 · 异常分区默认展开</span>
      </div>
      <BlueprintZoneSheet :data="data" :drilled-zone="drilledZone" @open="onOpen" />
    </template>

    <div class="bp-sect">
      <span class="bp-no">DWG-02</span><h2>设备表</h2><span class="bp-rule" />
    </div>
    <BlueprintSchedule :data="data" @open="onOpen" />

    <BlueprintTitleBlock :data="data" />

    <div class="bp-fine">
      <span>—— 本图纸由 Komari Monitor 自动绘制</span>
      <span>线断,即机失联</span>
    </div>
  </div>
</template>
